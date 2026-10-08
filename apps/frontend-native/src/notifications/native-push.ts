import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { digestStringAsync, CryptoDigestAlgorithm } from "expo-crypto";
import { BACKEND_URL, NATIVE_ORIGIN } from "../network/config";
import { createRequest } from "../network/request";
import { createTurnDevice, type DeviceInstall, type PushPlatform } from "./turn-device";

const storageKey = `big-two-turn-install-${BACKEND_URL.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
const projectId = () =>
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
const firebaseSetupMessage =
  "Android push notifications need Firebase configuration. Set GOOGLE_SERVICES_JSON, then prebuild and rebuild the Android app.";
const allowed = (permission: Notifications.NotificationPermissionsStatus) =>
  permission.granted ||
  permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
  permission.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL;

export const pushPlatform: PushPlatform = {
  unavailable: () =>
    Platform.OS === "web"
      ? "Use the web app for browser notifications."
      : !projectId()
        ? "Push notifications need an EAS project ID in this build."
        : Constants.appOwnership === "expo"
          ? "Use a development or release build, not Expo Go."
          : Platform.OS === "android" && !Constants.expoConfig?.android?.googleServicesFile
            ? firebaseSetupMessage
            : undefined,
  async permission(request) {
    if (request && Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("turns", {
        name: "Your turn",
        importance: Notifications.AndroidImportance.HIGH,
        // Omitting sound uses the system default; a string is a custom asset filename.
      });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (request && !allowed(permission) && permission.canAskAgain)
      permission = await Notifications.requestPermissionsAsync();
    const channel =
      Platform.OS === "android" ? await Notifications.getNotificationChannelAsync("turns") : null;
    return {
      allowed:
        allowed(permission) &&
        (Platform.OS !== "android" ||
          (channel !== null && channel.importance !== Notifications.AndroidImportance.NONE)),
      canAskAgain:
        permission.canAskAgain && channel?.importance !== Notifications.AndroidImportance.NONE,
    };
  },
  async token() {
    try {
      return (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;
    } catch (cause) {
      // Metro can serve updated config to a binary built before Firebase was configured.
      if (
        Platform.OS === "android" &&
        cause instanceof Error &&
        cause.message.includes("Unable to get Firebase Messaging instance")
      )
        throw new Error(firebaseSetupMessage);
      throw cause;
    }
  },
  hash: (address) => digestStringAsync(CryptoDigestAlgorithm.SHA256, address),
  async read() {
    const value = await SecureStore.getItemAsync(storageKey);
    if (!value) return null;
    try {
      const data: DeviceInstall = JSON.parse(value);
      return typeof data.token === "string" && /^[a-f0-9]{64}$/.test(data.endpointId) ? data : null;
    } catch {
      return null;
    }
  },
  save: (install) =>
    install
      ? SecureStore.setItemAsync(storageKey, JSON.stringify(install))
      : SecureStore.deleteItemAsync(storageKey),
  dismiss: () => Notifications.dismissAllNotificationsAsync(),
};

export function notificationRequest(cookie: string) {
  return createRequest({ baseURL: BACKEND_URL, origin: NATIVE_ORIGIN, getCookie: () => cookie });
}

export function nativeTurnDevice(cookie: string, current: () => boolean) {
  return createTurnDevice(notificationRequest(cookie), pushPlatform, current);
}
