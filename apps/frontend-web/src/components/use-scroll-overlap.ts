import { useEffect, type RefObject } from "react";

export function useScrollOverlap(
  pageRef: RefObject<HTMLElement | null>,
  stageRef: RefObject<HTMLElement | null>,
  foregroundRef: RefObject<HTMLElement | null>,
  active = true,
) {
  useEffect(() => {
    const page = pageRef.current;
    const stage = stageRef.current;
    const foreground = foregroundRef.current;
    if (!active || !page || !stage || !foreground) return;

    let frame = 0;
    const update = () => {
      const background = stage.getBoundingClientRect();
      const front = foreground.getBoundingClientRect();
      const overlap = Math.max(
        0,
        Math.min(1, (background.bottom - front.top) / (background.height * 0.85)),
      );
      page.style.setProperty("--logo-overlap", String(overlap));
      frame = 0;
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.cancelAnimationFrame(frame);
    };
  }, [active, pageRef, stageRef, foregroundRef]);
}
