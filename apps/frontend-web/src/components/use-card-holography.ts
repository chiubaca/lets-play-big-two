import { useEffect, useRef, type PointerEvent } from "react";

export function useCardHolography(enabled: boolean, suspended = false) {
  const ref = useRef<HTMLSpanElement>(null);
  const frame = useRef<number | null>(null);
  const reducedMotion = useRef(false);
  const suspension = useRef(suspended);
  suspension.current = suspended;

  useEffect(() => {
    if (!suspended) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, [suspended]);

  useEffect(() => {
    if (!enabled) {
      ref.current?.removeAttribute("style");
      ref.current?.removeAttribute("data-interacting");
      return;
    }
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => {
      reducedMotion.current = preference.matches;
      if (preference.matches) {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        ref.current?.removeAttribute("style");
        ref.current?.removeAttribute("data-interacting");
      }
    };
    updatePreference();
    preference.addEventListener("change", updatePreference);
    return () => {
      preference.removeEventListener("change", updatePreference);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [enabled]);

  const reset = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const card = ref.current;
    if (!card) return;
    card.removeAttribute("data-interacting");
    card.style.setProperty("--rotate-x", "0deg");
    card.style.setProperty("--rotate-y", "0deg");
  };

  const followPointer = (event: PointerEvent<HTMLSpanElement>) => {
    if (
      !enabled ||
      suspension.current ||
      reducedMotion.current ||
      (event.pointerType === "touch" && event.buttons === 0)
    )
      return;
    const card = ref.current;
    if (!card) return;
    const bounds = card.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (suspension.current || reducedMotion.current) return;
      const tilt = 10;
      card.dataset.interacting = "true";
      card.style.setProperty("--pointer-x", `${x * 100}%`);
      card.style.setProperty("--pointer-y", `${y * 100}%`);
      card.style.setProperty("--foil-x", `${35 + x * 30}%`);
      card.style.setProperty("--foil-y", `${35 + y * 30}%`);
      card.style.setProperty("--rotate-x", `${(0.5 - y) * tilt}deg`);
      card.style.setProperty("--rotate-y", `${(x - 0.5) * tilt}deg`);
    });
  };

  return enabled
    ? {
        ref,
        onPointerMove: followPointer,
        onPointerDown: followPointer,
        onPointerLeave: reset,
        onPointerCancel: reset,
        onPointerUp: (event: PointerEvent<HTMLSpanElement>) => {
          if (event.pointerType !== "mouse") reset();
        },
      }
    : { ref };
}
