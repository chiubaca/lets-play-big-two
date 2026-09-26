// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BigTwoGameMachineSnapshot, RoomGameState } from "@big-two/game-state-machine";
import { afterEach, expect, it } from "vite-plus/test";
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

  expect(screen.getByText("Jev ✨[jev]")).toBeTruthy();
  expect(screen.getByTitle("Jev unavailable — using Basic AI")).toBeTruthy();
  expect(screen.queryByText("Ada ✨[jev]")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  const adaMode = screen.getByRole("group", { name: "AI mode for Ada" });
  fireEvent.click(adaMode.querySelectorAll("button")[1]);

  expect(screen.getAllByText("Ada ✨[jev]")).toHaveLength(2);
  expect(adaMode.querySelectorAll("button")[1].getAttribute("aria-pressed")).toBe("true");
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

  expect(screen.getByText("2 watching")).toBeTruthy();
  expect(screen.getByRole("group", { name: /You, 13 cards remaining/ })).toBeTruthy();
  expect(screen.getByRole("group", { name: /Ada, 12 cards remaining/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Play selected cards" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Pass turn" })).toBeNull();
  expect(screen.queryByRole("group", { name: /Visitor's hand/ })).toBeNull();
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
