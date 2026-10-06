import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion() {
  // Start without motion until the asynchronous accessibility setting is known.
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      changed = true;
      setReduced(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => {
        if (active && !changed) setReduced(value);
      },
      () => {},
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
