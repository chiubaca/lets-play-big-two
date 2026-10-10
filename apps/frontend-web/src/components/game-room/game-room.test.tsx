// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { BigTwoGameMachineSnapshot, RoomGameState } from "@big-two/game-state-machine";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useState } from "react";

import { GameRoom, type BotSettings } from "./game-room";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

const players = [
  { id: "solo-player", name: "You", hand: [] },
  { id: "ada", name: "Ada", hand: [] },
  { id: "jev", name: "Jev", hand: [] },
  { id: "alan", name: "May", hand: [] },
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
    { id: "alan", name: "May", botStrategy: "basic" },
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

it("offers a persistent auto-pass switch in table settings", () => {
  render(<SoloTable />);
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  const toggle = screen.getByRole("switch", { name: "Auto-pass" });
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(localStorage.getItem("big-two-auto-pass")).toBe("true");
});

it("does not offer auto-pass to spectators", () => {
  render(
    <GameRoom
      gameState={gameState}
      send={() => {}}
      tableLabel="ABCDE"
      roomCode="ABCDE"
      user={{ id: "spectator", name: "Spectator" }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  expect(screen.queryByRole("switch", { name: "Auto-pass" })).toBeNull();
});

it("uses a sound switch whose checked state reflects whether sound is on", () => {
  render(<SoloTable />);
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  const toggle = screen.getByRole("switch", { name: "Turn sound" });
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(localStorage.getItem("big-two-muted")).toBe("true");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(localStorage.getItem("big-two-muted")).toBe("false");
});

it("keeps hints in the footer without branding or a duplicate sound button", () => {
  const { container } = render(
    <GameRoom
      gameState={gameState}
      send={() => {}}
      requestHint={() => null}
      tableLabel="Solo table"
      user={{ id: "solo-player", name: "You" }}
    />,
  );
  const footer = container.querySelector(".table-footnote")!;
  expect(footer.textContent).not.toContain("BIG TWO");
  expect(
    within(footer as HTMLElement).getByRole("button", { name: "Suggest a move" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: /mute sounds/i })).toBeNull();
});

it("uses the current user's profile emoji at the solo table and spades for other human seats", () => {
  const { container } = render(
    <GameRoom
      gameState={gameState}
      send={() => {}}
      tableLabel="Solo table"
      user={{ id: "solo-player", name: "You", emoji: "🐲" }}
    />,
  );
  expect(container.querySelector(".seat-you .player-avatar")?.textContent).toBe("🐲");
  expect(container.querySelector(".seat-top .player-avatar")?.textContent).toBe("♠️");
});

it("shows other online players' emojis and retains robot avatars for bots", () => {
  const online = {
    ...gameState,
    context: {
      ...gameState.context,
      players: players.map((player, index) => ({
        ...player,
        emoji: index === 1 ? "🦊" : "🐲",
        isBot: index === 2,
      })),
    },
  };
  const { container } = render(
    <GameRoom
      gameState={online}
      send={() => {}}
      tableLabel="ABCDE"
      roomCode="ABCDE"
      user={{ id: "solo-player", name: "You", emoji: "🍀" }}
    />,
  );
  const avatars = Array.from(
    container.querySelectorAll(".player-avatar"),
    (avatar) => avatar.textContent,
  );
  expect(avatars).toContain("🦊");
  expect(avatars).toContain("🤖");
  expect(container.querySelector(".seat-you .player-avatar")?.textContent).toBe("🍀");
});

it("uses the seated player's emoji in the spectator's bottom seat", () => {
  const online = {
    ...gameState,
    context: {
      ...gameState.context,
      players: players.map((player) => ({ ...player, emoji: "🦊" })),
    },
  };
  const { container } = render(
    <GameRoom
      gameState={online}
      send={() => {}}
      tableLabel="ABCDE"
      roomCode="ABCDE"
      user={{ id: "spectator", name: "Spectator", emoji: "🍀" }}
    />,
  );
  expect(container.querySelector(".seat-you .player-avatar")?.textContent).toBe("🦊");
});

it("lets the online Host fill seats and confirms removing a bot mid-game", async () => {
  const send = vi.fn().mockResolvedValue(undefined);
  const onlineState = {
    ...gameState,
    value: "WAITING_FOR_PLAYERS",
    context: { ...gameState.context, players: players.slice(0, 2) },
  } as BigTwoGameMachineSnapshot;
  const props = { send, tableLabel: "ABCDE", roomCode: "ABCDE", user: players[0] };
  const view = render(<GameRoom {...props} gameState={onlineState} />);
  fireEvent.click(screen.getByRole("button", { name: "Fill with bots" }));
  await waitFor(() => expect(send).toHaveBeenCalledWith({ type: "FILL_WITH_BOTS" }));
  view.rerender(
    <GameRoom
      {...props}
      gameState={{
        ...gameState,
        context: {
          ...gameState.context,
          players: [players[0], { ...players[1], name: "Bot 1", isBot: true }],
        },
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Open table menu" }));
  expect(screen.queryByRole("button", { name: "Remove Bot 1" })).toBeNull();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove Bot 1" }));
  expect(screen.getByText(/opens this seat for a human/)).toBeTruthy();
  expect(send).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Remove bot and reset game" }));
  await waitFor(() => expect(send).toHaveBeenCalledWith({ type: "REMOVE_BOT", botId: "ada" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("hides online bot controls from non-Hosts and spectators", () => {
  const state = {
    ...gameState,
    value: "WAITING_FOR_PLAYERS",
    context: {
      ...gameState.context,
      players: [players[0], players[1], { ...players[2], isBot: true }],
    },
  } as BigTwoGameMachineSnapshot;
  const props = { send: vi.fn(), tableLabel: "ABCDE", roomCode: "ABCDE", gameState: state };
  const view = render(<GameRoom {...props} user={players[1]} />);
  expect(screen.queryByRole("button", { name: "Fill with bots" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  expect(screen.queryByRole("button", { name: /Remove Jev/ })).toBeNull();
  view.unmount();
  render(<GameRoom {...props} user={{ id: "spectator", name: "Spectator" }} />);
  expect(screen.queryByRole("button", { name: "Fill with bots" })).toBeNull();
});

it("keeps bot removal confirmation open and shows server failures", async () => {
  render(
    <GameRoom
      gameState={{
        ...gameState,
        context: {
          ...gameState.context,
          players: [players[0], { ...players[1], name: "Bot 1", isBot: true }],
        },
      }}
      send={vi.fn().mockRejectedValue(new Error("Connection lost"))}
      tableLabel="ABCDE"
      roomCode="ABCDE"
      user={players[0]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove Bot 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove bot and reset game" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Connection lost"));
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("changes an opponent strategy without decorating player names", () => {
  render(<SoloTable />);

  expect(screen.queryByRole("button", { name: /Share room/ })).toBeNull();
  expect(screen.getByText("Jev")).toBeTruthy();
  expect(screen.getByTitle("Jev unavailable — using Basic AI")).toBeTruthy();
  expect(screen.queryByText("Ada ✨[jev]")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  const adaMode = screen.getByRole("group", { name: "AI mode for Ada" });
  fireEvent.click(adaMode.querySelectorAll("button")[1]);

  expect(screen.getAllByText("Ada")).toHaveLength(2);
  expect(screen.queryByText(/✨\[jev\]/)).toBeNull();
  expect(adaMode.querySelectorAll("button")[1].getAttribute("aria-pressed")).toBe("true");
});

it("hides solo AI settings when strategies are fixed while retaining fallback indicators", () => {
  render(
    <GameRoom
      botSettings={{
        players: players.slice(1).map((player) => ({ ...player, botStrategy: "jev" })),
      }}
      gameState={gameState}
      jevFallbackPlayerIds={new Set(["jev"])}
      send={() => {}}
      tableLabel="Solo table"
      user={{ id: "solo-player", name: "You" }}
    />,
  );

  expect(screen.getByText("Ada")).toBeTruthy();
  expect(screen.queryByText(/✨\[jev\]/)).toBeNull();
  expect(screen.getByTitle("Jev unavailable — using Basic AI")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  const settings = within(screen.getByRole("dialog"));
  expect(settings.queryByText("Opponent AI")).toBeNull();
  expect(settings.queryByRole("group", { name: /AI mode/ })).toBeNull();
  expect(settings.getByRole("switch", { name: "Turn sound" })).toBeTruthy();
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
    "Turn notifications are on for your account",
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
  const enable = await screen.findByRole("switch", { name: "Enable on this device" });
  await waitFor(() => expect(enable.getAttribute("aria-disabled")).toBe("false"));
  expect(device.enable).not.toHaveBeenCalled();
  fireEvent.click(enable);
  await waitFor(() => expect(screen.getByText("Ready on this device")).toBeTruthy());
  expect(device.enable).toHaveBeenCalledWith(3);
  expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toContain(
    "Notifications are ready on this device.",
  );
  expect(
    screen.getByText("This device is set up to receive alerts. Some notifications may not arrive."),
  ).toBeTruthy();
  const remove = screen.getByRole("switch", { name: "Turn off on this device" });
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
  expect(screen.queryByRole("switch", { name: "Enable on this device" })).toBeNull();
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
  screen.getByRole("switch", { name: "Turn off on this device" }).focus();
  fireEvent.focus(window);
  await screen.findByText("Blocked on this device");
  expect(screen.queryByRole("switch", { name: "Enable on this device" })).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("switch", { name: "Turn notifications for my account" }),
  );
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
  const remove = await screen.findByRole("switch", { name: "Turn off on this device" });
  fireEvent.click(remove);
  await waitFor(() => expect(device.remove).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(screen.queryByRole("switch", { name: "Turn off on this device" })).toBeNull(),
  );
  expect(document.activeElement).toBe(
    screen.getByRole("switch", { name: "Turn notifications for my account" }),
  );
  expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toContain(
    "Notifications are off on this device. Your account setting is unchanged.",
  );
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
  const enable = await screen.findByRole("switch", { name: "Enable on this device" });
  await waitFor(() => expect(enable.getAttribute("aria-disabled")).toBe("false"));
  fireEvent.click(enable);
  await screen.findByText("Blocked on this device");
  expect(screen.queryByRole("switch", { name: "Enable on this device" })).toBeNull();
  expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toContain(
    "Notifications are blocked. Allow them in your browser settings, then try again.",
  );
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
  const enable = await screen.findByRole("switch", { name: "Enable on this device" });
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

it("copies the online room URL when Web Share is unavailable", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");
  Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
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

    fireEvent.click(screen.getByRole("button", { name: "Share room ABCDE" }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/room/ABCDE`);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Share room ABCDE" }).title).toBe(
        "Room link copied",
      ),
    );
  } finally {
    if (originalShare) Object.defineProperty(navigator, "share", originalShare);
    else Reflect.deleteProperty(navigator, "share");
    if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});

it.each(["success", "cancel", "failure"])("shares the online room URL: %s", async (result) => {
  const share = vi.fn().mockImplementation(async () => {
    if (result === "cancel") throw new DOMException("Cancelled", "AbortError");
    if (result === "failure") throw new Error("Share failed");
  });
  const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");
  Object.defineProperty(navigator, "share", { configurable: true, value: share });

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
    fireEvent.click(screen.getByRole("button", { name: "Share room ABCDE" }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        title: "Join my Big Two room",
        url: `${window.location.origin}/room/ABCDE`,
      }),
    );
    if (result === "failure") {
      await screen.findByText(
        `Could not share the room. Room link: ${window.location.origin}/room/ABCDE`,
      );
    } else {
      expect(screen.queryByText(/Could not share the room/)).toBeNull();
    }
  } finally {
    if (originalShare) Object.defineProperty(navigator, "share", originalShare);
    else Reflect.deleteProperty(navigator, "share");
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

it("shows only the result modal on late entry and a witnessed finish", () => {
  const props = {
    send: () => {},
    tableLabel: "Room ABCDE",
    roomCode: "ABCDE",
    user: { id: "solo-player", name: "You" },
  };
  const { unmount } = render(<GameRoom {...props} gameState={finishedState} />);

  expect(screen.queryByRole("button", { name: "Results" })).toBeNull();
  expect(document.querySelector(".finished-room-strip")).toBeNull();
  expect(screen.getByRole("dialog")).toBeTruthy();

  unmount();
  const room = render(<GameRoom {...props} gameState={gameState} />);
  room.rerender(<GameRoom {...props} gameState={finishedState} />);
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("opens the result for a finished room loaded after connecting", () => {
  const props = {
    send: () => {},
    tableLabel: "Room ABCDE",
    roomCode: "ABCDE",
    user: { id: "visitor", name: "Visitor" },
  };
  const { rerender } = render(<GameRoom {...props} />);
  expect(screen.getByText("Connecting to the table…")).toBeTruthy();
  rerender(<GameRoom {...props} gameState={finishedState} />);
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Results" })).toBeNull();
  expect(screen.getByRole("link", { name: /Return to lobby/ })).toBeTruthy();
});

it("cannot dismiss results by Escape or outside interaction and keeps the room inert", async () => {
  render(
    <GameRoom
      gameState={finishedState}
      send={() => {}}
      tableLabel="Room ABCDE"
      roomCode="ABCDE"
      user={{ id: "solo-player", name: "You" }}
    />,
  );
  expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  expect(screen.queryByRole("button", { name: "Share room ABCDE" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.pointerDown(document.querySelector('[data-slot="dialog-overlay"]')!);
  fireEvent.click(document.querySelector('[data-slot="dialog-overlay"]')!);
  await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
  expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
});

it("keeps results and a retry available after a failed restart, closing only on new state", async () => {
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
  fireEvent.click(screen.getByRole("button", { name: "Start a new game" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Could not restart now"));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Return to lobby/ }).getAttribute("href")).toBe("/");
  fireEvent.click(screen.getByRole("button", { name: "Start a new game" }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("dialog")).toBeTruthy();
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
  expect(screen.getByRole("dialog").textContent).toContain("Beautifully played.");
  expect(screen.getByText("Waiting for the host to start another game…")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Return to lobby/ })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Start a new game" })).toBeNull();
  expect(screen.getByRole("button", { name: "Leave table" })).toBeTruthy();

  rerender(<GameRoom {...props} user={{ id: "visitor", name: "Visitor" }} />);
  expect(screen.getByRole("dialog").textContent).toContain("Waiting for the host");
  expect(screen.queryByRole("button", { name: "Start a new game" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Leave table" })).toBeNull();
});

it("keeps an exit available during a pending restart", async () => {
  let resolve!: () => void;
  const send = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  render(
    <GameRoom
      gameState={finishedState}
      send={send}
      tableLabel="ABCDE"
      roomCode="ABCDE"
      user={{ id: "solo-player", name: "You" }}
    />,
  );
  const restart = screen.getByRole("button", { name: "Start a new game" });
  fireEvent.click(restart);
  expect((restart as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(restart);
  expect(send).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("link", { name: /Return to lobby/ }).getAttribute("href")).toBe("/");
  await act(async () => resolve());
  expect((restart as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("allows a finished player to leave, cancel back to results, and retry a failed departure", async () => {
  const send = vi
    .fn()
    .mockRejectedValueOnce(new Error("Connection lost"))
    .mockResolvedValue(undefined);
  const props = {
    gameState: finishedState,
    send,
    tableLabel: "ABCDE",
    roomCode: "ABCDE",
    user: { id: "ada", name: "Ada" },
  };
  const room = render(<GameRoom {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Leave table" }));
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.getByRole("dialog").textContent).toContain("Leave this table?");
  const leaveOptions = within(screen.getByRole("dialog"));
  expect(leaveOptions.getAllByRole("button").map((button) => button.textContent)).toEqual([
    "Cancel",
    "Leave table and reset game",
    "Close",
  ]);
  const leaveAction = leaveOptions.getByRole("button", { name: "Leave table and reset game" });
  expect(leaveAction.parentElement!.nextElementSibling!.textContent).toContain(
    "reset the game for everyone",
  );
  expect(screen.getByRole("dialog").textContent).toContain("reset the game for everyone");
  expect(
    screen
      .getByRole("button", { name: "Leave table and reset game" })
      .classList.contains("table-leave-button"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("dialog").textContent).toContain("Beautifully played.");
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Leave table" }));
  fireEvent.click(screen.getByRole("button", { name: "Leave table and reset game" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Connection lost"));
  expect(screen.getByRole("link", { name: /Return to lobby/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Leave table and reset game" }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
  expect(send).toHaveBeenCalledWith({ type: "LEAVE_GAME", playerId: "ada" });
  room.rerender(
    <GameRoom
      {...props}
      gameState={
        {
          ...gameState,
          value: "WAITING_FOR_PLAYERS",
          context: {
            ...gameState.context,
            players: players.filter((player) => player.id !== "ada"),
          },
        } as BigTwoGameMachineSnapshot
      }
    />,
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Join Table" })).toBeTruthy();
});

it("replaces an open settings modal with a single result modal when the game finishes", () => {
  const props = {
    send: () => {},
    tableLabel: "ABCDE",
    roomCode: "ABCDE",
    user: { id: "ada", name: "Ada" },
  };
  const room = render(<GameRoom {...props} gameState={gameState} />);
  fireEvent.click(screen.getByRole("button", { name: "Table settings" }));
  room.rerender(<GameRoom {...props} gameState={finishedState} />);
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(screen.queryByRole("switch", { name: "Auto-pass" })).toBeNull();
  room.rerender(<GameRoom {...props} gameState={gameState} />);
  expect(screen.queryByRole("dialog")).toBeNull();
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
  expect(screen.getByRole("link", { name: "Return home" }).getAttribute("href")).toBe("/");
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
  rerender(<GameRoom {...props} gameState={gameState} />);
  expect(screen.queryByRole("dialog")).toBeNull();
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
    room.rerender(<GameRoom {...props} gameState={gameState} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(trigger.getAttribute("aria-label")).toBe("Room chat");
    expect(screen.getByRole("log").textContent).toContain("second");
    expect(
      (screen.getByRole("textbox", { name: "Room chat message" }) as HTMLTextAreaElement).value,
    ).toBe("my draft");
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
