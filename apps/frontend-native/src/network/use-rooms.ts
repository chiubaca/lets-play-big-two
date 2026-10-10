import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { CreatedRoom, RoomSummary } from "./types";
import { useForeground } from "./use-foreground";
import { queryKeys, useQueryAccess } from "./query-client";
import { useRoomMembership } from "./use-room-membership";

export interface RoomsResult {
  rooms: RoomSummary[];
  loading: boolean;
  error: Error | null;
  creating: boolean;
  refresh: () => Promise<void>;
  createRoom: () => Promise<CreatedRoom>;
  // Joining claims a player seat explicitly; merely viewing a room spectates.
  joinRoom: (roomId: string) => Promise<void>;
  leaveRoom: (roomId: string) => Promise<void>;
}

export function useRooms(): RoomsResult {
  const access = useQueryAccess();
  const user = access.user;
  const viewerId = user?.id;
  const active = useForeground();
  const enabled = active && access.authenticated;
  const currentEnabled = useRef(enabled);
  currentEnabled.current = enabled;
  const client = useQueryClient();
  const membership = useRoomMembership();
  const key = queryKeys.rooms(access.scope);
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      access.assertCurrent();
      return (await api.listRooms(signal)).rooms;
    },
    enabled,
    staleTime: 10_000,
    refetchInterval: enabled ? 15_000 : false,
  });
  useEffect(() => {
    if (!enabled) void client.cancelQueries({ queryKey: key });
  }, [client, enabled, access.scope]);
  const refresh = useCallback(async () => {
    if (!currentEnabled.current || !access.isCurrent()) return;
    await query.refetch();
  }, [access.isCurrent, query.refetch]);
  const create = useMutation({
    mutationKey: [...key, "create"],
    mutationFn: () => {
      access.assertCurrent();
      return api.createRoom();
    },
    onSuccess: () => {
      if (access.isCurrent()) return client.invalidateQueries({ queryKey: key });
    },
  });

  return {
    rooms: viewerId ? (query.data ?? []) : [],
    loading: enabled && query.isFetching,
    error: viewerId ? query.error : null,
    creating: create.isPending,
    refresh,
    createRoom: async () => {
      access.assertCurrent();
      const room = await create.mutateAsync();
      if (!access.isCurrent()) throw new Error("Your session changed. Reopen the lobby.");
      return room;
    },
    joinRoom: membership.joinRoom,
    leaveRoom: membership.leaveRoom,
  };
}
