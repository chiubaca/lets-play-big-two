import type { ExpoConfig } from "expo/config";

const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? "feb26247-9b9f-4d68-b9a3-760409a03453";

const config: ExpoConfig = {
  name: "Big Two Crew",
  owner: "chiubaca",
  slug: "lets-play-big-two",
  version: "1.1.3",
  // Bump the app version and rebuild whenever native dependencies/configuration change.
  runtimeVersion: { policy: "appVersion" },
  updates: {
    url: `https://u.expo.dev/${projectId}`,
    // EAS Build supplies this from eas.json. Local release builds opt in explicitly.
    ...(process.env.EXPO_UPDATE_CHANNEL
      ? { requestHeaders: { "expo-channel-name": process.env.EXPO_UPDATE_CHANNEL } }
      : {}),
  },
  scheme: "bigtwocrew",
  orientation: "default",
  userInterfaceStyle: "dark",
  backgroundColor: "#030e09",
  icon: "./assets/app-icon.png",
  ios: {
    bundleIdentifier: "com.chiubaca.bigtwocrew",
    buildNumber: "1",
    supportsTablet: true,
    associatedDomains: ["applinks:big-two.chiubaca.com"],
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    ...(process.env.GOOGLE_SERVICES_JSON
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
      : {}),
    // Keep the existing Play application ID and increase the latest uploaded versionCode (5).
    package: "com.chiubaca.bigtwocrew",
    versionCode: 6,
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: [{ scheme: "https", host: "big-two.chiubaca.com", pathPrefix: "/room/" }],
      },
    ],
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#030e09",
    },
  },
  plugins: [
    ["expo-notifications", { defaultChannel: "turns", color: "#d6bb75" }],
    "expo-secure-store",
    "expo-web-browser",
    "expo-font",
    [
      "expo-splash-screen",
      {
        image: "./assets/title-logo.png",
        imageWidth: 240,
        backgroundColor: "#030e09",
      },
    ],
  ],
  web: { bundler: "metro", favicon: "./assets/app-icon.png" },
  extra: { eas: { projectId } },
};

export default config;
