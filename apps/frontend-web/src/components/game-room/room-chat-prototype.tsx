// THROWAWAY PROTOTYPE: local-only chat surface for the real online room, enabled with ?chat-prototype.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import "./room-chat-prototype.css";

type Message = { author: string; text: string };

export function RoomChatPrototype({ spectator }: { spectator: boolean }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(2);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { author: "Mina", text: "Anyone up for another round?" },
    { author: "Lee", text: "I'm in!" },
  ]);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);

  useEffect(() => {
    openRef.current = open;
    if (open) {
      setUnread(0);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (open && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [open, messages]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMessages((previous) => [...previous, { author: "You", text }]);
    setDraft("");
    inputRef.current?.focus();
    window.setTimeout(() => {
      setMessages((previous) => [...previous, { author: "Mina", text: "Sounds good!" }]);
      if (!openRef.current) setUnread((previous) => previous + 1);
    }, 1800);
  };

  return (
    <div className="room-chat-prototype">
      <button
        ref={triggerRef}
        className="room-icon room-chat-trigger"
        type="button"
        aria-controls="room-chat-preview"
        aria-expanded={open}
        aria-label={`Room chat${unread ? `, ${unread} unread` : ""}`}
        onClick={() => setOpen((value) => !value)}
      >
        <MessageCircle aria-hidden="true" />
        {unread > 0 && (
          <span className="room-chat-unread" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <section
          id="room-chat-preview"
          className="room-chat-panel"
          aria-label="Room chat preview"
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
        >
          <div className="room-chat-heading">
            <div>
              <h2>Room chat</h2>
              <small>Preview only · not shared with others</small>
            </div>
            <button type="button" aria-label="Close room chat" onClick={close}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div
            ref={messagesRef}
            className="room-chat-messages"
            role="log"
            aria-label="Room messages"
            aria-live="polite"
          >
            {messages.map((message, index) => (
              <p key={index}>
                <strong>{message.author}</strong> {message.text}
              </p>
            ))}
          </div>
          {spectator ? (
            <p className="room-chat-readonly">Watching · only seated Players can send</p>
          ) : (
            <form className="room-chat-compose" onSubmit={send}>
              <input
                ref={inputRef}
                aria-label="Room chat message"
                maxLength={280}
                placeholder="Message the table…"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button type="submit" aria-label="Send message" disabled={!draft.trim()}>
                <Send size={17} aria-hidden="true" />
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
