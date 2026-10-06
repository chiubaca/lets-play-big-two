import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stateDir = join(root, ".native-dev");
export const defaultHostname = "dev-big-two-api.chiubaca.com";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status ?? result.signal}).`);
  return result.stdout;
}

export function validateConfig(config) {
  if (
    typeof config.hostname !== "string" ||
    config.hostname.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(config.hostname) ||
    ["big-two-api.chiubaca.com", "big-two.chiubaca.com"].includes(config.hostname)
  ) {
    throw new Error("Use a development-only DNS hostname, not a URL or production hostname.");
  }
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(config.tunnelId)) {
    throw new Error("Invalid tunnel UUID.");
  }
  if (typeof config.credentialsFile !== "string" || !config.credentialsFile.startsWith("/")) {
    throw new Error("Tunnel credentials must use an absolute path.");
  }
  return config;
}

export function tunnelConfig(config) {
  validateConfig(config);
  return [
    `tunnel: ${config.tunnelId}`,
    `credentials-file: ${JSON.stringify(config.credentialsFile)}`,
    "ingress:",
    `  - hostname: ${config.hostname}`,
    '    path: "/api/.*"',
    "    service: http://127.0.0.1:8788",
    "  - service: http_status:404",
    "",
  ].join("\n");
}

export function writeConfig(directory, config) {
  const yaml = tunnelConfig(config);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(join(directory, "config.json"), `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  writeFileSync(join(directory, "tunnel.yml"), yaml, { mode: 0o600 });
  writeFileSync(join(directory, "backend.env"), `BETTER_AUTH_URL=https://${config.hostname}\n`, {
    mode: 0o600,
  });
}

function readConfig() {
  const file = join(stateDir, "config.json");
  if (!existsSync(file)) throw new Error("Run vp run dev:native:setup first.");
  const config = validateConfig(JSON.parse(readFileSync(file, "utf8")));
  if (!existsSync(config.credentialsFile)) {
    throw new Error("Tunnel credentials are missing. Run vp run dev:native:setup on this Mac.");
  }
  return config;
}

export function parseTunnels(output) {
  return JSON.parse(output) ?? [];
}

function setup() {
  const hostname = process.env.NATIVE_DEV_HOSTNAME ?? defaultHostname;
  const tunnelName = process.env.NATIVE_DEV_TUNNEL_NAME ?? "big-two-native-dev";
  if (!/^[a-z0-9][a-z0-9-]*$/.test(tunnelName)) throw new Error("Invalid development tunnel name.");
  // Validate before installing tools, authenticating, or modifying Cloudflare resources.
  validateConfig({
    hostname,
    tunnelId: "00000000-0000-0000-0000-000000000000",
    credentialsFile: "/placeholder",
  });
  const installed = spawnSync("cloudflared", ["--version"], { stdio: "ignore" });
  if (installed.error?.code === "ENOENT") run("brew", ["install", "cloudflared"]);
  else if (installed.status !== 0) throw new Error("cloudflared is installed but cannot run.");

  if (!existsSync(join(homedir(), ".cloudflared", "cert.pem"))) {
    console.log(
      "Authorize the Cloudflare zone containing your development hostname in the browser.",
    );
    run("cloudflared", ["tunnel", "login"]);
  }

  const listTunnels = () =>
    parseTunnels(
      run("cloudflared", ["tunnel", "list", "--output", "json"], {
        stdio: ["ignore", "pipe", "inherit"],
        encoding: "utf8",
      }),
    );
  let tunnel = listTunnels().find((entry) => entry.name === tunnelName);
  if (!tunnel) {
    run("cloudflared", ["tunnel", "create", tunnelName]);
    tunnel = listTunnels().find((entry) => entry.name === tunnelName);
  }
  if (!tunnel) throw new Error(`Could not find tunnel ${tunnelName} after creation.`);

  const config = validateConfig({
    hostname,
    tunnelId: tunnel.id,
    credentialsFile: join(homedir(), ".cloudflared", `${tunnel.id}.json`),
  });
  if (!existsSync(config.credentialsFile)) {
    throw new Error(
      `Tunnel ${tunnelName} already exists, but its credentials are missing on this Mac. ` +
        "Restore its credentials securely; setup will not delete or replace the existing tunnel.",
    );
  }

  // Deliberately omit --overwrite-dns: never replace an existing route to another service.
  run("cloudflared", ["tunnel", "route", "dns", config.tunnelId, hostname]);
  writeConfig(stateDir, config);
  run("cloudflared", ["tunnel", "--config", join(stateDir, "tunnel.yml"), "ingress", "validate"]);
  console.log(`\nNative API: https://${hostname}`);
  console.log(`Google authorized redirect URI: https://${hostname}/api/auth/callback/google`);
  console.log("Next: configure apps/backend/.dev.vars, then run vp run dev:native.");
}

