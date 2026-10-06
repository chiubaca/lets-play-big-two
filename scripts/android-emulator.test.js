import { EventEmitter } from "node:events";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { androidTools, ensureAndroidDevice, parseDevices } from "./android-emulator.mjs";

vi.mock("node:child_process", () => ({ spawn: vi.fn(), spawnSync: vi.fn() }));
vi.mock("node:fs", () => ({ existsSync: vi.fn() }));
vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn() }));

const env = { ANDROID_HOME: "/Android SDK" };
const device = "List of devices attached\nemulator-5554\tdevice\n";
let child;
let clock;

beforeEach(() => {
  vi.resetAllMocks();
  clock = 0;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  vi.spyOn(console, "log").mockImplementation(() => {});
  existsSync.mockReturnValue(true);
  child = new EventEmitter();
  child.unref = vi.fn();
  spawn.mockReturnValue(child);
  sleep.mockImplementation(async () => {
    clock += 1000;
  });
  spawnSync.mockImplementation((command, args) => ({
    status: 0,
    stdout: args[0] === "devices" ? device : args[0] === "-list-avds" ? "Pixel\n" : "1\n",
  }));
});

afterEach(() => vi.restoreAllMocks());

describe("Android emulator startup", () => {
  it("resolves SDK overrides and reports missing platform tools", () => {
    expect(androidTools(env).adb).toBe("/Android SDK/platform-tools/adb");
    expect(androidTools({ ANDROID_SDK_ROOT: "/other" }).sdk).toBe("/other");
    expect(androidTools({}).sdk).toMatch(/\/Library\/Android\/sdk$/);
    existsSync.mockReturnValue(false);
    expect(() => androidTools(env)).toThrow("Android Platform Tools not found");
  });

  it("parses connected, offline and unauthorized devices without adb headers", () => {
    expect(parseDevices(`${device}phone\tunauthorized\r\nemulator-5556\toffline\n`)).toEqual([
      { serial: "emulator-5554", state: "device" },
      { serial: "phone", state: "unauthorized" },
      { serial: "emulator-5556", state: "offline" },
    ]);
  });

  it("reuses a running emulator without launching another", async () => {
    expect(await ensureAndroidDevice(env)).toEqual(androidTools(env));
    expect(spawn).not.toHaveBeenCalled();
    expect(spawnSync).toHaveBeenCalledWith(
      "/Android SDK/platform-tools/adb",
      ["-s", "emulator-5554", "shell", "getprop", "sys.boot_completed"],
      expect.any(Object),
    );
  });

  it("reuses a connected phone without requiring emulator tooling", async () => {
    existsSync.mockImplementation((path) => path.endsWith("/adb"));
    spawnSync.mockImplementation((command, args) => ({
      status: 0,
      stdout: args[0] === "devices" ? "phone\tdevice\n" : "1\n",
    }));
    await ensureAndroidDevice(env);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("launches an existing AVD and waits through discovery and boot", async () => {
    let checks = 0;
    let boots = 0;
    spawnSync.mockImplementation((command, args) => ({
      status: 0,
      stdout:
        args[0] === "devices"
          ? ++checks <= 2
            ? "List of devices attached\n"
            : device
          : args[0] === "-list-avds"
            ? "Pixel\nTablet\n"
            : ++boots === 1
              ? "0\n"
              : "1\n",
    }));
    await ensureAndroidDevice({ ...env, NATIVE_DEV_AVD: "Tablet" });
    expect(spawn).toHaveBeenCalledWith("/Android SDK/emulator/emulator", ["-avd", "Tablet"], {
      detached: true,
      stdio: "ignore",
    });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(child.unref).toHaveBeenCalled();
  });

  it("waits for an already booting emulator rather than launching a duplicate", async () => {
    spawnSync.mockReturnValueOnce({ status: 0, stdout: "emulator-5554\toffline\n" });
    spawnSync.mockReturnValueOnce({ status: 1, stdout: "", stderr: "device offline" });
    await ensureAndroidDevice(env);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each([
    ["", undefined, "Create one in Android Studio"],
    ["Pixel\n", "Missing", "Available devices: Pixel"],
  ])("reports missing or invalid AVD selection", async (avds, avd, message) => {
    spawnSync.mockImplementation((command, args) => ({
      status: 0,
      stdout: args[0] === "devices" ? "" : avds,
    }));
    await expect(ensureAndroidDevice({ ...env, NATIVE_DEV_AVD: avd })).rejects.toThrow(message);
    expect(spawn).not.toHaveBeenCalled();
  });

  it("reports missing emulator tooling", async () => {
    existsSync.mockImplementation((path) => path.endsWith("/adb"));
    spawnSync.mockReturnValue({ status: 0, stdout: "" });
    await expect(ensureAndroidDevice(env)).rejects.toThrow("Install Android Emulator");
  });

  it("reports an unauthorized phone instead of launching an emulator", async () => {
    spawnSync.mockReturnValue({ status: 0, stdout: "phone\tunauthorized\n" });
    await expect(ensureAndroidDevice(env)).rejects.toThrow("approve its USB debugging prompt");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("reports adb failures rather than treating them as no devices", async () => {
    spawnSync.mockReturnValue({ status: 1, stderr: "adb failed" });
    await expect(ensureAndroidDevice(env)).rejects.toThrow("adb failed");
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each(["error", "exit"])("reports emulator launch %s promptly", async (event) => {
    spawnSync.mockImplementation((command, args) => ({
      status: 0,
      stdout: args[0] === "devices" ? "" : "Pixel\n",
    }));
    sleep.mockImplementationOnce(async () => {
      child.emit(event, event === "error" ? new Error("Cannot spawn emulator") : 1);
      clock += 1000;
    });
    await expect(ensureAndroidDevice(env)).rejects.toThrow(
      event === "error" ? "Cannot spawn emulator" : "Android emulator exited",
    );
  });

  it("times out rather than waiting indefinitely for Android to boot", async () => {
    spawnSync.mockImplementation((command, args) => ({
      status: 0,
      stdout: args[0] === "devices" ? device : "0\n",
    }));
    await expect(ensureAndroidDevice(env)).rejects.toThrow("within 3 minutes");
    expect(sleep).toHaveBeenCalledTimes(180);
  });
});
