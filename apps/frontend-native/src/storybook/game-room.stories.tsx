import { useEffect, useState, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-native";
import { action } from "storybook/actions";
import { TableScreen } from "../screens/table";
import { ChatScreen } from "../screens/chat";
import { Label } from "../ui/primitives";
import type { ChatMessage } from "../network/types";
import {
  createRoomFixture,
  roomScenarios,
  type RoomScenario,
  type RoomViewer,
} from "./room-fixtures";

type Props = {
  scenario: RoomScenario;
  viewer: RoomViewer;
  status: "ready" | "loading" | "signed-out" | "failed";
  mode: "online" | "solo" | "pass-and-play";
  connected: boolean;
  acting: boolean;
  hidden: boolean;
  error: string;
  spectatorCount: number;
  chatUnread: number;
  showChat: boolean;
  chatState: "live" | "empty" | "loading" | "reconnecting" | "failed";
  send: ComponentProps<typeof TableScreen>["send"];
  onHome: () => void;
  onRetry: () => void;
  onSignIn: () => void;
  onReveal: () => void;
  onChatSend: (text: string) => void;
};

function GameRoomPreview({ scenario, viewer, status, showChat, chatState, ...args }: Props) {
  const [chatOpen, setChatOpen] = useState(showChat);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    setChatOpen(showChat);
    setMessages([]);
    setRevealed(false);
  }, [scenario, viewer, showChat, chatState, args.hidden]);

  const exampleMessages: ChatMessage[] =
    chatState === "empty" || chatState === "loading"
      ? []
      : [
          {
            type: "message",
            id: "chat-1",
            order: 1,
            clientSendId: "demo-1",
            author: "Mei",
            isOwn: viewer === "guest",
            role: "Player",
            text: "One more game? 🐼",
          },
          {
            type: "message",
            id: "chat-2",
            order: 2,
            clientSendId: "demo-2",
            author: "River",
            isOwn: viewer === "spectator",
            role: "Spectator",
            text: "That last straight was incredible. I'm watching this round!",
          },
          {
            type: "message",
            id: "chat-3",
            order: 3,
            clientSendId: "demo-3",
            author: "",
            isOwn: false,
            role: null,
            text: "",
          },
          {
            type: "message",
            id: "chat-4",
            order: 4,
            clientSendId: "demo-4",
            author: "Alex",
            isOwn: viewer === "host",
            role: "Player",
            text: "I'm in! Let’s deal 🦊",
          },
        ];
  const snapshot =
    status === "ready" ? createRoomFixture(scenario, viewer, args.spectatorCount) : undefined;
  return (
    <>
      <TableScreen
        key={`${scenario}:${viewer}:${status}:${args.mode}`}
        snapshot={snapshot}
        userId={viewer}
        userName={viewer === "guest" ? "Mei" : viewer === "spectator" ? "River" : "Alex"}
        userEmoji={viewer === "guest" ? "🐼" : "🦊"}
        mode={args.mode}
        roomId={args.mode === "online" ? "CREW2" : undefined}
        connected={args.connected}
        acting={args.acting}
        hidden={args.hidden && !revealed}
        error={
          status === "failed" ? "Could not connect to the room. Try again." : args.error || null
        }
        send={args.send}
        onHome={args.onHome}
        onRetry={args.onRetry}
        onSignIn={status === "signed-out" ? args.onSignIn : undefined}
        onReveal={() => {
          args.onReveal();
          setRevealed(true);
        }}
        onChat={() => setChatOpen(true)}
        chatUnread={args.chatUnread}
        notificationSettings={<Label>Storybook preview · notifications are not registered.</Label>}
      />
      <ChatScreen
        visible={chatOpen}
        roomId="CREW2"
        onClose={() => setChatOpen(false)}
        chat={{
          messages: [...exampleMessages, ...messages],
          connection: chatState === "reconnecting" ? "reconnecting" : "connected",
          loading: chatState === "loading",
          loadingOlder: false,
          sending: false,
          hasOlder: false,
          error:
            chatState === "failed" ? new Error("Chat history is unavailable. Try again.") : null,
          refresh: async () => args.onRetry(),
          loadOlder: async () => undefined,
          send: async (input) => {
            const text = typeof input === "string" ? input : input.text;
            args.onChatSend(text);
            const order = exampleMessages.length + messages.length + 1;
            const message: ChatMessage = {
              type: "message",
              id: `draft-${order}`,
              clientSendId: `draft-${order}`,
              order,
              author: "You",
              isOwn: true,
              role: viewer === "spectator" ? "Spectator" : "Player",
              text,
            };
            setMessages((previous) => [...previous, message]);
            return message;
          },
        }}
      />
    </>
  );
}

