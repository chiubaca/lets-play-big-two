import { beforeEach, expect, it, vi } from "vite-plus/test";
import { nativeTurnDevice, pushPlatform } from "./native-push";

const mocks = vi.hoisted(() => ({
  platform: { OS: "android" },
  constants: {
    expoConfig: {
      android: { googleServicesFile: undefined as string | undefined },
      extra: { eas: { projectId: "project-id" } },
    },
    appOwnership: null as string | null,
  },
  channel: vi.fn(),
  permissions: vi.fn(),
  token: vi.fn(),
  request: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: mocks.platform }));
vi.mock("expo-constants", () => ({ default: mocks.constants }));
vi.mock("expo-notifications", () => ({
  AndroidImportance: { HIGH: 4, NONE: 0 },
  IosAuthorizationStatus: { PROVISIONAL: 3, EPHEMERAL: 4 },
  setNotificationChannelAsync: mocks.channel,
  getNotificationChannelAsync: async () => ({ importance: 4 }),
  getPermissionsAsync: mocks.permissions,
  getExpoPushTokenAsync: mocks.token,
}));
vi.mock("expo-secure-store", () => ({ getItemAsync: async () => null }));
vi.mock("expo-crypto", () => ({ CryptoDigestAlgorithm: { SHA256: "SHA-256" } }));
vi.mock("../network/request", () => ({ createRequest: () => mocks.request }));

const firebaseError =
  "Unable to get Firebase Messaging instance. Did you configure `googleServicesFile` path in app config? " +
  "Make sure to complete the guide at https://docs.expo.dev/push-notifications/fcm-credentials/ : " +
  "Default FirebaseApp is not initialized in this process com.chiubaca.bigtwocrew. " +
  "Make sure to call FirebaseApp.initializeApp(Context) first.";
const setupMessage =
  "Android push notifications need Firebase configuration. Set GOOGLE_SERVICES_JSON, then prebuild and rebuild the Android app.";

beforeEach(() => {
  mocks.platform.OS = "android";
  mocks.constants.expoConfig.android.googleServicesFile = undefined;
  mocks.constants.appOwnership = null;
  mocks.channel.mockReset().mockResolvedValue(null);
  mocks.permissions.mockReset().mockResolvedValue({ granted: true, canAskAgain: true });
  mocks.token.mockReset().mockRejectedValue(new Error(firebaseError));
  mocks.request.mockReset().mockResolvedValue({ registered: false, generation: 0 });
});

it("blocks unconfigured Android enrollment before requesting permission or a Firebase token", async () => {
  const device = nativeTurnDevice("cookie", () => true);
  expect(await device.inspect()).toEqual({
    state: "unavailable",
    generation: 0,
    reason: setupMessage,
  });
  await expect(device.enable(0)).rejects.toThrow(setupMessage);
  expect(mocks.channel).not.toHaveBeenCalled();
  expect(mocks.permissions).not.toHaveBeenCalled();
  expect(mocks.token).not.toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalled();
});

it("explains the rebuild requirement when updated JS runs in a binary without Firebase", async () => {
  mocks.constants.expoConfig.android.googleServicesFile = "./google-services.json";
  await expect(nativeTurnDevice("cookie", () => true).enable(0)).rejects.toThrow(setupMessage);
  expect(mocks.token).toHaveBeenCalledOnce();
  expect(mocks.request).not.toHaveBeenCalled();
});

it("uses Android's default channel sound without treating 'default' as a custom filename", async () => {
  await pushPlatform.permission(true);
  expect(mocks.channel).toHaveBeenCalledWith("turns", { name: "Your turn", importance: 4 });
});

it("does not require Android Firebase configuration for iOS", () => {
  mocks.platform.OS = "ios";
  expect(pushPlatform.unavailable()).toBeUndefined();
});

it("gets configured tokens using the EAS project and preserves unrelated failures", async () => {
  mocks.constants.expoConfig.android.googleServicesFile = "./google-services.json";
  expect(pushPlatform.unavailable()).toBeUndefined();
  mocks.token.mockResolvedValue({ data: "ExpoPushToken[test]" });
  expect(await pushPlatform.token()).toBe("ExpoPushToken[test]");
  expect(mocks.token).toHaveBeenCalledWith({ projectId: "project-id" });
  const error = new Error("Network unavailable");
  mocks.token.mockRejectedValue(error);
  await expect(pushPlatform.token()).rejects.toBe(error);
});
