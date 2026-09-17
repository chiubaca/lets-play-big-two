import { useCallback, useEffect, useRef, useState } from "react";

type TableSound = "select" | "deselect" | "play" | "turn" | "notice";

export function useTableAudio() {
  const context = useRef<AudioContext | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  useEffect(() => {
    try {
      mutedRef.current = localStorage.getItem("big-two-muted") === "true";
      setMuted(mutedRef.current);
    } catch {
      /* Storage may be unavailable in private browsers. */
    }
    const unlock = () => {
      if (!context.current && typeof AudioContext !== "undefined")
        context.current = new AudioContext();
      void context.current?.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      void context.current?.close();
      context.current = null;
    };
  }, []);
  const playSound = useCallback((sound: TableSound) => {
    const audio = context.current;
    if (mutedRef.current || !audio || audio.state !== "running") return;
    if (sound === "select" || sound === "deselect" || sound === "play") {
      const duration = sound === "play" ? 0.13 : 0.045;
      const buffer = audio.createBuffer(
        1,
        Math.ceil(audio.sampleRate * duration),
        audio.sampleRate,
      );
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      const source = audio.createBufferSource();
      const filter = audio.createBiquadFilter();
      const envelope = audio.createGain();
      source.buffer = buffer;
      filter.type = "bandpass";
      filter.frequency.value = sound === "play" ? 900 : 2600;
      filter.Q.value = 0.7;
      envelope.gain.setValueAtTime(0.001, audio.currentTime);
      envelope.gain.linearRampToValueAtTime(0.18, audio.currentTime + 0.003);
      envelope.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
      source.connect(filter);
      filter.connect(envelope);
      envelope.connect(audio.destination);
      source.start();
      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        envelope.disconnect();
      };
    }
    const notes =
      sound === "turn"
        ? [660, 880, 1100]
        : sound === "notice"
          ? [440, 330]
          : sound === "play"
            ? [180, 100]
            : sound === "select"
              ? [680]
              : [440];
    notes.forEach((frequency, index) => {
      const start = audio.currentTime + index * 0.085;
      const duration = sound === "turn" ? 0.32 : 0.12;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = sound === "play" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency * (sound === "select" ? 1.4 : 0.8),
        start + duration,
      );
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(sound === "turn" ? 0.09 : 0.14, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    });
  }, []);
  const toggleMuted = () => {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
    try {
      localStorage.setItem("big-two-muted", String(mutedRef.current));
    } catch {
      /* Keep the setting for this session. */
    }
    if (!mutedRef.current) playSound("select");
  };
  return { playSound, muted, toggleMuted };
}
