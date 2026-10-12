import { expect, it } from "vite-plus/test";
import { verifyDevelopmentApk } from "./native-dev-apk.mjs";

const badging =
  "package: name='com.chiubaca.bigtwocrew.dev' versionCode='9'\n" +
  "application-label:'Big Two Crew Dev'\napplication-debuggable\n";
const manifest = 'A: android:scheme="bigtwocrew-dev"';

it("allows only a distinctly named, debuggable development package", () => {
  expect(() => verifyDevelopmentApk(badging, manifest)).not.toThrow();
  for (const unsafe of [
    badging.replace("bigtwocrew.dev", "bigtwocrew"),
    badging.replace("Big Two Crew Dev", "Big Two Crew"),
    badging.replace("application-debuggable", ""),
  ]) {
    expect(() => verifyDevelopmentApk(unsafe, manifest)).toThrow("isolated from production");
  }
});

it("rejects APKs that claim production schemes or room links", () => {
  for (const unsafe of [
    'A: android:scheme="bigtwocrew"',
    `${manifest}\nA: android:scheme="bigtwocrew"`,
    `${manifest}\nA: android:host="big-two.chiubaca.com"`,
  ]) {
    expect(() => verifyDevelopmentApk(badging, unsafe)).toThrow("isolated from production");
  }
});
