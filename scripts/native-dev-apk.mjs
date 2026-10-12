import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  symlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function verifyDevelopmentApk(badging, manifest) {
  if (
    !badging.includes("package: name='com.chiubaca.bigtwocrew.dev'") ||
    !badging.includes("application-label:'Big Two Crew Dev'") ||
    !badging.includes("application-debuggable") ||
    !manifest.includes('"bigtwocrew-dev"') ||
    manifest.includes('"bigtwocrew"') ||
    manifest.includes('"big-two.chiubaca.com"')
  ) {
    throw new Error("Refusing to distribute an APK that is not isolated from production.");
  }
}

export function buildDevelopmentApk() {
  const source = join(root, "apps/frontend-native");
  const state = join(root, ".native-dev");
  const sdk =
    process.env.ANDROID_HOME ??
    process.env.ANDROID_SDK_ROOT ??
    join(homedir(), "Library/Android/sdk");
  if (!process.env.JAVA_HOME || !existsSync(join(process.env.JAVA_HOME, "bin/java"))) {
    throw new Error("Set JAVA_HOME to Java 17 first; see apps/frontend-native/README.md.");
  }
  const javaVersion = spawnSync(join(process.env.JAVA_HOME, "bin/java"), ["-version"], {
    encoding: "utf8",
  });
  if (javaVersion.status !== 0 || !/version "17\./.test(javaVersion.stderr)) {
    throw new Error("This native build requires Java 17.");
  }
  const toolsDirectory = join(sdk, "build-tools");
  const version = readdirSync(toolsDirectory)
    .filter((entry) => existsSync(join(toolsDirectory, entry, "aapt")))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .at(-1);
  if (!version) throw new Error("Install Android SDK build-tools first.");
  const tools = join(toolsDirectory, version);
  const env = {
    ...process.env,
    ANDROID_HOME: sdk,
    NODE_ENV: "development",
    EXPO_PUBLIC_APP_VARIANT: "development",
    PATH: `${join(process.env.JAVA_HOME, "bin")}:${process.env.PATH}`,
  };
  if (env.DEV_GOOGLE_SERVICES_JSON) {
    env.DEV_GOOGLE_SERVICES_JSON = resolve(source, env.DEV_GOOGLE_SERVICES_JSON);
  }

  // Generate only in a fresh, ignored project: never rewrite production native folders.
  mkdirSync(state, { recursive: true });
  const project = mkdtempSync(join(state, "apk-project-"));
  for (const name of ["package.json", "app.config.ts", "index.ts"]) {
    copyFileSync(join(source, name), join(project, name));
  }
  for (const name of ["node_modules", "assets", "src", "App.tsx"]) {
    symlinkSync(join(source, name), join(project, name));
  }

  function run(command, args, capture = false) {
    const result = spawnSync(command, args, {
      cwd: project,
      env,
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`${command} failed (${result.status ?? result.signal}).`);
    return result.stdout;
  }

  run("vp", [
    "exec",
    join(source, "node_modules/.bin/expo"),
    "prebuild",
    "--platform",
    "android",
    "--no-clean",
    "--no-install",
  ]);
  run("vp", [
    "exec",
    "./android/gradlew",
    "-p",
    "android",
    ":app:assembleDebug",
    "-PreactNativeArchitectures=arm64-v8a",
    "--console=plain",
  ]);
  const apk = join(project, "android/app/build/outputs/apk/debug/app-debug.apk");
  const badging = run(join(tools, "aapt"), ["dump", "badging", apk], true);
  const manifest = run(join(tools, "aapt"), ["dump", "xmltree", apk, "AndroidManifest.xml"], true);
  verifyDevelopmentApk(badging, manifest);
  run(join(tools, "apksigner"), ["verify", "--verbose", apk]);

  const outputDirectory = join(state, "apks");
  mkdirSync(outputDirectory, { recursive: true });
  const output = join(outputDirectory, "BigTwoCrew-Dev.apk");
  copyFileSync(apk, output);
  console.log(`\nVerified development APK: ${output}`);
  console.log("App ID: com.chiubaca.bigtwocrew.dev; no app was installed or uninstalled.");
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    buildDevelopmentApk();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
