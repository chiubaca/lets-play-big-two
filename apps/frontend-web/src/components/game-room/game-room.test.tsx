// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { BigTwoGameMachineSnapshot, RoomGameState } from "@big-two/game-state-machine";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useState } from "react";

import { GameRoom, type BotSettings } from "./game-room";

afterEach(cleanup);

const players = [
  { id: "solo-player", name: "You", hand: [] },
  { id: "ada", name: "Ada", hand: [] },
  { id: "jev", name: "Jev", hand: [] },
  { id: "alan", name: "Alan", hand: [] },
];

const gameState = {
  value: "NEXT_PLAYER_TURN",
  context: {
    cardPile: [],
    currentPlayerIndex: 0,
    guardMessage: undefined,
    players,
    winner: undefined,
  },
} as unknown as BigTwoGameMachineSnapshot;

function SoloTable() {
  const [bots, setBots] = useState<BotSettings["players"]>([
    { id: "ada", name: "Ada", botStrategy: "basic" },
    { id: "jev", name: "Jev", botStrategy: "jev" },
    { id: "alan", name: "Alan", botStrategy: "basic" },
  ]);

  return (
    <GameRoom
      botSettings={{
        players: bots,
        onStrategyChange: (playerId, strategy) =>
          setBots((current) =>
            current.map((bot) => (bot.id === playerId ? { ...bot, botStrategy: strategy } : bot)),
          ),
      }}
      gameState={gameState}
      jevFallbackPlayerIds={new Set(["jev"])}
      send={() => {}}
      tableLabel="Solo table"
      user={{ id: "solo-player", name: "You" }}
    />
  );
}