export function backendArgs(directory) {
  return [
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
    join(directory, "backend.env"),
  ];
}

export async function supervise(commands, env) {
  const children = [];
  let stopping = false;
  let exitCode = 0;
  let timeout;
  function signalChildren(signal) {
    for (const child of children) {
      if (!child.pid) continue;
      try {
        // Each child has its own process group, including vp/Wrangler/Metro descendants.
        process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
  }
  function stop(code) {
    if (stopping) return;
    stopping = true;
    exitCode = code;
    signalChildren("SIGTERM");
    timeout = setTimeout(() => signalChildren("SIGKILL"), 5000);
    timeout.unref();
  }
  const interrupt = () => stop(130);
  const terminate = () => stop(143);
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  try {
    const exits = commands.map(({ command, args, cwd, interactive = false }) => {
      const child = spawn(command, args, {
        cwd,
        env,
        detached: true,
        // Metro must inherit the real terminal for QR codes and a/i keyboard shortcuts.
        stdio: [interactive ? "inherit" : "ignore", "inherit", "inherit"],
      });
      children.push(child);
      return new Promise((resolveExit) => {
        child.on("error", (error) => {
          console.error(error.message);
          stop(1);
          resolveExit();
        });
        child.on("exit", (code) => {
          stop(code ?? 1);
          resolveExit();
        });
      });
    });
    await Promise.all(exits);
    return exitCode;
  } finally {
    clearTimeout(timeout);
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

async function start() {
  const config = readConfig();
  if (!existsSync(join(root, "apps/backend/.dev.vars"))) {
    throw new Error(
      "Copy apps/backend/.dev.vars.example to .dev.vars and set BETTER_AUTH_SECRET first.",
    );
  }
  for (const port of [8788, 8081]) {
    const listener = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
      stdio: "ignore",
    });
    if (listener.error) throw listener.error;
    if (listener.status === 0) {
      throw new Error(
        `Port ${port} is already in use. Stop the existing dev server before starting native dev.`,
      );
    }
  }
  writeConfig(stateDir, config);
  console.log(`Native API: https://${config.hostname}`);
  console.log(
    "WARNING: this publicly exposes the local API using the configured remote D1/AI bindings.",
  );
  console.log(
    "Metro runs on your LAN; connect a development build, not Expo Go. Ctrl+C stops all three services.",
  );
  process.exitCode = await supervise(
    [
      {
        command: "cloudflared",
        args: ["tunnel", "--config", join(stateDir, "tunnel.yml"), "run"],
        cwd: root,
      },
      { command: "vp", args: backendArgs(stateDir), cwd: join(root, "apps/backend") },
      {
        command: "vp",
        args: ["exec", "expo", "start", "--dev-client", "--port", "8081"],
        cwd: join(root, "apps/frontend-native"),
        interactive: true,
      },
    ],
    { ...process.env, EXPO_PUBLIC_BACKEND_URL: `https://${config.hostname}` },
  );
}

function main(task) {
  switch (task) {
    case "setup":
      return setup();
    case "start":
      return start();
    default:
      throw new Error("Usage: node scripts/native-dev.mjs setup|start");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
