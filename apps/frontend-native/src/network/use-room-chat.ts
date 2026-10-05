import { useCallback, useEffect, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import { api } from "./api";
import { isChatFrame, mergeChat } from "./chat";
import { parseSocketJSON } from "./socket";
import type { ChatFrame, ChatInput, ChatMessage, ConnectionStatus } from "./types";
import { useRoomSocket } from "./use-room-socket";
import { asError } from "./request";

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
  // String sends reuse the UUID for a failed retry of the same text. Callers can
  // also supply a stable ChatInput for retrying a draft across screen mounts.
  send: (input: string | ChatInput) => Promise<ChatMessage>;
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
  const key = `${roomId}:${viewerId ?? ""}`;
  const [state, setState] = useState<{
    key: string;
    messages: ChatMessage[];
    loading: boolean;
    loadingOlder: boolean;
    sending: boolean;
    hasOlder: boolean;
    error: Error | null;
  }>({
    key,
    messages: [],
    loading: false,
    loadingOlder: false,
    sending: false,
    hasOlder: false,
    error: null,
  });
  const messages = useRef<ChatMessage[]>([]);
  const redacted = useRef(new Set<string>());
  const buffered = useRef<ChatFrame[]>([]);
  const syncing = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const olderPending = useRef(false);
  const sendPending = useRef(false);
  const retrySend = useRef<ChatInput | null>(null);
  const identity = useRef(key);
  identity.current = key;

  const publish = useCallback(
    (next: ChatMessage[]) => {
      messages.current = next;
      setState((previous) => ({ ...previous, key, messages: next }));
    },
    [key],
  );

  useEffect(() => {
    messages.current = [];
    redacted.current = new Set();
    buffered.current = [];
    retrySend.current = null;
    sendPending.current = false;
    setState({
      key,
      messages: [],
      loading: false,
      loadingOlder: false,
      sending: false,
      hasOlder: false,
      error: null,
    });
  }, [key]);

  const refresh = useCallback(async () => {
    if (!viewerId || !enabled) return;
    const current = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const previousHighest = messages.current.at(-1)?.order;
    buffered.current = [];
    syncing.current = true;
    olderPending.current = false;
    setState((previous) => ({ ...previous, key, loading: true, loadingOlder: false, error: null }));
    try {
      const latest = await api.chatHistory(roomId, undefined, abort.signal);
      let fresh = latest.messages;
      if (previousHighest !== undefined) {
        let after = previousHighest;
        let more = true;
        while (more) {
          const page = await api.chatHistory(roomId, { after }, abort.signal);
          if (abort.signal.aborted || current !== generation.current) return;
          fresh = [...fresh, ...page.messages];
          const next = Math.max(after, ...page.messages.map((message) => message.order));
          more = page.hasMore && next > after;
          after = next;
        }
      }
      if (abort.signal.aborted || current !== generation.current || identity.current !== key)
        return;
      // Replace old cached history: reconnect must not resurrect identities that
      // were deleted while offline. New live frames are merged after history.
      const next = mergeChat([], [...fresh, ...buffered.current], redacted.current);
      publish(next);
      setState((previous) => ({
        ...previous,
        loading: false,
        hasOlder: latest.hasMore || (next[0]?.order ?? 1) > 1,
      }));
    } catch (cause) {
      if (!abort.signal.aborted && current === generation.current && identity.current === key)
        setState((previous) => ({ ...previous, loading: false, error: asError(cause) }));
    } finally {
      if (current === generation.current) {
        syncing.current = false;
        buffered.current = [];
      }
    }
  }, [roomId, viewerId, enabled, key, publish]);

  useEffect(() => {
    if (enabled && viewerId) void refresh();
    else setState((previous) => ({ ...previous, loading: false, loadingOlder: false }));
    return () => {
      ++generation.current;
      controller.current?.abort();
      syncing.current = false;
      olderPending.current = false;
    };
  }, [enabled, viewerId, refresh]);

  const connection = useRoomSocket({
    path: `/api/room/chat/ws/${encodeURIComponent(roomId)}`,
    viewerId,
    enabled,
    onOpen: () => void refresh(),
    onMessage: (data) => {
      const frame = parseSocketJSON(data);
      if (!isChatFrame(frame)) return;
      if (syncing.current) buffered.current.push(frame);
      publish(mergeChat(messages.current, [frame], redacted.current));
    },
  });

  const loadOlder = useCallback(async () => {
    const before = messages.current[0]?.order;
    if (!viewerId || !enabled || !before || syncing.current || olderPending.current) return;
    const current = generation.current;
    olderPending.current = true;
    setState((previous) => ({ ...previous, loadingOlder: true, error: null }));
    try {
      const page = await api.chatHistory(roomId, { before }, controller.current?.signal);
      if (current !== generation.current || identity.current !== key) return;
      // Live/redacted frames already present must win a history response race.
      publish(mergeChat(page.messages, messages.current, redacted.current));
      setState((previous) => ({ ...previous, hasOlder: page.hasMore }));
    } catch (cause) {
      if (current === generation.current && identity.current === key)
        setState((previous) => ({ ...previous, error: asError(cause) }));
    } finally {
      if (current === generation.current && identity.current === key) {
        olderPending.current = false;
        setState((previous) => ({ ...previous, loadingOlder: false }));
      }
    }
  }, [roomId, viewerId, enabled, key, publish]);

  const send = useCallback(
    async (input: string | ChatInput) => {
      if (!viewerId || !enabled) throw new Error("Open the room while signed in to send chat");
      if (sendPending.current) throw new Error("A message is already being sent");
      const message =
        typeof input === "string"
          ? retrySend.current?.text === input
            ? retrySend.current
            : { text: input, clientSendId: randomUUID() }
          : input;
      retrySend.current = message;
      sendPending.current = true;
      setState((previous) => ({ ...previous, sending: true, error: null }));
      try {
        const accepted = await api.sendChat(roomId, message);
        if (!isChatFrame(accepted) || accepted.type !== "message")
          throw new Error("Could not confirm the message. Keep your draft and retry.");
        if (identity.current === key) {
          retrySend.current = null;
          if (syncing.current) buffered.current.push(accepted);
          publish(mergeChat(messages.current, [accepted], redacted.current));
        }
        return accepted;
      } catch (cause) {
        if (identity.current === key)
          setState((previous) => ({ ...previous, error: asError(cause) }));
        throw asError(cause);
      } finally {
        if (identity.current === key) {
          sendPending.current = false;
          setState((previous) => ({ ...previous, sending: false }));
        }
      }
    },
    [roomId, viewerId, enabled, key, publish],
  );

  return {
    messages: state.key === key && viewerId ? state.messages : [],
    connection,
    loading: state.key === key && state.loading,
    loadingOlder: state.key === key && state.loadingOlder,
    sending: state.key === key && state.sending,
    hasOlder: state.key === key && state.hasOlder,
    error: state.key === key ? state.error : null,
    refresh,
    loadOlder,
    send,
  };
}