it("changes a solo opponent between Basic and Jev and marks Jev at the table", () => {
  render(<SoloTable />);

  expect(screen.queryByRole("button", { name: /Copy room code/ })).toBeNull();
  expect(screen.getByText("Jev ✨[jev]")).toBeTruthy();
  expect(screen.getByTitle("Jev unavailable — using Basic AI")).toBeTruthy();
  expect(screen.queryByText("Ada ✨[jev]")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  const adaMode = screen.getByRole("group", { name: "AI mode for Ada" });
  fireEvent.click(adaMode.querySelectorAll("button")[1]);

  expect(screen.getAllByText("Ada ✨[jev]")).toHaveLength(2);
  expect(adaMode.querySelectorAll("button")[1].getAttribute("aria-pressed")).toBe("true");
});

it("copies only the online room code", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

  try {
    render(
      <GameRoom
        gameState={gameState}
        send={() => {}}
        tableLabel="Room ABCDE"
        roomCode="ABCDE"
        user={{ id: "solo-player", name: "You" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy room code ABCDE" }));
    expect(writeText).toHaveBeenCalledWith("ABCDE");
  } finally {
    if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});

it("shows a read-only four-seat table and unique viewer count to spectators", () => {
  const spectatorState = {
    ...gameState,
    handCounts: { "solo-player": 13, ada: 12, jev: 11, alan: 10 },
    spectatorCount: 2,
  } as RoomGameState;
  render(
    <GameRoom
      gameState={spectatorState}
      send={() => {}}
      tableLabel="Room ABCDE"
      user={{ id: "visitor", name: "Visitor" }}
    />,
  );

  expect(screen.getByLabelText("2 watching")).toBeTruthy();
  expect(screen.getByRole("group", { name: /You, 13 cards remaining/ })).toBeTruthy();
  expect(screen.getByRole("group", { name: /Ada, 12 cards remaining/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Play selected cards" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Pass turn" })).toBeNull();
  expect(screen.queryByRole("group", { name: /Visitor's hand/ })).toBeNull();
});

it("shows the viewer count for a seated player, including zero", () => {
  render(
    <GameRoom
      gameState={{ ...gameState, spectatorCount: 0 } as RoomGameState}
      send={() => {}}
      tableLabel="Room ABCDE"
      user={{ id: "solo-player", name: "You" }}
    />,
  );

  expect(screen.getByLabelText("0 watching")).toBeTruthy();
});

it("lets a spectator take an open seat before dealing", () => {
  render(
    <GameRoom
      gameState={
        {
          ...gameState,
          value: "WAITING_FOR_PLAYERS",
          context: { ...gameState.context, players: players.slice(0, 2) },
        } as BigTwoGameMachineSnapshot
      }
      send={() => {}}
      tableLabel="Room ABCDE"
      user={{ id: "visitor", name: "Visitor" }}
    />,
  );
  expect(screen.getByRole("button", { name: "Join Table" })).toBeTruthy();
});

it("does not offer a seat when the waiting room is full", () => {
  render(
    <GameRoom
      gameState={{ ...gameState, value: "WAITING_FOR_PLAYERS" } as BigTwoGameMachineSnapshot}
      send={() => {}}
      tableLabel="Room ABCDE"
      user={{ id: "visitor", name: "Visitor" }}
    />,
  );
  expect(screen.queryByRole("button", { name: "Join Table" })).toBeNull();
  expect(screen.getByText("All seats are taken · watching the table")).toBeTruthy();
});

it("does not show a stale not-your-turn warning when the online table says it is your turn", () => {
  const onlineState = {
    ...gameState,
    handCounts: { "solo-player": 13, ada: 13, jev: 13, alan: 13 },
    spectatorCount: 0,
    context: { ...gameState.context, guardMessage: "It is not your turn" },
  } as RoomGameState;

  render(
    <GameRoom
      gameState={onlineState}
      send={() => {}}
      tableLabel="Room ABCDE"
      user={{ id: "solo-player", name: "You" }}
    />,
  );

  const prompt = screen.getByRole("status");
  expect(prompt.textContent).toContain("Your turn");
  expect(prompt.textContent).not.toContain("It is not your turn");
});

const finishedState = {
  ...gameState,
  value: "GAME_END",
  context: { ...gameState.context, winner: players[1] },
} as BigTwoGameMachineSnapshot;

it("shows Results without forcing the modal on late entry, but celebrates a witnessed finish", () => {
  const props = {
    send: () => {},
    tableLabel: "Room ABCDE",
    roomCode: "ABCDE",
    user: { id: "solo-player", name: "You" },
  };
  const { unmount } = render(<GameRoom {...props} gameState={finishedState} />);

  expect(screen.getByRole("button", { name: "Results" })).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Results" }));
  expect(screen.getByRole("dialog")).toBeTruthy();

  unmount();
  const room = render(<GameRoom {...props} gameState={gameState} />);
  room.rerender(<GameRoom {...props} gameState={finishedState} />);
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("does not celebrate a finished room loaded after connecting", () => {
  const props = {
    send: () => {},
    tableLabel: "Room ABCDE",
    roomCode: "ABCDE",
    user: { id: "visitor", name: "Visitor" },
  };
  const { rerender } = render(<GameRoom {...props} />);
  expect(screen.getByText("Connecting to the table…")).toBeTruthy();
  rerender(<GameRoom {...props} gameState={finishedState} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Results" })).toBeTruthy();
});

it("returns focus to Results after closing or escaping, with the room inert during the modal", async () => {
  render(
    <GameRoom
      gameState={finishedState}
      send={() => {}}
      tableLabel="Room ABCDE"
      roomCode="ABCDE"
      user={{ id: "solo-player", name: "You" }}
    />,
  );
  const results = screen.getByRole("button", { name: "Results" });
  fireEvent.click(results);

  expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  expect(screen.queryByRole("button", { name: "Copy room code ABCDE" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(document.activeElement).toBe(results));

  fireEvent.click(results);
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(results);
});

it("keeps restart on the host's finished strip and preserves it after a failed attempt", async () => {
  const send = vi.fn().mockRejectedValueOnce(new Error("Could not restart now"));
  const { rerender } = render(
    <GameRoom
      gameState={finishedState}
      send={send}
      tableLabel="Room ABCDE"
      roomCode="ABCDE"
      user={{ id: "solo-player", name: "You" }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Play again" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Could not restart now"));
  expect(screen.getByRole("button", { name: "Results" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Return home" }).getAttribute("href")).toBe("/");
  fireEvent.click(screen.getByRole("button", { name: "Play again" }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  rerender(
    <GameRoom
      gameState={gameState}
      send={send}
      tableLabel="Room ABCDE"
      roomCode="ABCDE"
      user={{ id: "solo-player", name: "You" }}
    />,
  );
  expect(screen.queryByRole("region", { name: "Finished room" })).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("offers non-host Players and Spectators a way to stay or leave, never restart", () => {
  const props = {
    gameState: finishedState,
    send: () => {},
    tableLabel: "Room ABCDE",
    roomCode: "ABCDE",
  };
  const { rerender } = render(<GameRoom {...props} user={{ id: "ada", name: "Ada" }} />);
  expect(screen.getByRole("region", { name: "Finished room" }).textContent).toContain("Ada wins!");
  expect(screen.getByRole("button", { name: "Results" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Return home" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Play again" })).toBeNull();

  rerender(<GameRoom {...props} user={{ id: "visitor", name: "Visitor" }} />);
  expect(screen.getByRole("region", { name: "Finished room" }).textContent).toContain(
    "Waiting for the host",
  );
  expect(screen.queryByRole("button", { name: "Play again" })).toBeNull();
});

it("preserves the solo result behavior without a finished-room strip", () => {
  render(
    <GameRoom
      gameState={finishedState}
      send={() => {}}
      tableLabel="Solo table"
      user={{ id: "solo-player", name: "You" }}
    />,
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  expect(screen.queryByRole("region", { name: "Finished room" })).toBeNull();
});

it("shows a fresh celebration when another game ends in the same online room", async () => {
  const props = {
    send: () => {},
    tableLabel: "Room ABCDE",
    roomCode: "ABCDE",
    user: { id: "solo-player", name: "You" },
  };
  const { rerender } = render(<GameRoom {...props} gameState={gameState} />);
  rerender(<GameRoom {...props} gameState={finishedState} />);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  rerender(<GameRoom {...props} gameState={gameState} />);
  expect(screen.queryByRole("region", { name: "Finished room" })).toBeNull();
  rerender(<GameRoom {...props} gameState={finishedState} />);
  expect(screen.getByRole("dialog")).toBeTruthy();
});
