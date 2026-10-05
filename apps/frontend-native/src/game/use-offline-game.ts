import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { GameEvent } from "@big-two/game-state-machine";
import { getLocalSeats, type OfflineGameConfig, type OfflineMode } from "./game-helpers";
import { createInitialGameView, OfflineGameSession } from "./offline-game-session";

/** Automatically resumes the saved table for this mode; pass-and-play resumes with every hand hidden. */
export function useOfflineGame(mode: OfflineMode = "solo", config?: OfflineGameConfig) {
  const configKey = JSON.stringify(
    getLocalSeats(mode, config).map(({ name, isBot }) => ({ name, isBot })),
  );
  const sessionRef = useRef<OfflineGameSession | null>(null);
  const [state, setState] = useState<{
    mode: OfflineMode;
    configKey: string;
    view: ReturnType<typeof createInitialGameView>;
  }>(() => ({
    mode,
    configKey,
    view: createInitialGameView(),
  }));

  useEffect(() => {
    const sessionConfig: OfflineGameConfig = { players: JSON.parse(configKey) };
    const session = new OfflineGameSession(
      mode,
      AsyncStorage,
      AppState.currentState === "active",
      sessionConfig,
    );
    sessionRef.current = session;
    setState({ mode, configKey, view: session.getView() });
    const unsubscribe = session.subscribe((view) => setState({ mode, configKey, view }));
    const appStateSubscription = AppState.addEventListener("change", (next) =>
      session.setActive(next === "active"),
    );
    void session.initialize();
    return () => {
      appStateSubscription.remove();
      unsubscribe();
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [mode, configKey]);

  const send = useCallback((event: GameEvent) => sessionRef.current?.send(event), []);
  const reset = useCallback(() => sessionRef.current?.reset(), []);
  const revealHand = useCallback(() => sessionRef.current?.revealHand(), []);
  const requestHint = useCallback(() => sessionRef.current?.requestHint() ?? null, []);

  // Do not render a previous mode's exposed hand while React is switching effects.
  const view =
    state.mode === mode && state.configKey === configKey ? state.view : createInitialGameView();
  return { ...view, send, reset, redeal: reset, revealHand, requestHint };
}
