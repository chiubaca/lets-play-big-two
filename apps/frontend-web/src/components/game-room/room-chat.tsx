import { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageCircle, X } from "lucide-react";
import "./room-chat.css";

export type ChatMessage = {
  type: "message";
  id: string;
  order: number;
  clientSendId: string;
  author: string;
  text: string;
};

export function RoomChat({
  roomId,
  seated,
  blocked,
  send,
  playSound,
}: {
  roomId: string;
  seated: boolean;
  blocked: boolean;
  send: (input: { text: string; clientSendId: string }) => Promise<ChatMessage>;
  playSound: (sound: "chat-send" | "chat-receive") => void;
}) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [connected, setConnected] = useState(false);
  const seen = useRef(new Set<string>());
  const ownSends = useRef(new Set<string>());
  const trigger = useRef<HTMLButtonElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const visible = useRef(false);
  visible.current = open && !blocked;

  const addMessage = (message: ChatMessage, incoming: boolean) => {
    if (seen.current.has(message.id)) return;
    seen.current.add(message.id);
    if (incoming && !visible.current) setUnread((count) => count + 1);
    if (incoming && !ownSends.current.has(message.clientSendId)) playSound("chat-receive");
    setMessages((previous) => [...previous, message].sort((a, b) => a.order - b.order));
  };

  useEffect(() => {
    if (open && !blocked) setUnread(0);
  }, [open, blocked]);

  useEffect(() => {
    if (open && !blocked) (seated ? composer.current : log.current)?.focus();
  }, [open, seated]);

  useEffect(() => {
    const host = import.meta.env.VITE_BACKEND_URL.replace(/^https?/, "wss");
    let socket: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    let disposed = false;
    const connect = () => {
      socket = new WebSocket(`${host}/api/room/chat/ws/${encodeURIComponent(roomId)}`);
      socket.onopen = () => {
        if (!disposed) setConnected(true);
      };
      socket.onmessage = (event) => {
        if (disposed) return;
        try {
          const message = JSON.parse(event.data) as ChatMessage;
          if (
            message.type === "message" &&
            typeof message.id === "string" &&
            typeof message.order === "number"
          ) {
            addMessage(message, true);
          }
        } catch {
          /* Ignore unknown frames. */
        }
      };
      socket.onclose = () => {
        if (!disposed) {
          setConnected(false);
          retry = setTimeout(connect, 2000);
        }
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      socket.close();
    };
  }, [roomId]);

  useEffect(() => {
    if (visible.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, open, blocked]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!seated || !draft.trim() || sending) return;
    const attempted = draft;
    const clientSendId = crypto.randomUUID();
    ownSends.current.add(clientSendId);
    setSending(true);
    setError("");
    try {
      const accepted = await send({ text: attempted, clientSendId });
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
            <div>
              <h2>Room chat</h2>
              <small>Live only · messages aren't saved</small>
            </div>
            <button type="button" aria-label="Close room chat" onClick={close}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {!connected && (
            <p className="room-chat-status" role="status">
              Chat reconnecting…
            </p>
          )}
          <div
            ref={log}
            className="room-chat-messages"
            role="log"
            aria-label="Room messages"
            aria-live={blocked ? "off" : "polite"}
            aria-hidden={blocked}
            tabIndex={0}
          >
            {messages.length === 0 && (
              <p className="room-chat-empty">No live messages yet. Say hello!</p>
            )}
            {messages.map((message) => (
              <p className="room-chat-entry" key={message.id}>
                <strong>{message.author}</strong> <span>{message.text}</span>
              </p>
            ))}
          </div>
          {seated ? (
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
          ) : (
            <p className="room-chat-readonly">Watching · only seated Players can send</p>
          )}
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
