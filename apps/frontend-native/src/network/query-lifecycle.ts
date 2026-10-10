import { focusManager, onlineManager } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { addNetworkStateListener, getNetworkStateAsync } from "expo-network";

export function useQueryLifecycle() {
  useEffect(() => {
    if (Platform.OS === "web") return;
    focusManager.setFocused(AppState.currentState === "active");
    const focus = AppState.addEventListener("change", (state) =>
      focusManager.setFocused(state === "active"),
    );
    onlineManager.setEventListener((setOnline) => {
      let current = true;
      let received = false;
      const network = addNetworkStateListener((state) => {
        received = true;
        setOnline(!!state.isConnected);
      });
      void getNetworkStateAsync()
        .then((state) => {
          if (current && !received) setOnline(!!state.isConnected);
        })
        .catch(() => {});
      return () => {
        current = false;
        network.remove();
      };
    });
    return () => {
      focus.remove();
      focusManager.setFocused(undefined);
      onlineManager.setEventListener(() => () => {});
    };
  }, []);
}
