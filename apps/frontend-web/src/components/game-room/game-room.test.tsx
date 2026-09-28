// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { BigTwoGameMachineSnapshot, RoomGameState } from "@big-two/game-state-machine";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useState } from "react";

import { GameRoom, type BotSettings } from "./game-room";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

it("loads account consent for a seated online Player and confirms a save without setting up this device", async () => {
  const load = vi.fn().mockResolvedValue(false);
  const save = vi.fn().mockResolvedValue(true);
  const requestPermission = vi.fn();
  vi.stubGlobal("Notification", { requestPermission });
  const props = {
    gameState,
    send: () => {},
    tableLabel: "Room ABCDE",
    roomCode: "ABCDE",
    user: { id: "solo-player", name: "You" },
    turnNotifications: { load, save },
  };
  const room = render(<GameRoom {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  const toggle = await screen.findByRole("switch", { name: "Turn notifications for my account" });
  expect(toggle.tagName).toBe("BUTTON");
  await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("false"));
  expect(screen.getByText("Not enabled on this device")).toBeTruthy();
  expect(requestPermission).not.toHaveBeenCalled();
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
  expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toContain(
    "Turn notifications on for your account",
  );
  expect(save).toHaveBeenCalledWith(true);
  expect(requestPermission).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  room.rerender(<GameRoom {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
});

it("never shows failed or unconfirmed consent as on, and does not offer consent to Spectators or offline tables", async () => {
  const load = vi.fn().mockResolvedValue(false);
  const save = vi.fn().mockRejectedValue(new Error("Network failed"));
  const props = {
    gameState,
    send: () => {},
    tableLabel: "Room ABCDE",
    roomCode: "ABCDE",
    user: { id: "solo-player", name: "You" },
    turnNotifications: { load, save },
  };
  const room = render(<GameRoom {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  const toggle = await screen.findByRole("switch", { name: "Turn notifications for my account" });
  await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  await waitFor(() =>
    expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toContain(
      "Could not confirm",
    ),
  );
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(toggle.hasAttribute("disabled")).toBe(true);
  room.rerender(<GameRoom {...props} user={{ id: "visitor", name: "Visitor" }} />);
  expect(screen.queryByRole("switch", { name: "Turn notifications for my account" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  room.rerender(<GameRoom {...props} roomCode={undefined} />);
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  expect(screen.queryByRole("switch", { name: "Turn notifications for my account" })).toBeNull();
});

it("refreshes account consent when returning to an open settings dialog", async () => {
  const load = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  render(
    <GameRoom
      gameState={gameState}
      send={() => {}}
      tableLabel="Room ABCDE"
      roomCode="ABCDE"
      user={{ id: "solo-player", name: "You" }}
      turnNotifications={{ load, save: vi.fn() }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  const toggle = screen.getByRole("switch", { name: "Turn notifications for my account" });
  await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  fireEvent.focus(window);
  await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
});

it("keeps consent unavailable when the account read fails instead of assuming it is off", async () => {
  const save = vi.fn();
  render(
    <GameRoom
      gameState={gameState}
      send={() => {}}
      tableLabel="Room ABCDE"
      roomCode="ABCDE"
      user={{ id: "solo-player", name: "You" }}
      turnNotifications={{ load: () => Promise.reject(new Error("Offline")), save }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  const toggle = screen.getByRole("switch", { name: "Turn notifications for my account" });
  await waitFor(() =>
    expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toContain(
      "Could not load",
    ),
  );
  expect(toggle.hasAttribute("disabled")).toBe(true);
  fireEvent.click(toggle);
  expect(save).not.toHaveBeenCalled();
});

it("enrolls only after an explicit device action, announces Ready, and removes without changing consent", async () => {
  let state: "not-enabled" | "ready" = "not-enabled";
  const device = {
    inspect: vi.fn(async () => ({ state, generation: 3 })),
    enable: vi.fn(async () => {
      state = "ready";
    }),
    remove: vi.fn(async () => {
      state = "not-enabled";
    }),
  };
  const save = vi.fn();
  render(
    <GameRoom
      gameState={gameState}
      send={() => {}}
      tableLabel="Room ABCDE"
      roomCode="ABCDE"
      user={{ id: "solo-player", name: "You" }}
      turnNotifications={{ load: async () => true, save, device }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  const enable = await screen.findByRole("button", { name: "Enable on this device" });
  await waitFor(() => expect(enable.getAttribute("aria-disabled")).toBe("false"));
  expect(device.enable).not.toHaveBeenCalled();
  fireEvent.click(enable);
  await waitFor(() => expect(screen.getByText("Ready on this device")).toBeTruthy());
  expect(device.enable).toHaveBeenCalledWith(3);
  expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toContain(
    "Delivery is not guaranteed",
  );
  const remove = screen.getByRole("button", { name: "Remove this device" });
  await waitFor(() => expect(document.activeElement).toBe(remove));
  fireEvent.click(remove);
  await waitFor(() => expect(screen.getByText("Not enabled on this device")).toBeTruthy());
  expect(device.remove).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("switch", { name: "Turn notifications for my account" })
      .getAttribute("aria-checked"),
  ).toBe("true");
});

it("shows Blocked or Unavailable without a setup action and retries failed enrollment without Ready", async () => {
  const device = {
    inspect: vi
      .fn()
      .mockResolvedValueOnce({ state: "blocked", generation: 0 })
      .mockResolvedValueOnce({
        state: "unavailable",
        generation: 0,
        reason: "Install to your Home Screen",
      }),
    enable: vi.fn(),
    remove: vi.fn(),
  };
  const props = {
    gameState,
    send: () => {},
    tableLabel: "Room ABCDE",
    roomCode: "ABCDE",
    user: { id: "solo-player", name: "You" },
    turnNotifications: { load: async () => true, save: vi.fn(), device },
  };
  const room = render(<GameRoom {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  await screen.findByText("Blocked on this device");
  expect(screen.queryByRole("button", { name: "Enable on this device" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  room.rerender(<GameRoom {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  await screen.findByText("Unavailable on this device");
  expect(screen.getByText("Install to your Home Screen")).toBeTruthy();
  expect(device.enable).not.toHaveBeenCalled();
});

it("refreshes revoked permission when settings regain focus without requesting it", async () => {
  const requestPermission = vi.fn();
  vi.stubGlobal("Notification", { permission: "denied", requestPermission });
  const device = {
    inspect: vi
      .fn()
      .mockResolvedValueOnce({ state: "ready", generation: 0 })
      .mockResolvedValueOnce({ state: "blocked", generation: 0 }),
    enable: vi.fn(),
    remove: vi.fn(),
  };
  render(
    <GameRoom
      gameState={gameState}
      send={() => {}}
      tableLabel="Room ABCDE"
      roomCode="ABCDE"
      user={{ id: "solo-player", name: "You" }}
      turnNotifications={{ load: async () => true, save: vi.fn(), device }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  await screen.findByText("Ready on this device");
  fireEvent.focus(window);
  await screen.findByText("Blocked on this device");
  expect(screen.queryByRole("button", { name: "Enable on this device" })).toBeNull();
  expect(requestPermission).not.toHaveBeenCalled();
});

it("keeps removal available when blocked and returns focus to the account switch afterward", async () => {
  const device = {
    inspect: vi
      .fn()
      .mockResolvedValueOnce({ state: "blocked", generation: 1, removable: true })
      .mockResolvedValueOnce({ state: "blocked", generation: 1, removable: false }),
    enable: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <GameRoom
      gameState={gameState}
      send={() => {}}
      tableLabel="Room ABCDE"
      roomCode="ABCDE"
      user={{ id: "solo-player", name: "You" }}
      turnNotifications={{ load: async () => true, save: vi.fn(), device }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  const remove = await screen.findByRole("button", { name: "Remove this device" });
  fireEvent.click(remove);
  await waitFor(() => expect(device.remove).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Remove this device" })).toBeNull(),
  );
  expect(document.activeElement).toBe(
    screen.getByRole("switch", { name: "Turn notifications for my account" }),
  );
  expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toContain("removed");
});

it("announces an explicit permission denial and moves focus from the removed setup control", async () => {
  vi.stubGlobal("Notification", { permission: "default" });
  const device = {
    inspect: vi.fn().mockResolvedValue({ state: "not-enabled", generation: 0 }),
    enable: vi.fn(async () => {
      vi.stubGlobal("Notification", { permission: "denied" });
      throw new Error("Denied");
    }),
    remove: vi.fn(),
  };
  render(
    <GameRoom
      gameState={gameState}
      send={() => {}}
      tableLabel="Room ABCDE"
      roomCode="ABCDE"
      user={{ id: "solo-player", name: "You" }}
      turnNotifications={{ load: async () => true, save: vi.fn(), device }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  const enable = await screen.findByRole("button", { name: "Enable on this device" });
  await waitFor(() => expect(enable.getAttribute("aria-disabled")).toBe("false"));
  fireEvent.click(enable);
  await screen.findByText("Blocked on this device");
  expect(screen.queryByRole("button", { name: "Enable on this device" })).toBeNull();
  expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toContain("Blocked");
  expect(document.activeElement).toBe(
    screen.getByRole("switch", { name: "Turn notifications for my account" }),
  );
});

it("returns focus to the account switch if a device retry discovers Unavailable", async () => {
  const device = {
    inspect: vi
      .fn()
      .mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce({ state: "unavailable", generation: 0, reason: "Unsupported here" }),
    enable: vi.fn(),
    remove: vi.fn(),
  };
  render(
    <GameRoom
      gameState={gameState}
      send={() => {}}
      tableLabel="Room ABCDE"
      roomCode="ABCDE"
      user={{ id: "solo-player", name: "You" }}
      turnNotifications={{ load: async () => true, save: vi.fn(), device }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  fireEvent.click(await screen.findByRole("button", { name: "Retry device setup" }));
  await screen.findByText("Unavailable on this device");
  expect(document.activeElement).toBe(
    screen.getByRole("switch", { name: "Turn notifications for my account" }),
  );
  expect(device.enable).not.toHaveBeenCalled();
});

it("allows an explicit retry after a failed registration and announces the failure", async () => {
  const device = {
    inspect: vi
      .fn()
      .mockResolvedValueOnce({ state: "not-enabled", generation: 2 })
      .mockResolvedValueOnce({ state: "ready", generation: 2 }),
    enable: vi
      .fn()
      .mockRejectedValueOnce(new Error("Registration failed"))
      .mockResolvedValueOnce(undefined),
    remove: vi.fn(),
  };
  render(
    <GameRoom
      gameState={gameState}
      send={() => {}}
      tableLabel="Room ABCDE"
      roomCode="ABCDE"
      user={{ id: "solo-player", name: "You" }}
      turnNotifications={{ load: async () => true, save: vi.fn(), device }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  const enable = await screen.findByRole("button", { name: "Enable on this device" });
  await waitFor(() => expect(enable.getAttribute("aria-disabled")).toBe("false"));
  fireEvent.click(enable);
  const retry = await screen.findByRole("button", { name: "Retry device setup" });
  expect(screen.queryByText("Ready on this device")).toBeNull();
  expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toContain(
    "Could not set up",
  );
  fireEvent.click(retry);
  await screen.findByText("Ready on this device");
  expect(device.enable).toHaveBeenCalledTimes(2);
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
  expect(screen.getByRole("link", { name: /Return to lobby/ }).getAttribute("href")).toBe("/");
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
  expect(screen.getByRole("link", { name: /Return to lobby/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Play again" })).toBeNull();

  rerender(<GameRoom {...props} user={{ id: "visitor", name: "Visitor" }} />);
  expect(screen.getByRole("region", { name: "Finished room" }).textContent).toContain(
    "Waiting for the host",
  );
  expect(screen.queryByRole("button", { name: "Play again" })).toBeNull();
});

it("confirms an online Player's departure, keeps them in the room, and preserves their seat on failure", async () => {
  const send = vi
    .fn()
    .mockRejectedValueOnce(new Error("Connection lost"))
    .mockResolvedValue(undefined);
  const props = {
    gameState,
    send,
    roomCode: "ABCDE",
    tableLabel: "Room ABCDE",
    user: { id: "solo-player", name: "You" },
  };
  const room = render(<GameRoom {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Open table menu" }));
  expect(screen.getByRole("link", { name: /Return to lobby/ }).getAttribute("href")).toBe("/");
  expect(screen.getByText(/you will not leave this table/i)).toBeTruthy();
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Leave table" }));
  expect(screen.getByRole("dialog").textContent).toContain("reset the game for everyone");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(send).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Open table menu" }));
  fireEvent.click(screen.getByRole("button", { name: "Leave table" }));
  fireEvent.click(screen.getByRole("button", { name: "Leave table and reset game" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Connection lost"));
  expect(send).toHaveBeenCalledWith({ type: "LEAVE_GAME", playerId: "solo-player" });
  expect(screen.getByRole("dialog")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Leave table and reset game" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  room.rerender(
    <GameRoom
      {...props}
      gameState={{
        ...gameState,
        value: "WAITING_FOR_PLAYERS",
        context: { ...gameState.context, players: players.slice(1) },
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "Join Table" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Open table menu" }));
  expect(screen.queryByRole("button", { name: "Leave table" })).toBeNull();
  expect(screen.getByRole("link", { name: /Return to lobby/ })).toBeTruthy();
});

it("shows a brief departure notice to the remaining Players", async () => {
  vi.useFakeTimers();
  try {
    const props = {
      gameState,
      send: () => {},
      roomCode: "ABCDE",
      tableLabel: "Room ABCDE",
      user: { id: "ada", name: "Ada" },
    };
    const room = render(<GameRoom {...props} />);
    room.rerender(
      <GameRoom
        {...props}
        gameState={
          {
            ...gameState,
            value: "WAITING_FOR_PLAYERS",
            context: { ...gameState.context, players: players.slice(1) },
            roomNotice: "You left the table, so the game was reset.",
          } as unknown as RoomGameState
        }
      />,
    );
    expect(screen.getByText("You left the table, so the game was reset.")).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(5000));
    expect(screen.queryByText("You left the table, so the game was reset.")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it("keeps offline Leave table as a navigation link", () => {
  render(<SoloTable />);
  fireEvent.click(screen.getByRole("button", { name: "Open table menu" }));
  expect(screen.getByRole("link", { name: "Leave table" }).getAttribute("href")).toBe("/");
  expect(screen.queryByRole("link", { name: /Return to lobby/ })).toBeNull();
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

it("keeps the offline non-Host result's Return home link", () => {
  render(
    <GameRoom
      gameState={finishedState}
      send={() => {}}
      tableLabel="Offline table"
      user={{ id: "ada", name: "Ada" }}
    />,
  );
  expect(screen.getByRole("link", { name: "Return home" }).getAttribute("href")).toBe("/");
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

it("keeps the online chat log and draft across play, Results, and another game", async () => {
  let receive!: (event: { data: string }) => void;
  let connect!: () => void;
  class ChatSocket {
    onmessage: ((event: { data: string }) => void) | null = null;
    onopen: (() => void) | null = null;
    constructor(_url: string) {
      receive = (event) => this.onmessage?.(event);
      connect = () => this.onopen?.();
    }
    close() {}
  }
  vi.stubGlobal("WebSocket", ChatSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [], hasMore: false }),
    }),
  );
  vi.stubEnv("VITE_BACKEND_URL", "https://api.example.com");
  const props = {
    send: () => {},
    sendChat: vi.fn(),
    tableLabel: "Room ABCDE",
    roomCode: "ABCDE",
    user: { id: "solo-player", name: "You" },
  };
  try {
    const waiting = { ...gameState, value: "WAITING_FOR_PLAYERS" } as BigTwoGameMachineSnapshot;
    const room = render(<GameRoom {...props} gameState={waiting} />);
    await act(async () => {
      connect();
      await Promise.resolve();
    });
    const trigger = screen.getByRole("button", { name: "Room chat" });
    receive({
      data: JSON.stringify({
        type: "message",
        id: "ABCDE:1",
        order: 1,
        clientSendId: "one",
        author: "Ada",
        text: "first",
      }),
    });
    await waitFor(() => expect(trigger.getAttribute("aria-label")).toContain("1 unread"));
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole("textbox", { name: "Room chat message" }), {
      target: { value: "my draft" },
    });
    room.rerender(<GameRoom {...props} gameState={gameState} />);
    expect(screen.getByRole("log").textContent).toContain("first");
    room.rerender(<GameRoom {...props} gameState={finishedState} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    receive({
      data: JSON.stringify({
        type: "message",
        id: "ABCDE:2",
        order: 2,
        clientSendId: "two",
        author: "Ada",
        text: "second",
      }),
    });
    await waitFor(() => expect(trigger.getAttribute("aria-label")).toContain("1 unread"));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger.getAttribute("aria-label")).toBe("Room chat");
    room.rerender(<GameRoom {...props} gameState={gameState} />);
    expect(screen.getByRole("log").textContent).toContain("second");
    expect(
      (screen.getByRole("textbox", { name: "Room chat message" }) as HTMLTextAreaElement).value,
    ).toBe("my draft");
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
