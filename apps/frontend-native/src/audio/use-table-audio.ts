import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import { useForeground } from "../network/use-foreground";
import { tableSoundEvents, type TableAudioFrame, type TableSound } from "./table-sound-events";
import { tablePlaySources, tableSounds } from "./table-sounds";

const preferenceKey = "big-two-native-sound-enabled";
const playerOptions = { downloadFirst: true };

export function useTableAudio(frame: TableAudioFrame) {
  const select = useAudioPlayer(tableSounds.select.source, playerOptions);
  const deselect = useAudioPlayer(tableSounds.deselect.source, playerOptions);
  const play = useAudioPlayer(tableSounds.play.source, playerOptions);
  const playTwo = useAudioPlayer(tablePlaySources[1], playerOptions);
  const playThree = useAudioPlayer(tablePlaySources[2], playerOptions);
  const playFour = useAudioPlayer(tablePlaySources[3], playerOptions);
  const deal = useAudioPlayer(tableSounds.deal.source, playerOptions);
  const turn = useAudioPlayer(tableSounds.turn.source, playerOptions);
  const players = useMemo(
    () => ({
      select: [select],
      deselect: [deselect],
      play: [play, playTwo, playThree, playFour],
      deal: [deal],
      turn: [turn],
    }),
    [select, deselect, play, playTwo, playThree, playFour, deal, turn],
  );
  const foreground = useForeground();
  const [enabled, setEnabled] = useState(false);
  const [preferenceReady, setPreferenceReady] = useState(false);
  const available = frame.ready && foreground;
  const access = useRef({ enabled: false, available, configured: false });
  access.current.available = available;
  const generation = useRef(0);
  const selectionGeneration = useRef(0);
  const placementGeneration = useRef(0);
  const placementIndex = useRef(0);
  const previous = useRef<TableAudioFrame | undefined>(undefined);
  const pendingTurn = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stop = useCallback(() => {
    generation.current++;
    if (pendingTurn.current !== undefined) clearTimeout(pendingTurn.current);
    pendingTurn.current = undefined;
    for (const player of Object.values(players).flat()) {
      try {
        player.pause();
      } catch {
        // Audio is optional; an interrupted/released player must not affect the game.
      }
    }
  }, [players]);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(preferenceKey)
      .catch(() => null)
      .then((value) => {
        if (!mounted) return;
        access.current.enabled = value !== "false";
        setEnabled(access.current.enabled);
        setPreferenceReady(true);
      });
    for (const sound of Object.keys(players) as TableSound[])
      for (const player of players[sound]) player.volume = tableSounds[sound].volume;
    void setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: false,
      shouldPlayInBackground: false,
      interruptionMode: "mixWithOthers",
    })
      .then(() => {
        if (mounted) access.current.configured = true;
      })
      .catch(() => undefined);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") stop();
    });
    return () => {
      mounted = false;
      access.current.enabled = false;
      access.current.configured = false;
      subscription.remove();
      stop();
      // useAudioPlayer releases the native players on unmount.
    };
  }, [players, stop]);

  const playSound = useCallback(
    (sound: TableSound) => {
      const turnKey = previous.current?.turnKey;
      const allowed = () =>
        access.current.enabled &&
        access.current.available &&
        access.current.configured &&
        AppState.currentState === "active" &&
        (sound !== "turn" || (previous.current?.yourTurn && previous.current.turnKey === turnKey));
      const placement = sound === "play";
      const player = players[sound][placement ? placementIndex.current : 0];
      // Android's isLoaded getter is false at EOF; its status still marks the source loaded.
      if (!allowed() || !player.currentStatus.isLoaded) return;
      const token = generation.current;
      const selection = sound === "select" || sound === "deselect";
      const selectionToken = selection ? ++selectionGeneration.current : 0;
      const placementToken = placement ? ++placementGeneration.current : 0;
      void (async () => {
        if (selection) {
          select.pause();
          deselect.pause();
        } else if (placement) {
          for (const variant of players.play) variant.pause();
        } else player.pause();
        await player.seekTo(0, 0, 0);
        if (
          allowed() &&
          generation.current === token &&
          (!selection || selectionGeneration.current === selectionToken) &&
          (!placement || placementGeneration.current === placementToken)
        ) {
          // Resolving a downloaded asset may replace the underlying media player.
          player.volume = tableSounds[sound].volume;
          player.play();
          if (placement)
            placementIndex.current = (placementIndex.current + 1) % players.play.length;
        }
      })().catch(() => undefined);
    },
    [players, select, deselect],
  );

  useEffect(() => {
    const current = { ...frame, ready: available };
    const before = previous.current;
    previous.current = current;
    if (before && before.identity !== current.identity) placementIndex.current = 0;
    if (!available || (before && before.identity !== current.identity)) stop();
    if (!current.yourTurn || before?.turnKey !== current.turnKey) {
      if (pendingTurn.current !== undefined) clearTimeout(pendingTurn.current);
      pendingTurn.current = undefined;
    }
    if (!access.current.enabled || !access.current.configured) return;
    const sounds = tableSoundEvents(before, current);
    for (const sound of sounds) {
      if (sound === "turn" && (sounds.includes("play") || sounds.includes("deal"))) {
        pendingTurn.current = setTimeout(
          () => {
            pendingTurn.current = undefined;
            playSound("turn");
          },
          sounds.includes("deal") ? 600 : 280,
        );
      } else playSound(sound);
    }
  });

  const setSoundEnabled = useCallback(
    (value: boolean) => {
      access.current.enabled = value;
      setEnabled(value);
      if (!value) stop();
      void AsyncStorage.setItem(preferenceKey, String(value)).catch(() => undefined);
    },
    [stop],
  );
  return { enabled, preferenceReady, setSoundEnabled, playSound };
}
