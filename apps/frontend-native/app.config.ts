import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Big Two Crew",
  slug: "big-two-crew",
  version: "1.1.1",
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
    // Keep the existing Play application ID and increase the latest uploaded versionCode (3).
    package: "com.chiubaca.bigtwocrew",
    versionCode: 4,
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
  ...(process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    ? { extra: { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } } }
    : {}),
};

export default config;
