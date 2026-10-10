import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useInfiniteQuery,
  useIsMutating,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { api } from "./api";
import { isChatFrame, mergeChat } from "./chat";
import { parseSocketJSON } from "./socket";
import type { ChatFrame, ChatInput, ChatMessage, ConnectionStatus } from "./types";
import { useRoomSocket } from "./use-room-socket";
import { queryKeys, useQueryAccess } from "./query-client";

export interface RoomChatResult {
  messages: ChatMessage[];
  connection: ConnectionStatus;
  loading: boolean;
  loadingOlder: boolean;
  sending: boolean;
  hasOlder: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  loadOlder: () => Promise<void>;
  // String retries retain their UUID; callers can also supply a stable draft ID.
  send: (input: string | ChatInput) => Promise<ChatMessage>;
}

type HistoryPage = { messages: ChatMessage[]; hasMore: boolean; syncId: number; before?: number };
type History = InfiniteData<HistoryPage, number | undefined> & { live?: ChatFrame[] };
let syncId = 0;
const historyMessages = (data: Pick<History, "pages"> | undefined) =>
  mergeChat(
    [],
    [...(data?.pages ?? [])].reverse().flatMap((page) => page.messages),
    new Set(),
  );

// Query's pagination result contains the pages captured before its request.
// Reconcile against the cache at commit time so live updates/redactions win.
function reconcileHistory(previous: History | undefined, incoming: History): History {
  const redacted = new Set(
    [...historyMessages(previous), ...historyMessages(incoming)]
      .filter((message) => message.role === null)
      .map((message) => message.id),
  );
  const sameSync =
    incoming.live === undefined && previous?.pages[0]?.syncId === incoming.pages[0]?.syncId;
  const pages = incoming.pages.map((page, index) => ({
    ...page,
    messages: mergeChat(
      page.messages,
      sameSync ? (previous?.pages[index]?.messages ?? []) : [],
      redacted,
    ),
  }));
  const buffered = incoming.live === undefined ? (previous?.live ?? []) : [];
  if (pages[0])
    pages[0] = { ...pages[0], messages: mergeChat(pages[0].messages, buffered, redacted) };
  return {
    ...incoming,
    pages: pages.map((page) => ({ ...page, messages: mergeChat(page.messages, [], redacted) })),
    live: incoming.live ?? [],
  };
}

