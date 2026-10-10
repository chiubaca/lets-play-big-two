import { useCallback, useEffect, useMemo, useRef } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GameEvent, RoomGameState } from "@big-two/game-state-machine";
import { api } from "./api";
import { parseSocketJSON } from "./socket";
import type { ConnectionStatus } from "./types";
import { useForeground } from "./use-foreground";
import { useRoomChat, type RoomChatResult } from "./use-room-chat";
import { useRoomFocus } from "./use-room-focus";
import { useRoomSocket } from "./use-room-socket";
import { useRoomMembership } from "./use-room-membership";
import { queryKeys, useQueryAccess } from "./query-client";

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
  acting: boolean;
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
  const queryAccess = useQueryAccess();
  const user = queryAccess.user;
  const viewerId = user?.id;
  const foreground = useForeground();
  const membership = useRoomMembership();
  const enabled = foreground && focused && queryAccess.authenticated;
  const key = `${roomId}:${viewerId ?? ""}:${queryAccess.scope[4]}`;
  const access = useRef({ key, enabled, authenticated: queryAccess.authenticated });
  access.current = { key, enabled, authenticated: queryAccess.authenticated };
  const client = useQueryClient();
  const queryKey = useMemo(
    () => queryKeys.room(queryAccess.scope, roomId),
    [queryAccess.scope, roomId],
  );
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      queryAccess.assertCurrent();
      if (!access.current.enabled || access.current.key !== key)
        throw new Error("Open the room to refresh it.");
      const snapshot = await api.getRoom(roomId, signal);
      if (!isRoomState(snapshot)) throw new Error("The server returned an invalid room state");
      return snapshot;
    },
    enabled,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (!enabled) void client.cancelQueries({ queryKey });
  }, [client, queryKey, enabled]);
  const refresh = useCallback(async () => {
    if (!queryAccess.isCurrent() || !access.current.enabled || access.current.key !== key) return;
    await query.refetch({ cancelRefetch: false });
  }, [queryAccess.isCurrent, key, query.refetch]);
  const connection = useRoomSocket({
    path: `/api/room/ws/${encodeURIComponent(roomId)}`,
    viewerId,
    enabled,
    onOpen: () => void refresh(),
    onMessage: (data) => {
      if (!queryAccess.isCurrent() || !access.current.enabled) return;
      const gameState = parseSocketJSON(data);
      if (!isRoomState(gameState)) return;
      // A slower HTTP response must never overwrite a newer socket snapshot.
      void client.cancelQueries({ queryKey });
      client.setQueryData(queryKey, gameState);
    },
  });
  useRoomFocus(roomId, viewerId, foreground && focused, queryAccess.authenticated);
  const chat = useRoomChat({ roomId, viewerId, enabled });
  const actionKey = useMemo(() => [...queryKey, "action"] as const, [queryKey]);
  const action = useMutation({
    mutationKey: actionKey,
    mutationFn: (event: GameEvent) => {
      queryAccess.assertCurrent();
      if (!access.current.enabled || access.current.key !== key)
        throw new Error("Open the room to act at the table.");
      return api.action(roomId, event);
    },
    onSettled: async () => {
      if (!queryAccess.isCurrent()) return;
      await Promise.all([
        client.invalidateQueries({ queryKey }),
        client.invalidateQueries({ queryKey: queryKeys.rooms(queryAccess.scope) }),
      ]);
    },
  });
  const actionCount = useIsMutating({ mutationKey: actionKey, exact: true });
  const send = useCallback(
    async (event: GameEvent) => {
      if (!viewerId || access.current.key !== key) throw new Error("Sign in to act at the table");
      if (!access.current.authenticated) throw new Error("Wait for your session to be confirmed");
      queryAccess.assertCurrent();
      if (event.type === "JOIN_GAME") await membership.joinRoom(roomId);
      else if (event.type === "LEAVE_GAME") await membership.leaveRoom(roomId);
      else await action.mutateAsync(event);
      if (!queryAccess.isCurrent()) throw new Error("Your session changed. Reopen the table.");
    },
    [
      roomId,
      viewerId,
      key,
      membership.joinRoom,
      membership.leaveRoom,
      queryAccess.assertCurrent,
      queryAccess.isCurrent,
      action.mutateAsync,
    ],
  );
  const gameState = viewerId ? query.data : undefined;
  return {
    gameState,
    role:
      !viewerId || !gameState
        ? null
        : gameState.context.players.some((player) => player.id === viewerId)
          ? "player"
          : "spectator",
    loading: enabled && query.isFetching,
    acting: actionCount > 0 || membership.joining || membership.leaving,
    error: viewerId ? query.error : null,
    connection,
    refresh,
    send,
    join: () => membership.joinRoom(roomId),
    // Explicit only: unmounting/returning to the lobby never sends LEAVE_GAME.
    leave: () => membership.leaveRoom(roomId),
    chat,
  };
}
