// Open the native Profile / Page / Member story (Reduce Motion off), then run:
// node agent/check-native-profile-card-performance.mjs
// Coordinates are physical Android pixels; override for another device/card size.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { setTimeout } from "node:timers/promises";

const { values } = parseArgs({
  options: {
    app: { type: "string", default: "com.chiubaca.bigtwocrew.dev" },
    serial: { type: "string" },
    start: { type: "string", default: "220,900" },
    end: { type: "string", default: "900,1150" },
    duration: { type: "string", default: "1200" },
    zoom: { type: "boolean", default: false },
    tap: { type: "string", default: "760,1120" },
    close: { type: "string", default: "980,225" },
    phase: { type: "string", default: "both" },
  },
});
const sdkAdb = join(homedir(), "Library/Android/sdk/platform-tools/adb");
const adb = existsSync(sdkAdb) ? sdkAdb : "adb";
const device = values.serial ? ["-s", values.serial] : [];
const run = (...args) => execFileSync(adb, [...device, ...args], { encoding: "utf8" });
const activity = run("shell", "dumpsys", "activity", "activities");
if (
  !activity.includes(`topResumedActivity=ActivityRecord{`) ||
  !activity.match(/topResumedActivity=.*\n/)?.[0].includes(`${values.app}/`)
) {
  throw new Error(`Open ${values.app}'s profile card before benchmarking.`);
}

const start = values.start.split(",");
const end = values.end.split(",");
const snapshots = [];
const sample = () => run("shell", "dumpsys", "gfxinfo", values.app, "framestats");
run("shell", "dumpsys", "gfxinfo", values.app, "reset");
const initialWindows = [
  ...sample().matchAll(/android\.view\.ViewRootImpl@(\w+)[^\n]*\(visibility=/g),
].map((match) => match[1]);
if (values.zoom) {
  if (values.phase !== "close") {
    run("shell", "input", "tap", ...values.tap.split(","));
    await setTimeout(2500);
    snapshots.push(sample());
  }
  if (values.phase !== "open") {
    run("shell", "input", "tap", ...values.close.split(","));
    // Android discards a modal's frame rows when its native window is removed.
    // Retain a sample during the return, not just the surviving profile window.
    await setTimeout(350);
    snapshots.push(sample());
  }
} else {
  for (const [from, to] of [
    [start, end],
    [end, start],
  ]) {
    run("shell", "input", "swipe", ...from, ...to, values.duration);
  }
}
await setTimeout(800);
const stats = sample();
const frames = Number(stats.match(/Total frames rendered: (\d+)/)?.[1]);
const jankyPercent = Number(stats.match(/Janky frames: \d+ \(([\d.]+)%\)/)?.[1]);
// Gfxinfo's summary measures end-to-end pipeline latency, not frame cadence:
// a buffered 60fps renderer can legitimately finish a frame after 16.67ms.
const p90FrameLatencyMs = Number(stats.match(/90th percentile: (\d+)ms/)?.[1]);
// Keep each native window's timeline separate: interleaving a 30fps modal with
// the profile's 60fps frames would incorrectly report a smooth transition.
const windows = new Map();
for (const snapshot of snapshots.concat(stats)) {
  const since = Number(snapshot.match(/Stats since: (\d+)ns/)?.[1]);
  for (const section of snapshot.matchAll(
    /android\.view\.ViewRootImpl@(\w+)[^\n]*\n[\s\S]*?---PROFILEDATA---([\s\S]*?)---PROFILEDATA---/g,
  )) {
    const [header, ...rows] = section[2].trim().split("\n");
    const keys = header.split(",");
    const ticks = windows.get(section[1]) ?? new Set();
    for (const row of rows) {
      const frame = Object.fromEntries(
        row.split(",").map((value, index) => [keys[index], Number(value)]),
      );
      if (frame.Flags === 0 && frame.Vsync >= since) ticks.add(frame.Vsync);
    }
    windows.set(section[1], ticks);
  }
}
const measuredWindows = [...windows.entries()].filter(
  ([id]) =>
    !values.zoom ||
    (values.phase === "close" ? id === initialWindows.at(-1) : !initialWindows.includes(id)),
);
const windowIntervals = measuredWindows.map(([, vsyncs]) => {
  const ticks = [...vsyncs].sort((a, b) => a - b);
  return (
    ticks
      .slice(1)
      .map((tick, index) => (tick - ticks[index]) / 1e6)
      // Exclude idle gaps between adb commands. The minimum rendered frame count
      // still makes stopped/slow animations fail instead of rewarding inactivity.
      .filter((ms) => ms > 0 && ms < 100)
      .sort((a, b) => a - b)
  );
});
const intervals = windowIntervals.flat().sort((a, b) => a - b);
const activeCadences = windowIntervals
  .filter((window) => window.length >= 10)
  .map((window) => window[Math.ceil(window.length * 0.9) - 1]);
const p90CadenceMs = activeCadences.length ? Math.max(...activeCadences) : Infinity;
const medianFps = 1000 / (intervals[Math.floor(intervals.length / 2)] ?? Infinity);
const animatedDuration = values.zoom
  ? values.phase === "open"
    ? 850
    : values.phase === "close"
      ? 650
      : 850 + 650
  : Number(values.duration) * 2;
const minimumFrames = Math.floor((animatedDuration / (1000 / 60)) * 0.8);
const pass =
  frames >= minimumFrames &&
  intervals.length >= Math.min(30, minimumFrames / 2) &&
  jankyPercent <= 5 &&
  p90CadenceMs <= 17;
console.log(
  JSON.stringify(
    { pass, frames, minimumFrames, jankyPercent, medianFps, p90CadenceMs, p90FrameLatencyMs },
    null,
    2,
  ),
);
if (!pass) process.exitCode = 1;
