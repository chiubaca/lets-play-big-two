import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { api } from "./api";
import { queryKeys, useQueryAccess } from "./query-client";
import { useForeground } from "./use-foreground";

export function useRoomMembership() {
  const access = useQueryAccess();
  const client = useQueryClient();
  const foreground = useForeground();
  const active = useRef(foreground);
  active.current = foreground;
  const assertCurrent = () => {
    access.assertCurrent();
    if (!active.current) throw new Error("Open the app to join or leave a table.");
  };
  const reconcile = async (roomId: string) => {
    if (!access.isCurrent()) return;
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.rooms(access.scope) }),
      client.invalidateQueries({ queryKey: queryKeys.room(access.scope, roomId) }),
    ]);
  };
  const join = useMutation({
    mutationKey: [...access.scope, "membership", "join"],
    mutationFn: async (roomId: string) => {
      assertCurrent();
      if (!access.user) throw new Error("Sign in to join a room");
      await api.joinRoom(roomId, access.user);
    },
    onSettled: (_data, _error, roomId) => reconcile(roomId),
  });
  const leave = useMutation({
    mutationKey: [...access.scope, "membership", "leave"],
    mutationFn: async (roomId: string) => {
      assertCurrent();
      if (!access.user) throw new Error("Sign in to leave a room");
      await api.leaveRoom(roomId, access.user.id);
    },
    onSettled: (_data, _error, roomId) => reconcile(roomId),
  });
  return {
    joining: join.isPending,
    leaving: leave.isPending,
    joinRoom: async (roomId: string) => {
      assertCurrent();
      await join.mutateAsync(roomId);
      if (!access.isCurrent()) throw new Error("Your session changed. Reopen the table.");
    },
    leaveRoom: async (roomId: string) => {
      assertCurrent();
      await leave.mutateAsync(roomId);
      if (!access.isCurrent()) throw new Error("Your session changed. Reopen the table.");
    },
  };
}
