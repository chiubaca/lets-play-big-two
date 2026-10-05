import { useEffect, useState } from "react";
import { AppState } from "react-native";

export function useForeground(): boolean {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    // Catch a transition between rendering and installing the listener.
    setActive(AppState.currentState === "active");
    return () => subscription.remove();
  }, []);
  return active;
}
