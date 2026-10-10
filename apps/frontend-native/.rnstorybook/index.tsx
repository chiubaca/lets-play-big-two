import "../src/polyfills";
import { useEffect } from "react";
import { registerRootComponent } from "expo";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { view } from "./storybook.requires";
import { colors } from "../src/ui/theme";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const StorybookUI = view.getStorybookUI({
  initialSelection: { kind: "Game room/Table", name: "Your Turn" },
  storage: {
    getItem: (key) => AsyncStorage.getItem(`storybook:${key}`),
    setItem: (key, value) => AsyncStorage.setItem(`storybook:${key}`, value),
  },
});

function StorybookApp() {
  const [loaded, error] = useFonts({
    Inter: require("../assets/fonts/Inter_400Regular.ttf"),
    InterSemiBold: require("../assets/fonts/Inter_600SemiBold.ttf"),
    Fraunces: require("../assets/fonts/Fraunces_600SemiBold.ttf"),
    IBMPlexMono: require("../assets/fonts/IBMPlexMono-Regular.ttf"),
  });
  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {loaded || error ? (
          <StorybookUI />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.gold} />
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

registerRootComponent(StorybookApp);
export default StorybookApp;
