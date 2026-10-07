import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useSession } from "./auth-client";
import type { CreatedRoom, RoomSummary } from "./types";
import { useForeground } from "./use-foreground";
import { asError } from "./request";

export interface RoomsResult {
  rooms: RoomSummary[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  createRoom: () => Promise<CreatedRoom>;
  // Joining claims a player seat explicitly; merely viewing a room spectates.
  joinRoom: (roomId: string) => Promise<void>;
  leaveRoom: (roomId: string) => Promise<void>;
}

export function useRooms(): RoomsResult {
  const { data: session, isPending } = useSession();
  const user = session?.user;
  const viewerId = user?.id;
  const active = useForeground();
  const access = useRef({ viewerId, authenticated: !isPending });
  access.current = { viewerId, authenticated: !isPending };
  const [state, setState] = useState<{
    viewerId?: string;
    rooms: RoomSummary[];
    loading: boolean;
    error: Error | null;
  }>({ rooms: [], loading: false, error: null });
  if (state.viewerId !== viewerId) setState({ viewerId, rooms: [], loading: false, error: null });
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!viewerId || !access.current.authenticated || access.current.viewerId !== viewerId) return;
    const current = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setState((previous) => ({
      viewerId,
      rooms: previous.viewerId === viewerId ? previous.rooms : [],
      loading: true,
      error: null,
    }));
    try {
      const result = await api.listRooms(abort.signal);
      if (current === generation.current)
        setState({ viewerId, rooms: result.rooms, loading: false, error: null });
    } catch (cause) {
      if (current === generation.current && !abort.signal.aborted)
        setState((previous) => ({ ...previous, loading: false, error: asError(cause) }));
    }
  }, [viewerId]);
  useEffect(() => {
    if (active && viewerId && !isPending) void refresh();
    const timer =
      active && viewerId && !isPending ? setInterval(() => void refresh(), 15_000) : undefined;
    return () => {
      ++generation.current;
      controller.current?.abort();
      clearInterval(timer);
    };
  }, [active, viewerId, isPending, refresh]);

  return {
    rooms: state.viewerId === viewerId && viewerId ? state.rooms : [],
    loading: Boolean(viewerId && (state.viewerId !== viewerId || state.loading)),
    error: state.viewerId === viewerId ? state.error : null,
    refresh,
    createRoom: async () => {
      if (!user || access.current.viewerId !== viewerId)
        throw new Error("Sign in to create a room");
      if (!access.current.authenticated) throw new Error("Wait for your session to be confirmed");
      const room = await api.createRoom();
      await refresh();
      return room;
    },
    joinRoom: async (roomId) => {
      if (!user || access.current.viewerId !== viewerId) throw new Error("Sign in to join a room");
      if (!access.current.authenticated) throw new Error("Wait for your session to be confirmed");
      await api.joinRoom(roomId, user);
      await refresh();
    },
    leaveRoom: async (roomId) => {
      if (!user || access.current.viewerId !== viewerId) throw new Error("Sign in to leave a room");
      if (!access.current.authenticated) throw new Error("Wait for your session to be confirmed");
      await api.leaveRoom(roomId, user.id);
      await refresh();
    },
  };
}
