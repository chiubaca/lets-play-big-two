import type { Card } from "@big-two/game-core";
import {
  bigTwoGameMachine,
  type GameContext,
  type RoomGameState,
} from "@big-two/game-state-machine";

export const roomScenarios = [
  "waiting-alone",
  "waiting-open",
  "waiting-full",
  "first-move",
  "single",
  "pairs",
  "combo",
  "new-round",
  "bot-turn",
  "low-cards",
  "no-legal-play",
  "host-wins",
  "guest-wins",
  "long-names",
  "room-notice",
] as const;

export type RoomScenario = (typeof roomScenarios)[number];
export type RoomViewer = "host" | "guest" | "spectator";

const hand: Card[] = [
  { suit: "DIAMOND", value: "3" },
  { suit: "CLUB", value: "3" },
  { suit: "DIAMOND", value: "4" },
  { suit: "HEART", value: "4" },
  { suit: "CLUB", value: "5" },
  { suit: "DIAMOND", value: "6" },
  { suit: "HEART", value: "7" },
  { suit: "SPADE", value: "8" },
  { suit: "DIAMOND", value: "9" },
  { suit: "DIAMOND", value: "Q" },
  { suit: "CLUB", value: "Q" },
  { suit: "HEART", value: "A" },
  { suit: "SPADE", value: "2" },
];

const guestHand: Card[] = [
  { suit: "HEART", value: "3" },
  { suit: "SPADE", value: "4" },
  { suit: "HEART", value: "5" },
  { suit: "CLUB", value: "6" },
  { suit: "CLUB", value: "7" },
  { suit: "DIAMOND", value: "8" },
  { suit: "HEART", value: "9" },
  { suit: "CLUB", value: "10" },
  { suit: "DIAMOND", value: "J" },
  { suit: "HEART", value: "J" },
  { suit: "HEART", value: "Q" },
  { suit: "CLUB", value: "A" },
  { suit: "HEART", value: "2" },
];

// Mirrors the room's public projection: counts for every seat, a private hand
// only for the selected Player, and no private cards at all for a Spectator.
export function createRoomFixture(
  scenario: RoomScenario,
  viewer: RoomViewer = "host",
  spectatorCount = 2,
): RoomGameState {
  const waiting = scenario.startsWith("waiting-") || scenario === "room-notice";
  const players: GameContext["players"] = [
    { id: "host", name: "Alex", emoji: "🦊", hand: [] },
    { id: "guest", name: "Mei", emoji: "🐼", hand: [] },
    { id: "bot", name: "Bot Pepper", isBot: true, hand: [] },
    { id: "fourth", name: "Sam", emoji: "🐸", hand: [] },
  ].slice(0, scenario === "waiting-alone" ? 1 : waiting && scenario !== "waiting-full" ? 2 : 4);
  if (scenario === "long-names") {
    players[0].name = "Alexandra the Card Collector";
    players[1].name = "梅 · The Unbeatable Panda";
  }
  const pile: Card[] =
    waiting || scenario === "first-move" || scenario === "new-round"
      ? []
      : scenario === "pairs"
        ? [
            { suit: "HEART", value: "10" },
            { suit: "SPADE", value: "10" },
          ]
        : scenario === "combo"
          ? [
              { suit: "CLUB", value: "4" },
              { suit: "DIAMOND", value: "5" },
              { suit: "HEART", value: "6" },
              { suit: "SPADE", value: "7" },
              { suit: "CLUB", value: "8" },
            ]
          : [{ suit: "HEART", value: scenario === "no-legal-play" ? "2" : "10" }];
  const finished = scenario === "host-wins" || scenario === "guest-wins";
  const winnerId = scenario === "guest-wins" ? "guest" : "host";
  const handCounts = Object.fromEntries(players.map((player) => [player.id, waiting ? 0 : 13]));
  if (!waiting) handCounts.guest -= pile.length;
  if (scenario === "low-cards") Object.assign(handCounts, { host: 2, guest: 1, bot: 3, fourth: 5 });
  if (scenario === "no-legal-play") handCounts.host = 2;
  if (finished) handCounts[winnerId] = 0;
  const self = players.find((player) => player.id === viewer);
  if (self && !waiting) {
    const cards =
      scenario === "no-legal-play" && viewer === "host"
        ? hand.slice(0, 2)
        : viewer === "guest"
          ? guestHand
          : hand;
    self.hand = cards.slice(0, handCounts[viewer]).map((card) => ({ ...card }));
  }
  const snapshot = bigTwoGameMachine.resolveState({
    value: waiting
      ? "WAITING_FOR_PLAYERS"
      : finished
        ? "GAME_END"
        : scenario === "first-move"
          ? "ROUND_FIRST_MOVE"
          : scenario === "new-round"
            ? "PLAY_NEW_ROUND"
            : "NEXT_PLAYER_TURN",
    context: {
      players,
      currentPlayerIndex: scenario === "bot-turn" ? 2 : 0,
      cardPile: pile.length ? [pile] : [],
      roundMode: pile.length
        ? scenario === "pairs"
          ? "pairs"
          : scenario === "combo"
            ? "combo"
            : "single"
        : null,
      consecutivePasses: scenario === "new-round" ? 3 : 0,
      ...(finished ? { winner: players.find((player) => player.id === winnerId) } : {}),
    },
  });
  return {
    ...snapshot,
    handCounts,
    spectatorCount,
    ...(scenario === "room-notice"
      ? { roomNotice: "Sam left the table. The game has been reset." }
      : {}),
  };
}
