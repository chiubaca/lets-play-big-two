import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  backendArgs,
  defaultHostname,
  parseTunnels,
  supervise,
  tunnelConfig,
  validateConfig,
  writeConfig,
} from "./native-dev.mjs";

const config = {
  hostname: defaultHostname,
  tunnelId: "12345678-1234-1234-1234-123456789abc",
  credentialsFile: "/Users/Developer Name/.cloudflared/tunnel.json",
};
const directories = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
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
