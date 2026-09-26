// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, cleanup, fireEvent, act } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { useSubscribeToGameState } from "./-subscribe-to-game-state";
import { OnlineGameRoom } from "../../components/game-room/online-game-room";

const getRoom = vi.fn();

vi.mock("../../libs/hono-client", () => ({
  honoClient: { api: { room: { ":roomId": { $get: (...args: unknown[]) => getRoom(...args) } } } },
}));

vi.mock("../../components/game-room/game-room", () => ({
  GameRoom: ({ gameState }: { gameState?: { value: string } }) => (
    <main>{gameState ? `Table: ${gameState.value}` : "Connecting to the table…"}</main>
  ),
}));

class SilentWebSocket {
  static instances: SilentWebSocket[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(_url: string) {
    SilentWebSocket.instances.push(this);
  }
  close() {}
}

function Rejoin() {
  useSubscribeToGameState({ roomId: "ABCDE", viewerId: "player-1" });
  return <OnlineGameRoom roomId="ABCDE" user={{ id: "player-1", name: "Player" }} />;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  getRoom.mockReset();
  SilentWebSocket.instances = [];
});

function renderRejoin() {
  vi.stubEnv("VITE_BACKEND_URL", "https://api.example.com");
  vi.stubGlobal("WebSocket", SilentWebSocket);
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Rejoin />
    </QueryClientProvider>,
  );
}

test("rejoining loads the table even when the WebSocket does not deliver an initial snapshot", async () => {
  getRoom.mockResolvedValue({ ok: true, json: async () => ({ value: "WAITING_FOR_PLAYERS" }) });
  renderRejoin();

  expect(screen.getByText("Connecting to the table…")).toBeTruthy();
  await waitFor(() => expect(screen.getByText("Table: WAITING_FOR_PLAYERS")).toBeTruthy());
  expect(getRoom).toHaveBeenCalledWith({ param: { roomId: "ABCDE" } });
});

test("WebSocket updates are not overwritten by a slower initial HTTP response", async () => {
  let resolveResponse!: (value: unknown) => void;
  getRoom.mockReturnValue(new Promise((resolve) => (resolveResponse = resolve)));
  renderRejoin();

  await act(async () => {
    SilentWebSocket.instances[0].onmessage?.({
      data: JSON.stringify({ value: "NEXT_PLAYER_TURN" }),
    } as MessageEvent);
  });
  await waitFor(() => expect(screen.getByText("Table: NEXT_PLAYER_TURN")).toBeTruthy());
  await act(async () => {
    resolveResponse({ ok: true, json: async () => ({ value: "WAITING_FOR_PLAYERS" }) });
  });
  expect(screen.getByText("Table: NEXT_PLAYER_TURN")).toBeTruthy();
});

test("a missing room shows an error and offers a retry instead of connecting forever", async () => {
  getRoom.mockResolvedValueOnce({ ok: false, status: 404 });
  getRoom.mockResolvedValueOnce({ ok: true, json: async () => ({ value: "WAITING_FOR_PLAYERS" }) });
  renderRejoin();

  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("room could not be found"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getByText("Table: WAITING_FOR_PLAYERS")).toBeTruthy());
});
