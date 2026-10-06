import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export function androidTools(env = process.env) {
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || join(homedir(), "Library/Android/sdk");
  const adb = join(sdk, "platform-tools/adb");
  const emulator = join(sdk, "emulator/emulator");
  if (!existsSync(adb)) {
    throw new Error(
      `Android Platform Tools not found at ${adb}. Install them in Android Studio's SDK Manager ` +
        "and set ANDROID_HOME if your SDK is elsewhere.",
    );
  }
  return { sdk, adb, emulator };
}

export function parseDevices(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter(([, state]) => ["device", "offline", "unauthorized"].includes(state))
    .map(([serial, state]) => ({ serial, state }));
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 10000 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${result.stderr?.trim() || result.status}`,
    );
  }
  return result.stdout;
}

export async function ensureAndroidDevice(env = process.env) {
  const tools = androidTools(env);
  const devices = () => parseDevices(capture(tools.adb, ["devices"]));
  const connected = devices();
  let target = connected.find((device) => device.serial.startsWith("emulator-"));
  target ??= connected.find((device) => device.state === "device");
  let launchError;

  if (!target) {
    if (connected.some((device) => device.state === "unauthorized")) {
      throw new Error(
        "Unlock your Android device and approve its USB debugging prompt, then retry.",
      );
    }
    if (!existsSync(tools.emulator)) {
      throw new Error("Install Android Emulator in Android Studio's SDK Manager, then retry.");
    }
    const avds = capture(tools.emulator, ["-list-avds"]).trim().split(/\r?\n/).filter(Boolean);
    if (!avds.length) {
      throw new Error(
        "No Android virtual devices found. Create one in Android Studio → Device Manager.",
      );
    }
    const avd = env.NATIVE_DEV_AVD || avds[0];
    if (!avds.includes(avd)) {
      throw new Error(
        `Android virtual device ${avd} not found. Available devices: ${avds.join(", ")}`,
      );
    }
    console.log(`Starting Android emulator: ${avd}`);
    const child = spawn(tools.emulator, ["-avd", avd], { detached: true, stdio: "ignore" });
    child.on("error", (error) => {
      launchError = error;
    });
    child.on("exit", (code) => {
      launchError = new Error(
        `Android emulator exited (${code}). Run ${tools.emulator} -avd ${avd} to see its diagnostics.`,
      );
    });
    // Keep the emulator open when the development services stop.
    child.unref();
  }

  console.log("Waiting for Android to finish booting…");
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    target ??= devices().find((device) => device.serial.startsWith("emulator-"));
    if (target) {
      const boot = spawnSync(
        tools.adb,
        ["-s", target.serial, "shell", "getprop", "sys.boot_completed"],
        {
          encoding: "utf8",
          timeout: 10000,
        },
      );
      if (boot.status === 0 && boot.stdout.trim() === "1") {
        console.log(`Android ready: ${target.serial}`);
        return tools;
      }
    }
    await sleep(1000);
  }
  throw new Error("Android did not finish booting within 3 minutes. Check its window and retry.");
}
