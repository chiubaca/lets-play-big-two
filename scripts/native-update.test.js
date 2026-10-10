import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { main } from "./native-update.mjs";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));
vi.mock("node:readline", () => ({ createInterface: vi.fn() }));

beforeEach(() => {
  vi.mocked(spawnSync).mockReturnValue({ status: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(spawnSync).mockReset();
  vi.mocked(createInterface).mockReset();
  vi.unstubAllEnvs();
});

const updateArgs = [
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
];
const globalVp = join(process.env.VITE_PLUS_HOME ?? join(homedir(), ".vite-plus"), "bin", "vp");

function terminalWithAnswer(answer) {
  vi.spyOn(process, "stdin", "get").mockReturnValue({ isTTY: true });
  vi.spyOn(process, "stdout", "get").mockReturnValue({ isTTY: true });
  const terminal = new EventEmitter();
  terminal.close = vi.fn(() => terminal.emit("close"));
  terminal.question = vi.fn((message, callback) => callback(answer));
  vi.mocked(createInterface).mockReturnValue(terminal);
  return terminal;
}

it("prompts for a message and runs the native preview update from its app directory", async () => {
  const terminal = terminalWithAnswer('  Fix turn focus; "keep playing"  ');
  expect(await main()).toBe(0);
  expect(terminal.question).toHaveBeenCalledWith(
    "Android preview OTA message: ",
    expect.any(Function),
  );
  expect(terminal.close).toHaveBeenCalled();
  expect(spawnSync).toHaveBeenCalledWith(
    globalVp,
    [...updateArgs, 'Fix turn focus; "keep playing"'],
    {
      cwd: fileURLToPath(new URL("../apps/frontend-native/", import.meta.url)),
      stdio: "inherit",
    },
  );
});

it("accepts an explicit message without prompting", async () => {
  expect(await main(["--message", "Fix turn focus"])).toBe(0);
  expect(createInterface).not.toHaveBeenCalled();
  expect(spawnSync).toHaveBeenCalledWith(
    globalVp,
    [...updateArgs, "Fix turn focus"],
    expect.any(Object),
  );
});

it("uses a custom Vite+ home instead of the local vp that shadows dlx", async () => {
  vi.stubEnv("VITE_PLUS_HOME", "/custom/vite-plus");
  expect(await main(["--message", "UI fixes"])).toBe(0);
  expect(spawnSync).toHaveBeenCalledWith(
    "/custom/vite-plus/bin/vp",
    [...updateArgs, "UI fixes"],
    expect.any(Object),
  );
});

it.each(["", "   "])("rejects empty prompt answers %j without publishing", async (answer) => {
  terminalWithAnswer(answer);
  await expect(main()).rejects.toThrow("An update message is required");
  expect(spawnSync).not.toHaveBeenCalled();
});

it("rejects an empty explicit message without prompting or publishing", async () => {
  await expect(main(["--message", "   "])).rejects.toThrow("An update message is required");
  expect(createInterface).not.toHaveBeenCalled();
  expect(spawnSync).not.toHaveBeenCalled();
});

it.each(["close", "SIGINT"])("cancels on %s without publishing", async (event) => {
  const terminal = terminalWithAnswer("");
  terminal.question.mockImplementation(() => terminal.emit(event));
  expect(await main()).toBe(130);
  expect(spawnSync).not.toHaveBeenCalled();
});

it("requires a message in non-interactive terminals", async () => {
  vi.spyOn(process, "stdin", "get").mockReturnValue({ isTTY: false });
  await expect(main()).rejects.toThrow('--message "Describe your changes"');
  expect(createInterface).not.toHaveBeenCalled();
  expect(spawnSync).not.toHaveBeenCalled();
});

it("rejects unknown options before prompting or publishing", async () => {
  await expect(main(["--channel", "production"])).rejects.toThrow("Unknown option");
  expect(createInterface).not.toHaveBeenCalled();
  expect(spawnSync).not.toHaveBeenCalled();
});

it("returns the publish exit status and reports launch errors", async () => {
  vi.mocked(spawnSync).mockReturnValueOnce({ status: 7 });
  expect(await main(["--message", "Fix turn focus"])).toBe(7);
  vi.mocked(spawnSync).mockReturnValueOnce({ status: null, signal: "SIGTERM" });
  expect(await main(["--message", "Fix turn focus"])).toBe(1);
  vi.mocked(spawnSync).mockReturnValueOnce({ error: new Error("vp missing") });
  await expect(main(["--message", "Fix turn focus"])).rejects.toThrow("vp missing");
});
