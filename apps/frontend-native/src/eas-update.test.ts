import { afterEach, expect, it, vi } from "vite-plus/test";
import profiles from "../eas.json";
import manifest from "../package.json";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function config(projectId?: string, channel?: string) {
  vi.stubEnv("EXPO_PUBLIC_EAS_PROJECT_ID", projectId);
  vi.stubEnv("EXPO_UPDATE_CHANNEL", channel);
  vi.resetModules();
  return (await import("../app.config")).default;
}

it("links push and OTA to the existing EAS project without local environment files", async () => {
  const app = await config();
  expect(app.owner).toBe("chiubaca");
  expect(app.slug).toBe("lets-play-big-two");
  expect(app.extra?.eas.projectId).toBe("feb26247-9b9f-4d68-b9a3-760409a03453");
  expect(app.updates?.url).toBe(`https://u.expo.dev/${app.extra?.eas.projectId}`);
  expect(app.runtimeVersion).toEqual({ policy: "appVersion" });
  expect(app.version).toBe(manifest.version);
  expect(app.updates?.requestHeaders).toBeUndefined();
});

it("keeps an explicit project override consistent for push and updates", async () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const app = await config(projectId);
  expect(app.extra?.eas.projectId).toBe(projectId);
  expect(app.updates?.url).toBe(`https://u.expo.dev/${projectId}`);
});

it("opts local release builds into the selected channel explicitly", async () => {
  const app = await config(undefined, "preview");
  expect(app.updates?.requestHeaders).toEqual({ "expo-channel-name": "preview" });
});

it("separates internal APK updates and their environment from production", () => {
  expect(profiles.build.preview).toMatchObject({
    distribution: "internal",
    channel: "preview",
    environment: "preview",
    android: { buildType: "apk" },
  });
  expect(profiles.build.production).toMatchObject({
    channel: "production",
    environment: "production",
  });
});

it("subscribes Play internal-testing bundles to preview without changing production", () => {
  expect(profiles.build["internal-testing"]).toMatchObject({
    extends: "production",
    credentialsSource: "local",
    distribution: "store",
    channel: "preview",
    environment: "preview",
    android: { buildType: "app-bundle" },
  });
  expect(profiles.build.production.autoIncrement).toBe(true);
  expect(profiles.build.production.channel).toBe("production");
  expect(profiles.build.production.environment).toBe("production");
});
