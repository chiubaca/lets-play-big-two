import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  backendArgs,
  defaultHostname,
  ensurePortsAvailable,
  main,
  parseTunnels,
  portListeners,
  supervise,
  tunnelConfig,
  validateConfig,
  writeConfig,
} from "./native-dev.mjs";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal()),
  spawnSync: vi.fn(),
}));
vi.mock("node:readline", () => ({ createInterface: vi.fn() }));

const config = {
  hostname: defaultHostname,
  tunnelId: "12345678-1234-1234-1234-123456789abc",
  credentialsFile: "/Users/Developer Name/.cloudflared/tunnel.json",
};
const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
  vi.restoreAllMocks();
  vi.mocked(spawnSync).mockReset();
  vi.mocked(createInterface).mockReset();
});

describe("native development ports", () => {
  function options() {
    vi.spyOn(console, "log").mockImplementation(() => {});
    return {
      listeners: vi.fn(() => []),
      confirm: vi.fn(async () => false),
      kill: vi.fn(),
      wait: vi.fn(async () => {}),
    };
  }

  it("checks only TCP listeners and deduplicates PIDs", () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout: "123\n123\n456\n", stderr: "" });
    expect(portListeners(8788)).toEqual([123, 456]);
    expect(spawnSync).toHaveBeenCalledWith("lsof", ["-nP", "-t", "-iTCP:8788", "-sTCP:LISTEN"], {
      encoding: "utf8",
      timeout: 10000,
    });
  });

  it("accepts lsof's no-match exit but reports inspection failures", () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: "", stderr: "" });
    expect(portListeners(8788)).toEqual([]);
    vi.mocked(spawnSync).mockReturnValue({ status: 1, stdout: "", stderr: "permission denied" });
    expect(() => portListeners(8788)).toThrow("permission denied");
    vi.mocked(spawnSync).mockReturnValue({ error: new Error("lsof missing") });
    expect(() => portListeners(8788)).toThrow("lsof missing");
  });

  it.each(["", "invalid", "0", "1", "-123", String(process.pid)])(
    "refuses unsafe listener output %j",
    (stdout) => {
      vi.mocked(spawnSync).mockReturnValue({ status: 0, stdout, stderr: "" });
      expect(() => portListeners(8788)).toThrow("safely identify");
    },
  );

  it("starts without prompting when both ports are free", async () => {
    const deps = options();
    await ensurePortsAvailable(deps);
    expect(deps.listeners.mock.calls).toEqual([[8788], [8081]]);
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(deps.kill).not.toHaveBeenCalled();
  });

  it("does not kill or continue when confirmation is declined", async () => {
    const deps = options();
    deps.listeners.mockReturnValue([123]);
    await expect(ensurePortsAvailable(deps)).rejects.toThrow("Stop the existing dev server");
    expect(deps.confirm).toHaveBeenCalledWith("Port 8788 is already in use (PID 123).");
    expect(deps.kill).not.toHaveBeenCalled();
  });

  it("requires explicit authorization in non-interactive terminals", async () => {
    const deps = options();
    vi.spyOn(process, "stdin", "get").mockReturnValue({ isTTY: false });
    deps.listeners.mockReturnValue([123]);
    await expect(ensurePortsAvailable({ ...deps, confirm: undefined })).rejects.toThrow(
      "--kill-ports",
    );
    expect(deps.kill).not.toHaveBeenCalled();
  });

  it.each([
    ["y", true],
    [" YES ", true],
    ["", false],
    ["no", false],
  ])("handles the interactive answer %j", async (answer, accepted) => {
    const deps = options();
    vi.spyOn(process, "stdin", "get").mockReturnValue({ isTTY: true });
    vi.spyOn(process, "stdout", "get").mockReturnValue({ isTTY: true });
    const terminal = new EventEmitter();
    terminal.close = vi.fn(() => terminal.emit("close"));
    terminal.question = vi.fn((message, callback) => callback(answer));
    vi.mocked(createInterface).mockReturnValue(terminal);
    deps.listeners.mockReturnValueOnce([123]).mockReturnValueOnce([123]);
    const result = ensurePortsAvailable({ ...deps, confirm: undefined });
    if (accepted) {
      await result;
      expect(deps.kill).toHaveBeenCalledWith(123, "SIGTERM");
    } else {
      await expect(result).rejects.toThrow("Stop the existing dev server");
      expect(deps.kill).not.toHaveBeenCalled();
    }
    expect(terminal.question).toHaveBeenCalledWith(
      expect.stringContaining("[y/N]"),
      expect.any(Function),
    );
    expect(terminal.close).toHaveBeenCalled();
  });

  it("declines on EOF instead of hanging at the prompt", async () => {
    const deps = options();
    vi.spyOn(process, "stdin", "get").mockReturnValue({ isTTY: true });
    vi.spyOn(process, "stdout", "get").mockReturnValue({ isTTY: true });
    const terminal = new EventEmitter();
    terminal.question = vi.fn(() => terminal.emit("close"));
    vi.mocked(createInterface).mockReturnValue(terminal);
    deps.listeners.mockReturnValue([123]);
    await expect(ensurePortsAvailable({ ...deps, confirm: undefined })).rejects.toThrow(
      "Stop the existing dev server",
    );
    expect(deps.kill).not.toHaveBeenCalled();
  });

  it.each([false, true])("clears both ports with killPorts=%s", async (killPorts) => {
    const deps = options();
    deps.confirm.mockResolvedValue(true);
    deps.listeners.mockImplementation((port) =>
      deps.kill.mock.calls.some(([pid]) => pid === port) ? [] : [port],
    );
    await ensurePortsAvailable({ ...deps, killPorts });
    expect(deps.kill.mock.calls).toEqual([
      [8788, "SIGTERM"],
      [8081, "SIGTERM"],
    ]);
    expect(deps.confirm).toHaveBeenCalledTimes(killPorts ? 0 : 2);
  });

  it("escalates only listeners that remain after the grace period", async () => {
    const deps = options();
    deps.listeners.mockImplementation((port) => {
      if (port === 8081 || deps.kill.mock.calls.some(([, signal]) => signal === "SIGKILL"))
        return [];
      return deps.kill.mock.calls.length ? [456] : [123, 456];
    });
    await ensurePortsAvailable({ ...deps, killPorts: true });
    expect(deps.kill.mock.calls).toEqual([
      [123, "SIGTERM"],
      [456, "SIGTERM"],
      [456, "SIGKILL"],
    ]);
    expect(deps.wait).toHaveBeenCalledTimes(21);
  });

  it("does not kill a new listener that takes over a port", async () => {
    const deps = options();
    deps.listeners.mockReturnValueOnce([123]).mockReturnValue([456]);
    await expect(ensurePortsAvailable({ ...deps, killPorts: true })).rejects.toThrow(
      "new listener",
    );
    expect(deps.kill).not.toHaveBeenCalled();
  });

  it("tolerates listeners exiting before the signal arrives", async () => {
    const deps = options();
    deps.listeners.mockReturnValueOnce([123]).mockReturnValueOnce([123]);
    deps.kill.mockImplementation(() => {
      throw Object.assign(new Error("gone"), { code: "ESRCH" });
    });
    await ensurePortsAvailable({ ...deps, killPorts: true });
  });

  it("does not force-kill a replacement listener after SIGTERM", async () => {
    const deps = options();
    deps.listeners.mockImplementation(() => (deps.kill.mock.calls.length ? [456] : [123]));
    await expect(ensurePortsAvailable({ ...deps, killPorts: true })).rejects.toThrow(
      "new listener",
    );
    expect(deps.kill.mock.calls).toEqual([[123, "SIGTERM"]]);
  });

  it("reports signal permission errors and ports that stay occupied", async () => {
    const deps = options();
    deps.listeners.mockReturnValue([123]);
    deps.kill.mockImplementationOnce(() => {
      throw new Error("permission denied");
    });
    await expect(ensurePortsAvailable({ ...deps, killPorts: true })).rejects.toThrow(
      "permission denied",
    );
    await expect(ensurePortsAvailable({ ...deps, killPorts: true })).rejects.toThrow(
      "still in use",
    );
  });

  it("rejects unsupported CLI flags before starting or setting up services", () => {
    expect(() => main("android", ["--kill-port"])).toThrow("Usage:");
    expect(() => main("setup", ["--kill-ports"])).toThrow("Usage:");
  });
});

