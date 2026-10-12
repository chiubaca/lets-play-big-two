import type { ExpoConfig } from "expo/config";

const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? "feb26247-9b9f-4d68-b9a3-760409a03453";
const variant = process.env.EXPO_PUBLIC_APP_VARIANT;
if (variant && variant !== "development" && variant !== "production") {
  throw new Error("EXPO_PUBLIC_APP_VARIANT must be development or production.");
}
const isDevelopment = variant === "development";
const applicationId = isDevelopment ? "com.chiubaca.bigtwocrew.dev" : "com.chiubaca.bigtwocrew";
const googleServicesFile = isDevelopment
  ? process.env.DEV_GOOGLE_SERVICES_JSON
  : process.env.GOOGLE_SERVICES_JSON;
const developmentPlugins: ExpoConfig["plugins"] = isDevelopment
  ? [["expo-dev-client", { addGeneratedScheme: false }]]
  : [];

const config: ExpoConfig = {
  name: isDevelopment ? "Big Two Crew Dev" : "Big Two Crew",
  owner: "chiubaca",
  slug: "lets-play-big-two",
  version: "1.1.6",
  // Bump the app version and rebuild whenever native dependencies/configuration change.
  runtimeVersion: { policy: "appVersion" },
  updates: {
    url: `https://u.expo.dev/${projectId}`,
    // EAS Build supplies this from eas.json. Local release builds opt in explicitly.
    ...(process.env.EXPO_UPDATE_CHANNEL
      ? { requestHeaders: { "expo-channel-name": process.env.EXPO_UPDATE_CHANNEL } }
      : {}),
  },
  scheme: isDevelopment ? "bigtwocrew-dev" : "bigtwocrew",
  orientation: "default",
  userInterfaceStyle: "dark",
  backgroundColor: "#030e09",
  icon: "./assets/app-icon.png",
  ios: {
    bundleIdentifier: applicationId,
    buildNumber: "2",
    supportsTablet: true,
    associatedDomains: isDevelopment ? [] : ["applinks:big-two.chiubaca.com"],
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    ...(googleServicesFile ? { googleServicesFile } : {}),
    // Production retains the Play identity; development installs alongside it.
    package: applicationId,
    versionCode: 9,
    intentFilters: isDevelopment
      ? []
      : [
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
    ...developmentPlugins,
    [
      "expo-audio",
      {
        microphonePermission: false,
        recordAudioAndroid: false,
        enableBackgroundPlayback: false,
        enableBackgroundRecording: false,
      },
    ],
    ["expo-notifications", { defaultChannel: "turns", color: "#d6bb75" }],
    "expo-secure-store",
    "expo-web-browser",
    "expo-font",
    [
      "expo-splash-screen",
      {
        image: "./assets/title-logo.png",
        imageWidth: 240,
        // Android masks its 288dp splash canvas to a 192dp-diameter circle.
        android: { imageWidth: 180 },
        backgroundColor: "#030e09",
      },
    ],
  ],
  web: { bundler: "metro", favicon: "./assets/app-icon.png" },
  extra: { eas: { projectId } },
};

export default config;
