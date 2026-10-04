// @vitest-environment jsdom

import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type { Card, RoomGameState } from "@big-two/game-state-machine";
import { useAutoPass } from "./use-auto-pass";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

const card = (value: Card["value"], suit: Card["suit"] = "DIAMOND"): Card => ({ value, suit });
const state = (hand = [card("3")], cardsToBeat = [card("2", "SPADE")]) =>
  ({
    value: "NEXT_PLAYER_TURN",
    context: {
      players: [{ id: "you", name: "You", hand }],
      currentPlayerIndex: 0,
      cardPile: [cardsToBeat],
    },
  }) as RoomGameState;

function setup(gameState = state(), isMyTurn = true, send = vi.fn()) {
  const onError = vi.fn();
  const props = { gameState, isMyTurn, playerId: "you", send, onError };
  const hook = renderHook((input) => useAutoPass(input), {
    initialProps: props,
    wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
  });
  return { ...hook, props, send, onError };
}

it("defaults off, saves the toggle, and restores it on another table", () => {
  const hook = setup();
  expect(hook.result.current.enabled).toBe(false);
  expect(hook.send).not.toHaveBeenCalled();
  act(() => hook.result.current.toggle());
  expect(localStorage.getItem("big-two-auto-pass")).toBe("true");
  expect(hook.send).toHaveBeenCalledWith({ type: "PASS_TURN", playerId: "you" });
  hook.unmount();
  const next = setup();
  expect(next.result.current.enabled).toBe(true);
  act(() => next.result.current.toggle());
  expect(localStorage.getItem("big-two-auto-pass")).toBe("false");
});

it("sends only one pass per turn, including StrictMode and unrelated snapshot updates", () => {
  localStorage.setItem("big-two-auto-pass", "true");
  const hook = setup();
  hook.rerender({ ...hook.props, gameState: state() });
  expect(hook.send).toHaveBeenCalledTimes(1);
  hook.rerender({ ...hook.props, isMyTurn: false });
  hook.rerender(hook.props);
  expect(hook.send).toHaveBeenCalledTimes(2);
});

it.each([
  [[card("4", "SPADE")], [card("4", "HEART")]],
  [
    [card("6"), card("6", "HEART")],
    [card("5"), card("5", "SPADE")],
  ],
  [
    [card("6"), card("6", "HEART"), card("6", "SPADE"), card("5"), card("5", "HEART")],
    [card("4"), card("6"), card("9"), card("J"), card("Q")],
  ],
])("does not pass when a legal single, pair, or five-card hand exists (%#)", (hand, pile) => {
  localStorage.setItem("big-two-auto-pass", "true");
  expect(setup(state(hand, pile)).send).not.toHaveBeenCalled();
});

it.each([
  [[card("2")], [card("5"), card("5", "SPADE")]],
  [
    [card("4"), card("4", "HEART")],
    [card("5"), card("5", "SPADE")],
  ],
  [[card("2")], [card("4"), card("6"), card("9"), card("J"), card("Q")]],
])("passes when no matching stronger combination exists (%#)", (hand, pile) => {
  localStorage.setItem("big-two-auto-pass", "true");
  expect(setup(state(hand, pile)).send).toHaveBeenCalledTimes(1);
});

it.each(["ROUND_FIRST_MOVE", "PLAY_NEW_ROUND", "WAITING_FOR_PLAYERS", "GAME_END"])(
  "never passes in %s",
  (value) => {
    localStorage.setItem("big-two-auto-pass", "true");
    expect(setup({ ...state(), value } as RoomGameState).send).not.toHaveBeenCalled();
  },
);

it("never passes for a hidden hand, spectator, or another player's turn", () => {
  localStorage.setItem("big-two-auto-pass", "true");
  expect(setup(state(), false).send).not.toHaveBeenCalled();
});

it("does not pass with missing cards or an invalid pile", () => {
  localStorage.setItem("big-two-auto-pass", "true");
  expect(setup(state([], [card("2")])).send).not.toHaveBeenCalled();
  expect(setup(state([card("3")], [])).send).not.toHaveBeenCalled();
  expect(setup(state([card("3")], [card("4"), card("5")])).send).not.toHaveBeenCalled();
});

it("reports a failed pass without repeatedly retrying", async () => {
  localStorage.setItem("big-two-auto-pass", "true");
  const hook = setup(state(), true, vi.fn().mockRejectedValue(new Error("Connection lost")));
  await waitFor(() => expect(hook.onError).toHaveBeenCalledWith("Connection lost"));
  hook.rerender({ ...hook.props, gameState: state() });
  expect(hook.send).toHaveBeenCalledTimes(1);
});

it("still works when browser storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  const hook = setup();
  act(() => hook.result.current.toggle());
  expect(hook.result.current.enabled).toBe(true);
  expect(hook.send).toHaveBeenCalledTimes(1);
});
