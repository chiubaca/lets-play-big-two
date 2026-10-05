import { useCallback, useEffect, useRef, useState } from "react";
import type { GameEvent, RoomGameState } from "@big-two/game-state-machine";
import { api } from "./api";
import { useSession } from "./auth-client";
import { parseSocketJSON } from "./socket";
import type { ConnectionStatus } from "./types";
import { useForeground } from "./use-foreground";
import { useRoomChat, type RoomChatResult } from "./use-room-chat";
import { useRoomFocus } from "./use-room-focus";
import { useRoomSocket } from "./use-room-socket";
import { asError } from "./request";

export interface OnlineRoomOptions {
  roomId: string;
  // Set false for a mounted but hidden navigation screen. Backgrounding always
  // disconnects sockets and releases focus, regardless of this option.
  focused?: boolean;
}
export interface OnlineRoomResult {
  gameState: RoomGameState | undefined;
  role: "player" | "spectator" | null;
  loading: boolean;
  error: Error | null;
  connection: ConnectionStatus;
  refresh: () => Promise<void>;
  send: (event: GameEvent) => Promise<void>;
  join: () => Promise<void>;
  leave: () => Promise<void>;
  chat: RoomChatResult;
}

function isRoomState(value: unknown): value is RoomGameState {
  if (!value || typeof value !== "object") return false;
  const room = value as Partial<RoomGameState>;
  return (
    typeof room.value === "string" &&
    !!room.context &&
    Array.isArray(room.context.players) &&
    !!room.handCounts &&
    typeof room.spectatorCount === "number"
  );
}

export function useOnlineRoom({ roomId, focused = true }: OnlineRoomOptions): OnlineRoomResult {
  const { data: session } = useSession();
  const user = session?.user;
  const viewerId = user?.id;
  const foreground = useForeground();
  const enabled = foreground && focused;
  const key = `${roomId}:${viewerId ?? ""}`;
  const [state, setState] = useState<{
    key: string;
    gameState?: RoomGameState;
    loading: boolean;
    error: Error | null;
  }>({ key, loading: false, error: null });
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!viewerId || !enabled) return;
    const current = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState((previous) => ({
      key,
      gameState: previous.key === key ? previous.gameState : undefined,
      loading: true,
      error: null,
    }));
    try {
      const gameState = await api.getRoom(roomId, abort.signal);
      if (!isRoomState(gameState)) throw new Error("The server returned an invalid room state");
      if (current === generation.current) setState({ key, gameState, loading: false, error: null });
    } catch (cause) {
      if (current === generation.current && !abort.signal.aborted)
        setState((previous) => ({ ...previous, loading: false, error: asError(cause) }));
    }
  }, [roomId, viewerId, enabled, key]);

  useEffect(() => {
    if (viewerId && enabled) void refresh();
    else setState((previous) => ({ ...previous, loading: false }));
    return () => {
      ++generation.current;
      controller.current?.abort();
    };
  }, [viewerId, enabled, refresh]);
  const connection = useRoomSocket({
    path: `/api/room/ws/${encodeURIComponent(roomId)}`,
    viewerId,
    enabled,
    onOpen: () => void refresh(),
    onMessage: (data) => {
      const gameState = parseSocketJSON(data);
      if (!isRoomState(gameState)) return;
      // A slower HTTP response must never overwrite a newer socket snapshot.
      ++generation.current;
      controller.current?.abort();
      setState({ key, gameState, loading: false, error: null });
    },
  });
  useRoomFocus(roomId, viewerId, enabled);
  const chat = useRoomChat({ roomId, viewerId, enabled });
  const send = useCallback(
    async (event: GameEvent) => {
      if (!viewerId) throw new Error("Sign in to act at the table");
      await api.action(roomId, event);
      await refresh();
    },
    [roomId, viewerId, refresh],
  );
  const gameState = viewerId && state.key === key ? state.gameState : undefined;
  return {
    gameState,
    role:
      !viewerId || !gameState
        ? null
        : gameState.context.players.some((player) => player.id === viewerId)
          ? "player"
          : "spectator",
    loading: Boolean(viewerId && enabled && (state.key !== key || state.loading)),
    error: state.key === key ? state.error : null,
    connection,
    refresh,
    send,
    join: async () => {
      if (!user) throw new Error("Sign in to join a room");
      await api.joinRoom(roomId, user);
      await refresh();
    },
    // Explicit only: unmounting/returning to the lobby never sends LEAVE_GAME.
    leave: async () => {
      if (!user) throw new Error("Sign in to leave a room");
      await api.leaveRoom(roomId, user.id);
      await refresh();
    },
    chat,
  };
}
