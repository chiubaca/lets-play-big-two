import { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageCircle, X } from "lucide-react";
import "./room-chat.css";

export type ChatMessage = {
  type: "message";
  id: string;
  order: number;
  clientSendId: string;
  author: string;
  role: "Player" | "Spectator" | null;
  text: string;
};

type ChatPage = { messages: ChatMessage[]; hasMore: boolean };

export function RoomChat({
  roomId,
  blocked,
  send,
  playSound,
}: {
  roomId: string;
  blocked: boolean;
  send: (input: { text: string; clientSendId: string }) => Promise<ChatMessage>;
  playSound: (sound: "chat-send" | "chat-receive") => void;
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [reconciling, setReconciling] = useState(false);
  const seen = useRef(new Set<string>());
  const messagesRef = useRef<ChatMessage[]>([]);
  const synced = useRef(false);
  const redacted = useRef(new Set<string>());
  const restoringScroll = useRef<number | null>(null);
  const liveDuringSync = useRef(new Map<string, ChatMessage>());
  const retryHistory = useRef<() => void>(() => {});
  const retrySend = useRef<{ text: string; clientSendId: string } | null>(null);
  const ownSends = useRef(new Set<string>());
  const trigger = useRef<HTMLButtonElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const visible = useRef(false);
  visible.current = open && !blocked;

  const maskDeleted = (message: ChatMessage): ChatMessage =>
    redacted.current.has(message.id)
      ? { ...message, author: "Deleted participant", role: null, text: "Message removed" }
      : message;

  const addMessage = (message: ChatMessage, incoming: boolean) => {
    if (seen.current.has(message.id)) return;
    message = maskDeleted(message);
    if (!synced.current) liveDuringSync.current.set(message.id, message);
    seen.current.add(message.id);
    if (incoming && !visible.current) setUnread((count) => count + 1);
    if (incoming && visible.current && !ownSends.current.has(message.clientSendId))
      setLiveAnnouncement(`${message.author}: ${message.text}`);
    if (incoming && !ownSends.current.has(message.clientSendId)) playSound("chat-receive");
    setMessages((previous) => {
      const next = [
        ...new Map([...previous, message].map((entry) => [entry.id, entry])).values(),
      ].sort((a, b) => a.order - b.order);
      messagesRef.current = next;
      return next;
    });
  };

  const mergeHistory = (page: ChatPage) => {
    setMessages((previous) => {
      // Server history wins over an old local copy, including messages redacted while offline.
      const merged = new Map(previous.map((message) => [message.id, message]));
      for (const message of page.messages) {
        merged.set(message.id, maskDeleted(message));
      }
      const next = [...merged.values()].sort((a, b) => a.order - b.order);
      messagesRef.current = next;
      seen.current = new Set(next.map((message) => message.id));
      return next;
    });
  };

  const fetchHistory = async (cursor?: { before?: number; after?: number }): Promise<ChatPage> => {
    const url = new URL(
      `${import.meta.env.VITE_BACKEND_URL}/api/room/chat/${encodeURIComponent(roomId)}`,
    );
    if (cursor?.before) url.searchParams.set("before", String(cursor.before));
    if (cursor?.after) url.searchParams.set("after", String(cursor.after));
    const response = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error("Could not load room chat. Try again.");
    return (await response.json()) as ChatPage;
  };

  const loadOlder = async () => {
    const oldest = messagesRef.current[0]?.order;
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    setHistoryError("");
    restoringScroll.current = log.current ? log.current.scrollHeight - log.current.scrollTop : null;
    try {
      const page = await fetchHistory({ before: oldest });
      mergeHistory(page);
      setHasOlder(page.hasMore);
    } catch (cause) {
      restoringScroll.current = null;
      setHistoryError(cause instanceof Error ? cause.message : "Could not load older messages.");
    } finally {
      setLoadingOlder(false);
    }
  };

  useEffect(() => {
    if (open && !blocked) setUnread(0);
  }, [open, blocked]);

  useEffect(() => {
    if (open && !blocked) composer.current?.focus();
  }, [open]);

  useEffect(() => {
    const element = panel.current;
    if (!open || !element) return;

    const updateViewport = () => {
      const viewport = window.visualViewport;
      element.style.setProperty("--room-chat-viewport-top", `${viewport?.offsetTop ?? 0}px`);
      element.style.setProperty(
        "--room-chat-viewport-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("scroll", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("scroll", updateViewport);
    };
  }, [open]);

  useEffect(() => {
    const host = import.meta.env.VITE_BACKEND_URL.replace(/^https?/, "wss");
    let socket: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    let disposed = false;
    let generation = 0;
    const synchronize = async (current: number) => {
      setReconciling(true);
      synced.current = false;
      const previousHighest = messagesRef.current.at(-1)?.order;
      try {
        const page = await fetchHistory();
        if (disposed || current !== generation) return;
        const fresh = new Map(page.messages.map((message) => [message.id, message]));
        if (previousHighest) {
          let after = previousHighest;
          let more = true;
          while (more) {
            const missed = await fetchHistory({ after });
            if (disposed || current !== generation) return;
            for (const message of missed.messages) fresh.set(message.id, message);
            after = missed.messages.at(-1)?.order ?? after;
            more = missed.hasMore && missed.messages.length > 0;
          }
        }
        for (const message of liveDuringSync.current.values()) fresh.set(message.id, message);
        const next = [...fresh.values()].map(maskDeleted).sort((a, b) => a.order - b.order);
        messagesRef.current = next;
        seen.current = new Set(next.map((message) => message.id));
        setMessages(next);
        setHasOlder(
          next.length > 0 && (page.hasMore || (previousHighest !== undefined && next[0].order > 1)),
        );
        liveDuringSync.current.clear();
        synced.current = true;
        setReconciling(false);
        setHistoryError("");
      } catch {
        if (!disposed && current === generation)
          setHistoryError("Could not load room chat. Try again.");
      }
    };
    const connect = () => {
      const current = ++generation;
      synced.current = false;
      socket = new WebSocket(`${host}/api/room/chat/ws/${encodeURIComponent(roomId)}`);
      socket.onopen = () => {
        if (!disposed) {
          setConnected(true);
          setLiveAnnouncement("");
          retryHistory.current = () => void synchronize(current);
          void synchronize(current);
        }
      };
      socket.onmessage = (event) => {
        if (disposed) return;
        try {
          const message = JSON.parse(event.data) as
            | ChatMessage
            | (Omit<ChatMessage, "type"> & { type: "redaction" });
          if (message.type === "redaction" && typeof message.id === "string") {
            redacted.current.add(message.id);
            setLiveAnnouncement("");
            setMessages((previous) => {
              const next = previous.map((entry) =>
                entry.id === message.id ? { ...message, type: "message" as const } : entry,
              );
              messagesRef.current = next;
              return next;
            });
            return;
          }
          if (
            message.type === "message" &&
            typeof message.id === "string" &&
            typeof message.order === "number"
          ) {
            addMessage(message, synced.current);
          }
        } catch {
          /* Ignore unknown frames. */
        }
      };
      socket.onclose = () => {
        if (!disposed) {
          setConnected(false);
          synced.current = false;
          ++generation;
          setReconciling(false);
          retry = setTimeout(connect, 2000);
        }
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [roomId]);

  useEffect(() => {
    if (!log.current) return;
    if (restoringScroll.current !== null) {
      log.current.scrollTop = log.current.scrollHeight - restoringScroll.current;
      restoringScroll.current = null;
    } else if (visible.current && !loadingOlder) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, open, blocked, loadingOlder]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    const attempted = draft;
    const clientSendId =
      retrySend.current?.text === attempted ? retrySend.current.clientSendId : crypto.randomUUID();
    retrySend.current = { text: attempted, clientSendId };
    ownSends.current.add(clientSendId);
    setSending(true);
    setError("");
    try {
      const accepted = await send({ text: attempted, clientSendId });
      retrySend.current = null;
      addMessage(accepted, false);
      playSound("chat-send");
      setDraft((current) => (current === attempted ? "" : current));
      composer.current?.focus();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not confirm the message. Keep your draft and try again.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="room-chat">
      <button
        ref={trigger}
        className="room-icon room-chat-trigger"
        type="button"
        aria-controls="room-chat-panel"
        aria-expanded={open}
        aria-label={`Room chat${unread ? `, ${unread} unread` : ""}`}
        onClick={() => {
          if (open) close();
          else {
            setOpen(true);
            setUnread(0);
          }
        }}
      >
        <MessageCircle aria-hidden="true" />
        {unread > 0 && (
          <span className="room-chat-unread" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {!open && (
        <span className="sr-only" role="status" aria-live="polite">
          {unread ? `${unread} unread room messages` : ""}
        </span>
      )}
      {open && (
        <section
          ref={panel}
          id="room-chat-panel"
          className="room-chat-panel"
          aria-label="Room chat"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className="room-chat-heading">
            <h2>Room chat</h2>
            <button type="button" aria-label="Close room chat" onClick={close}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {!connected && (
            <p className="room-chat-status" role="status">
              Chat reconnecting…
            </p>
          )}
          {historyError && (
            <p className="room-chat-status" role="alert">
              {historyError}
              {reconciling && (
                <button type="button" onClick={() => retryHistory.current()}>
                  Retry history
                </button>
              )}
            </p>
          )}
          {hasOlder && !reconciling && (
            <button
              className="room-chat-older"
              type="button"
              disabled={loadingOlder}
              onClick={() => void loadOlder()}
            >
              {loadingOlder ? "Loading older messages…" : "Load older messages"}
            </button>
          )}
          <span className="sr-only" role="status" aria-live="polite">
            {liveAnnouncement}
          </span>
          <div
            ref={log}
            className="room-chat-messages"
            role="log"
            aria-label="Room messages"
            aria-live="off"
            aria-hidden={blocked}
            tabIndex={0}
          >
            {reconciling ? (
              <p className="room-chat-empty">Updating conversation…</p>
            ) : (
              messages.length === 0 && (
                <p className="room-chat-empty">No messages yet. Say hello!</p>
              )
            )}
            {!reconciling &&
              messages.map((message) => (
                <p className="room-chat-entry" key={message.id}>
                  <strong>
                    {message.author}
                    {message.role && ` · ${message.role}`}
                  </strong>{" "}
                  <span>{message.text}</span>
                </p>
              ))}
          </div>
          <form className="room-chat-compose" onSubmit={(event) => void submit(event)}>
            <label className="sr-only" htmlFor="room-chat-draft">
              Room chat message
            </label>
            <textarea
              id="room-chat-draft"
              ref={composer}
              aria-label="Room chat message"
              rows={2}
              placeholder="Message the table…"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (retrySend.current?.text !== event.target.value) retrySend.current = null;
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing)
                  return;
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }}
            />
            <button type="submit" disabled={!draft.trim() || sending} aria-label="Send message">
              Send
            </button>
          </form>
          {error && (
            <p className="room-chat-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
