import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const appDirectory = fileURLToPath(new URL("../apps/frontend-native/", import.meta.url));

function promptMessage() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('An interactive terminal is required. Use --message "Describe your changes".');
  }
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolveAnswer) => {
    terminal.once("close", () => resolveAnswer(null));
    terminal.once("SIGINT", () => terminal.close());
    terminal.question("Android preview OTA message: ", (answer) => {
      resolveAnswer(answer);
      terminal.close();
    });
  });
}

export async function main(args = []) {
  const { values } = parseArgs({ args, options: { message: { type: "string" } } });
  const answer = values.message ?? (await promptMessage());
  if (answer === null) return 130;
  const message = answer.trim();
  if (!message) throw new Error("An update message is required; nothing was published.");

  // Package scripts prepend the local vp to PATH; only the global CLI supports dlx.
  const vp = join(process.env.VITE_PLUS_HOME ?? join(homedir(), ".vite-plus"), "bin", "vp");
  const result = spawnSync(
    vp,
    [
      "dlx",
      "--",
      "eas-cli",
      "update",
      "--channel",
      "preview",
      "--environment",
      "preview",
      "--platform",
      "android",
      "--message",
      message,
    ],
    { cwd: appDirectory, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