describe("native development tunnel", () => {
  it("handles cloudflared's null output when no tunnels exist yet", () => {
    expect(parseTunnels("null\n")).toEqual([]);
    expect(parseTunnels("[]\n")).toEqual([]);
    expect(parseTunnels('[{"name":"big-two-native-dev"}]')).toEqual([
      { name: "big-two-native-dev" },
    ]);
  });

  it("exposes only API paths on loopback and rejects every other hostname/path", () => {
    expect(tunnelConfig(config)).toBe(
      `tunnel: ${config.tunnelId}\n` +
        `credentials-file: "${config.credentialsFile}"\n` +
        `ingress:\n  - hostname: ${defaultHostname}\n` +
        '    path: "/api/.*"\n    service: http://127.0.0.1:8788\n' +
        "  - service: http_status:404\n",
    );
  });

  it.each([
    "https://dev.example.com",
    "dev.example.com/path",
    "dev.example.com\ningress:",
    "-dev.example.com",
    "big-two-api.chiubaca.com",
    "big-two.chiubaca.com",
  ])("rejects unsafe or production hostname %s", (hostname) => {
    expect(() => validateConfig({ ...config, hostname })).toThrow("development-only");
  });

  it("rejects invalid UUIDs and relative credential paths", () => {
    expect(() => validateConfig({ ...config, tunnelId: "tunnel-name\n" })).toThrow("UUID");
    expect(() => validateConfig({ ...config, credentialsFile: "~/credentials.json" })).toThrow(
      "absolute path",
    );
  });

  it("writes only generated state with private permissions and supports reruns", () => {
    const directory = mkdtempSync(join(tmpdir(), "bigtwo-native-test-"));
    directories.push(directory);
    writeConfig(directory, config);
    writeConfig(directory, config);
    expect(JSON.parse(readFileSync(join(directory, "config.json"), "utf8"))).toEqual(config);
    expect(readFileSync(join(directory, "backend.env"), "utf8")).toBe(
      `BETTER_AUTH_URL=https://${defaultHostname}\n`,
    );
    expect(readFileSync(join(directory, "tunnel.yml"), "utf8")).toBe(tunnelConfig(config));
    for (const file of ["config.json", "backend.env", "tunnel.yml"]) {
      expect(statSync(join(directory, file)).mode & 0o777).toBe(0o600);
    }
  });

  it("loads existing secrets before the native-only auth URL override", () => {
    expect(backendArgs("/project/.native-dev")).toEqual([
      "exec",
      "wrangler",
      "dev",
      "--ip",
      "127.0.0.1",
      "--port",
      "8788",
      "--env-file",
      ".dev.vars",
      "--env-file",
      "/project/.native-dev/backend.env",
    ]);
  });

  it("stops sibling services when one exits and passes the scoped environment", async () => {
    const directory = mkdtempSync(join(tmpdir(), "bigtwo-native-test-"));
    directories.push(directory);
    const ready = join(directory, "ready");
    const stopped = join(directory, "stopped");
    const code = await supervise(
      [
        {
          command: process.execPath,
          args: [
            "-e",
            `const fs = require('node:fs');
             process.on('SIGTERM', () => { fs.writeFileSync(${JSON.stringify(stopped)}, 'yes'); process.exit(0); });
             fs.writeFileSync(${JSON.stringify(ready)}, process.env.EXPO_PUBLIC_BACKEND_URL);
             setInterval(() => {}, 100);`,
          ],
        },
        {
          command: process.execPath,
          args: [
            "-e",
            `const fs = require('node:fs');
             setInterval(() => { if (fs.existsSync(${JSON.stringify(ready)})) process.exit(7); }, 10);`,
          ],
        },
      ],
      { ...process.env, EXPO_PUBLIC_BACKEND_URL: `https://${defaultHostname}` },
    );
    expect(code).toBe(7);
    expect(readFileSync(ready, "utf8")).toBe(`https://${defaultHostname}`);
    expect(readFileSync(stopped, "utf8")).toBe("yes");
  });

  it("fails cleanly when a required executable is missing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(
        await supervise([{ command: "/nonexistent/bigtwo-executable", args: [] }], process.env),
      ).toBe(1);
      expect(error).toHaveBeenCalledWith(expect.stringContaining("ENOENT"));
    } finally {
      error.mockRestore();
    }
  });
});