const meta = {
  title: "Game room/Table",
  component: GameRoomPreview,
  args: {
    scenario: "single",
    viewer: "host",
    status: "ready",
    mode: "online",
    connected: true,
    acting: false,
    hidden: false,
    error: "",
    spectatorCount: 2,
    chatUnread: 3,
    showChat: false,
    chatState: "live",
    send: action("game event"),
    onHome: action("return to lobby"),
    onRetry: action("retry"),
    onSignIn: action("sign in"),
    onReveal: action("reveal hand"),
    onChatSend: action("send chat message"),
  },
  argTypes: {
    scenario: { control: "select", options: roomScenarios },
    viewer: { control: "select", options: ["host", "guest", "spectator"] },
    status: { control: "select", options: ["ready", "loading", "signed-out", "failed"] },
    mode: { control: "select", options: ["online", "solo", "pass-and-play"] },
    chatState: {
      control: "select",
      options: ["live", "empty", "loading", "reconnecting", "failed"],
    },
    connected: { control: "boolean" },
    acting: { control: "boolean" },
    hidden: { control: "boolean" },
    showChat: { control: "boolean" },
    error: { control: "text" },
    spectatorCount: { control: { type: "number", min: 0 } },
    chatUnread: { control: { type: "number", min: 0 } },
    send: { control: false },
    onHome: { control: false },
    onRetry: { control: false },
    onSignIn: { control: false },
    onReveal: { control: false },
    onChatSend: { control: false },
  },
} satisfies Meta<typeof GameRoomPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = { args: { status: "loading" } };
export const SignInRequired: Story = { args: { status: "signed-out" } };
export const ConnectionFailure: Story = { args: { status: "failed" } };
export const HostAlone: Story = { args: { scenario: "waiting-alone" } };
export const HostWaiting: Story = { args: { scenario: "waiting-open" } };
export const FullTableReadyToDeal: Story = { args: { scenario: "waiting-full" } };
export const WaitingForHost: Story = { args: { scenario: "waiting-open", viewer: "guest" } };
export const SpectatorCanJoin: Story = { args: { scenario: "waiting-open", viewer: "spectator" } };
export const SpectatorFullTable: Story = {
  args: { scenario: "waiting-full", viewer: "spectator" },
};
export const FirstMove: Story = { args: { scenario: "first-move" } };
export const YourTurn: Story = {};
export const BeatingAPair: Story = { args: { scenario: "pairs" } };
export const BeatingACombination: Story = { args: { scenario: "combo" } };
export const LeadingANewRound: Story = { args: { scenario: "new-round" } };
export const OpponentTurn: Story = { args: { viewer: "guest" } };
export const BotThinking: Story = { args: { scenario: "bot-turn" } };
export const DownToTheLastCards: Story = { args: { scenario: "low-cards" } };
export const CanOnlyPass: Story = { args: { scenario: "no-legal-play" } };
export const SpectatingAGame: Story = { args: { viewer: "spectator" } };
export const Reconnecting: Story = { args: { connected: false } };
export const SendingAPlay: Story = { args: { acting: true } };
export const RejectedMove: Story = { args: { error: "Your cards must beat the current pile." } };
export const RoomResetNotice: Story = { args: { scenario: "room-notice" } };
export const YouWin: Story = { args: { scenario: "host-wins" } };
export const YouLose: Story = { args: { scenario: "guest-wins" } };
export const LongPlayerNames: Story = { args: { scenario: "long-names" } };
export const SoloHints: Story = { args: { mode: "solo", scenario: "first-move" } };
export const PrivateHandoff: Story = {
  args: { mode: "pass-and-play", scenario: "first-move", hidden: true },
};
export const RoomChat: Story = { args: { showChat: true } };
export const EmptyChat: Story = { args: { showChat: true, chatState: "empty" } };
export const ChatLoading: Story = { args: { showChat: true, chatState: "loading" } };
export const ChatReconnecting: Story = { args: { showChat: true, chatState: "reconnecting" } };
export const ChatFailure: Story = { args: { showChat: true, chatState: "failed" } };
