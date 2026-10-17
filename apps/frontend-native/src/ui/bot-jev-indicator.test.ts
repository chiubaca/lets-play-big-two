import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { Player } from "@big-two/game-state-machine";
import { BotJevIndicator, isJevBotOnline } from "./bot-jev-indicator";

vi.mock("react-native", () => ({
  View: "View",
  StyleSheet: { create: (styles: unknown) => styles },
}));
let renderer: ReactTestRenderer | undefined;
const bot: Player = { id: "pepper", name: "Pepper", isBot: true, usesJev: true, hand: [] };
beforeEach(() => Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }));
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
});

it("renders a tiny green dot without any text for a Jev-connected bot", async () => {
  await act(async () => {
    renderer = create(createElement(BotJevIndicator, { player: bot }));
  });
  const dot = renderer!.root.findByProps({ testID: "bot-jev-pepper" });
  expect(dot.props.pointerEvents).toBe("none");
  expect(dot.props.accessible).toBe(false);
  expect(dot.props.children).toBeUndefined();
  expect(Object.assign({}, ...dot.props.style)).toMatchObject({
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6db58c",
  });
  expect(isJevBotOnline(bot, true)).toBe(true);
});

it.each([
  { player: { ...bot, usesJev: undefined }, connected: true },
  { player: { ...bot, usesJev: false }, connected: true },
  { player: bot, connected: false },
])("renders a muted grey dot for offline or unconfirmed Jev: %j", async (props) => {
  await act(async () => {
    renderer = create(createElement(BotJevIndicator, props));
  });
  const dot = renderer!.root.findByProps({ testID: "bot-jev-pepper" });
  expect(Object.assign({}, ...dot.props.style).backgroundColor).toBe("#727970");
  expect(dot.props.children).toBeUndefined();
  expect(isJevBotOnline(props.player, props.connected)).toBe(false);
});

it.each([
  { player: undefined, connected: true },
  { player: { ...bot, isBot: false }, connected: true },
])("shows nothing for humans and open seats: %j", async (props) => {
  await act(async () => {
    renderer = create(createElement(BotJevIndicator, props));
  });
  expect(renderer!.toJSON()).toBeNull();
  expect(isJevBotOnline(props.player, props.connected)).toBe(false);
});
