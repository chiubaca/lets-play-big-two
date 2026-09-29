import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";

const android = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../android/${path}`, import.meta.url)), "utf8");
const publicFile = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../public/${path}`, import.meta.url)), "utf8");

it("keeps notification delegation in the Bubblewrap source and generated wrapper", () => {
  const config = JSON.parse(android("twa-manifest.json"));
  expect(config.enableNotifications).toBe(true);
  expect(config.appVersionCode).toBeGreaterThan(1); // The Play internal track already has version 1.
  expect(android("app/build.gradle")).toMatch(/enableNotifications: true/);
  expect(android("app/src/main/AndroidManifest.xml")).toContain(
    "android.permission.POST_NOTIFICATIONS",
  );
  expect(android("app/src/main/AndroidManifest.xml")).toContain(
    "android.support.customtabs.trusted.TRUSTED_WEB_ACTIVITY_SERVICE",
  );
  expect(android("app/src/main/AndroidManifest.xml")).toContain(
    "com.google.androidbrowserhelper.trusted.NotificationPermissionRequestActivity",
  );
  expect(android("app/src/main/AndroidManifest.xml")).toContain(
    'android:enabled="@bool/enableNotification"',
  );
  expect(android("app/src/main/AndroidManifest.xml")).toContain(
    'android:exported="@bool/enableNotification"',
  );
});

it("serves an asset link for the upload and every Play signing fingerprint", () => {
  const config = JSON.parse(android("twa-manifest.json"));
  const links = JSON.parse(publicFile(".well-known/assetlinks.json"));
  expect(links).toContainEqual({
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: config.packageId,
      sha256_cert_fingerprints: config.fingerprints.map(({ value }: { value: string }) => value),
    },
  });
  expect(config.host).toBe("big-two.chiubaca.com");
  expect(android("app/src/main/AndroidManifest.xml")).toContain('android:autoVerify="true"');
  expect(android("app/src/main/res/values/strings.xml")).toContain(
    '\\"site\\": \\"https://big-two.chiubaca.com\\"',
  );
});