export function useRoomChat({
  roomId,
  viewerId,
  enabled,
}: {
  roomId: string;
  viewerId?: string;
  enabled: boolean;
}): RoomChatResult {
  const access = useQueryAccess();
  const client = useQueryClient();
  const queryKey = useMemo(() => queryKeys.chat(access.scope, roomId), [access.scope, roomId]);
  const key = JSON.stringify(queryKey);
  const identity = useRef(key);
  const active = useRef(enabled);
  active.current = enabled;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const retrySend = useRef<ChatInput | null>(null);
  const sendEpoch = useRef(0);
  const sentVisit = useRef<string | undefined>(undefined);
  if (identity.current !== key) {
    ++sendEpoch.current;
    retrySend.current = null;
    sentVisit.current = undefined;
    identity.current = key;
  }
  const epoch = sendEpoch.current;
  const canRead = () =>
    !!viewerId && active.current && identity.current === key && access.isCurrent();
  const query = useInfiniteQuery({
    queryKey,
    enabled: enabled && access.authenticated,
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam, signal }): Promise<HistoryPage> => {
      access.assertCurrent();
      if (!canRead()) throw new Error("Open the room while signed in to read chat.");
      if (pageParam !== undefined) {
        const page = await api.chatHistory(roomId, { before: pageParam }, signal);
        const messages = mergeChat([], page.messages, new Set());
        return {
          ...page,
          messages,
          before: messages[0]?.order,
          syncId: client.getQueryData<History>(queryKey)?.pages[0]?.syncId ?? 0,
        };
      }
      const highest = historyMessages(client.getQueryData<History>(queryKey)).at(-1)?.order;
      client.setQueryData<History>(queryKey, (data) => (data ? { ...data, live: [] } : data));
      const latest = await api.chatHistory(roomId, undefined, signal);
      let fresh = latest.messages;
      if (highest !== undefined) {
        let after = highest;
        let more = true;
        while (more) {
          const page = await api.chatHistory(roomId, { after }, signal);
          if (signal.aborted || !canRead()) throw new Error("Chat synchronization was cancelled.");
          fresh = [...fresh, ...page.messages];
          const next = Math.max(after, ...page.messages.map((message) => message.order));
          more = page.hasMore && next > after;
          after = next;
        }
      }
      if (signal.aborted || !canRead()) throw new Error("Chat synchronization was cancelled.");
      const messages = mergeChat([], fresh, new Set());
      return {
        messages,
        before: messages[0]?.order,
        hasMore: latest.hasMore || (messages[0]?.order ?? 1) > 1,
        syncId: ++syncId,
      };
    },
    getNextPageParam: (page) => (page.hasMore ? page.before : undefined),
    structuralSharing: (previous, incoming) =>
      reconcileHistory(previous as History | undefined, incoming as History),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const publish = useCallback(
    (frame: ChatFrame) => {
      if (identity.current !== key) return;
      const fetching = client.getQueryState(queryKey)?.fetchStatus === "fetching";
      client.setQueryData<History>(queryKey, (previous) => {
        const data = previous ?? {
          pages: [{ messages: [], hasMore: false, syncId: 0 }],
          pageParams: [undefined],
        };
        const redacted = new Set<string>();
        // Apply redaction tombstones across every page, not only the latest page.
        if (frame.type === "redaction") redacted.add(frame.id);
        return {
          ...data,
          pages: data.pages.map((page, index) => ({
            ...page,
            messages: mergeChat(page.messages, index === 0 ? [frame] : [], redacted),
          })),
          live: fetching ? [...(data.live ?? []), frame] : [],
        };
      });
    },
    [client, queryKey, key],
  );
  const refresh = useCallback(async () => {
    if (!viewerId || !active.current || identity.current !== key || !access.isCurrent()) return;
    if (client.getQueryState(queryKey)?.fetchMeta?.fetchMore)
      await client.cancelQueries({ queryKey });
    // Reconnect rebuilds history, rather than preserving possibly deleted authors.
    client.setQueryData<History>(queryKey, (data) =>
      data
        ? { ...data, pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) }
        : data,
    );
    await query.refetch({ cancelRefetch: false });
  }, [viewerId, key, access.isCurrent, client, queryKey, query.refetch]);
  const previouslyEnabled = useRef(enabled);
  useEffect(() => {
    if (!enabled) void client.cancelQueries({ queryKey });
    else if (!previouslyEnabled.current) void refresh();
    previouslyEnabled.current = enabled;
  }, [enabled, client, queryKey, refresh]);
  const connection = useRoomSocket({
    path: `/api/room/chat/ws/${encodeURIComponent(roomId)}`,
    viewerId,
    enabled,
    onOpen: () => void refresh(),
    onMessage: (data) => {
      if (!active.current || !access.isCurrent()) return;
      const frame = parseSocketJSON(data);
      if (isChatFrame(frame)) publish(frame);
    },
  });
  const loadOlder = useCallback(async () => {
    if (
      !viewerId ||
      !active.current ||
      identity.current !== key ||
      !access.isCurrent() ||
      !query.hasNextPage ||
      client.getQueryState(queryKey)?.fetchStatus !== "idle"
    )
      return;
    await query.fetchNextPage({ cancelRefetch: false });
  }, [viewerId, key, access.isCurrent, query.hasNextPage, client, queryKey, query.fetchNextPage]);
  const mutationKey = useMemo(() => [...queryKey, "send"] as const, [queryKey]);
  const mutation = useMutation({
    mutationKey,
    mutationFn: async (message: ChatInput) => {
      access.assertCurrent();
      if (!active.current || identity.current !== key)
        throw new Error("Open the room while signed in to send chat");
      const accepted = await api.sendChat(roomId, message);
      if (!isChatFrame(accepted) || accepted.type !== "message")
        throw new Error("Could not confirm the message. Keep your draft and retry.");
      return accepted;
    },
  });
  const sending = useIsMutating({ mutationKey, exact: true }) > 0;
  const send = useCallback(
    async (input: string | ChatInput) => {
      if (
        !mounted.current ||
        !viewerId ||
        !active.current ||
        identity.current !== key ||
        sendEpoch.current !== epoch ||
        !access.isCurrent()
      )
        throw new Error("Open the room while signed in to send chat");
      if (client.isMutating({ mutationKey, exact: true }))
        throw new Error("A message is already being sent");
      const message =
        typeof input === "string"
          ? retrySend.current?.text === input
            ? retrySend.current
            : { text: input, clientSendId: randomUUID() }
          : input;
      retrySend.current = message;
      sentVisit.current = key;
      const accepted = await mutation.mutateAsync(message);
      if (
        mounted.current &&
        identity.current === key &&
        sendEpoch.current === epoch &&
        access.isCurrent()
      ) {
        retrySend.current = null;
        publish(accepted);
      }
      return accepted;
    },
    [viewerId, key, epoch, access.isCurrent, client, mutationKey, mutation.mutateAsync, publish],
  );
  return {
    messages: viewerId ? historyMessages(query.data) : [],
    connection,
    loading: enabled && query.isFetching && !query.isFetchingNextPage,
    loadingOlder: enabled && query.isFetchingNextPage,
    sending,
    hasOlder: !!viewerId && query.hasNextPage,
    error: sentVisit.current === key ? (mutation.error ?? query.error) : query.error,
    refresh,
    loadOlder,
    send,
  };
}
