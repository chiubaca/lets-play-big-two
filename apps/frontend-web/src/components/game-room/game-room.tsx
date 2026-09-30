import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Check,
  Copy,
  Eye,
  HelpCircle,
  LoaderCircle,
  Menu,
  Settings,
  Volume2,
  VolumeX,
  WifiOff,
} from "lucide-react";
import type {
  BigTwoGameMachineSnapshot,
  Card,
  GameEvent,
  RoomGameState,
} from "@big-two/game-state-machine";
import { detectHandType } from "@big-two/game-core";
import { Confetti } from "../Confetti";
import { Card as PlayingCard, getCardAccessibleName } from "./card";
import { DEFAULT_DEV_LAYOUT } from "./game-room-dev-layout";
import { makePlayerOrder } from "./helpers/make-player-order";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import { createPlayEvent, isGameTurnState } from "./game-room-session";
import { useTableAudio } from "./use-table-audio";
import { RoomChat, type ChatMessage } from "./room-chat";
import {
  TurnNotificationSettings,
  type TurnNotificationPreference,
} from "./turn-notification-settings";
import { WinnerArtwork } from "./winner-artwork";
import { CasinoBackdrop, CasinoTableMark } from "~/components/casino/casino";
import "./game-room.css";

const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "local.bigtwo.com"]);
const LazyGameRoomDevTools = import.meta.env.DEV
  ? lazy(() =>
      import("./game-room-dev-tools").then(({ GameRoomDevTools }) => ({
        default: GameRoomDevTools,
      })),
    )
  : null;

export type GameRoomUser = { id: string; name: string; emoji?: string | null };
export type BotStrategy = "basic" | "jev";
export type BotSettings = {
  players: ReadonlyArray<GameRoomUser & { botStrategy?: BotStrategy }>;
  onStrategyChange?: (playerId: string, strategy: BotStrategy) => void;
};
type GameRoomProps = {
  botSettings?: BotSettings;
  gameState?: BigTwoGameMachineSnapshot | RoomGameState;
  jevFallbackPlayerIds?: ReadonlySet<string>;
  requestHint?: () => Card[] | null;
  send: (event: GameEvent) => Promise<void> | void;
  sendChat?: (input: { text: string; clientSendId: string }) => Promise<ChatMessage>;
  tableLabel: string;
  roomCode?: string;
  thinkingPlayerId?: string;
  user: GameRoomUser;
  sharedDevice?: boolean;
  hideHand?: boolean;
  turnNotifications?: TurnNotificationPreference;
};

function ReturnToLobby() {
  return (
    <div className="table-lobby-option">
      <a className="table-small-button" href="/">
        Return to lobby
      </a>
      <small>You will not leave this table.</small>
    </div>
  );
}

function PlayerSeat({
  name,
  count,
  avatar,
  active,
  thinking,
  jevFallback,
  position,
  showBacks = position !== "you",
  turnLabel = "Your turn",
}: {
  name: string;
  count: number;
  avatar: string;
  active: boolean;
  thinking?: boolean;
  jevFallback?: boolean;
  position: string;
  showBacks?: boolean;
  turnLabel?: string;
}) {
  return (
    <div
      className={`table-seat seat-${position} ${active ? "seat-active" : ""}`}
      role="group"
      aria-label={`${name}, ${count} cards remaining${active ? ", current turn" : ""}${jevFallback ? ", Jev unavailable; using Basic AI" : ""}`}
    >
      <div className="player-plaque">
        <span className="player-avatar" aria-hidden="true">
          {avatar}
        </span>
        <div className="player-details">
          <span className="player-name">
            <span>{name}</span>
            {jevFallback && (
              <span className="jev-fallback-mark" title="Jev unavailable — using Basic AI">
                <WifiOff aria-hidden="true" />
              </span>
            )}
          </span>
          <span className="player-count">
            <i aria-hidden="true">♦</i>
            {count}
          </span>
        </div>
        {active && (
          <span className="turn-indicator">
            {thinking || turnLabel === "Thinking…" ? (
              <>
                <LoaderCircle className="turn-thinking-icon" aria-hidden="true" />
                <span>Thinking…</span>
              </>
            ) : (
              turnLabel
            )}
          </span>
        )}
      </div>
      {showBacks && (
        <div className="opponent-hand" aria-hidden="true">
          {Array.from({ length: Math.min(count, 10) }, (_, i) => (
            <span className="table-card-back" key={i}>
              <span>♦</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export const GameRoom = ({
  botSettings,
  gameState,
  jevFallbackPlayerIds,
  requestHint,
  send,
  sendChat,
  tableLabel,
  roomCode,
  thinkingPlayerId,
  user,
  sharedDevice = false,
  hideHand = false,
  turnNotifications,
}: GameRoomProps) => {
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [message, setMessage] = useState<string>();
  const [sortBySuit, setSortBySuit] = useState(false);
  const [panel, setPanel] = useState<"menu" | "settings" | "help" | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leavePending, setLeavePending] = useState(false);
  const [leaveError, setLeaveError] = useState<string>();
  const [removeBot, setRemoveBot] = useState<{ id: string; name: string }>();
  const [botPending, setBotPending] = useState(false);
  const [botError, setBotError] = useState<string>();
  const [roomNotice, setRoomNotice] = useState<string>();
  const noticeTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [copied, setCopied] = useState(false);
  const [fanOut, setFanOut] = useState<number>(DEFAULT_DEV_LAYOUT.fanOut);
  const [cardArc, setCardArc] = useState<number>(DEFAULT_DEV_LAYOUT.arc);
  const [selectedLiftOverride, setSelectedLiftOverride] = useState<number>();
  const [showGuides, setShowGuides] = useState<boolean>(DEFAULT_DEV_LAYOUT.showGuides);
  const [showCardOrder, setShowCardOrder] = useState<boolean>(DEFAULT_DEV_LAYOUT.showCardOrder);
  const [motion, setMotion] = useState<boolean>(DEFAULT_DEV_LAYOUT.motion);
  const { playSound, muted, toggleMuted } = useTableAudio();
  const [localDevTools, setLocalDevTools] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [restartError, setRestartError] = useState<string>();
  const previousValue = useRef(gameState?.value);
  const resultsButton = useRef<HTMLButtonElement>(null);
  const currentId = gameState?.context.players[gameState.context.currentPlayerIndex]?.id;
  const currentValue = gameState?.value;
  const isMyTurn = !hideHand && currentId === user.id && isGameTurnState(currentValue);
  const pile = gameState?.context.cardPile;
  const lastPlayKey = JSON.stringify(pile?.at(-1) ?? []);
  const liveNotice = gameState && "roomNotice" in gameState ? gameState.roomNotice : undefined;

  useEffect(() => {
    if (!roomCode || !liveNotice) return;
    clearTimeout(noticeTimeout.current);
    setRoomNotice(liveNotice);
    noticeTimeout.current = setTimeout(() => setRoomNotice(undefined), 5000);
  }, [liveNotice, roomCode]);
  useEffect(() => () => clearTimeout(noticeTimeout.current), []);

  useEffect(() => {
    setSelectedCards([]);
    setMessage(undefined);
  }, [currentId, currentValue, hideHand, user.id]);
  useEffect(() => {
    if (isMyTurn) playSound("turn");
  }, [isMyTurn, playSound]);
  useEffect(() => {
    if (currentValue === "GAME_END") playSound("turn");
  }, [currentValue, playSound]);
  useEffect(() => {
    if (lastPlayKey !== "[]") playSound("play");
  }, [lastPlayKey, playSound]);
  useEffect(() => {
    if (gameState?.context.guardMessage) playSound("notice");
  }, [gameState?.context.guardMessage, playSound]);
  useEffect(() => {
    if (
      roomCode &&
      previousValue.current &&
      previousValue.current !== "GAME_END" &&
      currentValue === "GAME_END"
    ) {
      setShowResult(true);
    }
    if (currentValue !== "GAME_END") {
      setShowResult(false);
      setRestartError(undefined);
    }
    if (currentValue) previousValue.current = currentValue;
  }, [currentValue, roomCode]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setLocalDevTools(
      import.meta.env.DEV &&
        LOCAL_DEV_HOSTS.has(window.location.hostname) &&
        query.get("dev-tools") === "true",
    );
  }, []);

  if (!gameState) return <main className="game-room room-loading">Connecting to the table…</main>;
  const { players, guardMessage, winner } = gameState.context;
  const myIndex = players.findIndex((p) => p.id === user.id);
  const spectator = !sharedDevice && myIndex === -1;
  const [bottom, left, top, right] = makePlayerOrder(spectator ? 0 : myIndex);
  const me = players[myIndex];
  const handCounts = "handCounts" in gameState ? gameState.handCounts : undefined;
  const cardCount = (index: number) =>
    players[index] ? (handCounts?.[players[index].id] ?? players[index].hand.length) : 0;
  const spectatorCount = "spectatorCount" in gameState ? gameState.spectatorCount : undefined;
  const host = sharedDevice || players[0]?.id === user.id;
  const waiting = currentValue === "WAITING_FOR_PLAYERS";
  const finished = currentValue === "GAME_END";
  const handType = detectHandType(selectedCards);
  const lastHand = pile?.at(-1);
  const ranks = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
  const suits = ["DIAMOND", "CLUB", "HEART", "SPADE"];
  const hand = [...(hideHand ? [] : (me?.hand ?? []))].sort((a, b) =>
    sortBySuit
      ? suits.indexOf(a.suit) - suits.indexOf(b.suit) ||
        ranks.indexOf(a.value) - ranks.indexOf(b.value)
      : ranks.indexOf(a.value) - ranks.indexOf(b.value) ||
        suits.indexOf(a.suit) - suits.indexOf(b.suit),
  );
  const status = waiting
    ? `Waiting for players · ${players.length} of 4 seats filled`
    : finished
      ? `${winner ? winner.name : "An opponent"} wins · table complete`
      : spectator
        ? `${players[gameState.context.currentPlayerIndex]?.name ?? "Next player"} is playing…`
        : isMyTurn
          ? currentValue === "ROUND_FIRST_MOVE"
            ? "Your turn · start with 3 ♦"
            : "Your turn"
          : `${players[gameState.context.currentPlayerIndex]?.name ?? "Next player"} is thinking…`;
  const act = async (event: GameEvent) => {
    try {
      await send(event);
      setSelectedCards([]);
      setMessage(undefined);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "That move could not be sent. Please try again.",
      );
      playSound("notice");
    }
  };
  const restart = async () => {
    try {
      await send({ type: "RESET_GAME" });
      setRestartError(undefined);
    } catch (error) {
      setRestartError(
        error instanceof Error ? error.message : "Could not start a new game. Please try again.",
      );
      playSound("notice");
    }
  };
  const leave = async () => {
    if (!roomCode || !me || leavePending) return;
    setLeavePending(true);
    setLeaveError(undefined);
    try {
      await send({ type: "LEAVE_GAME", playerId: user.id });
      setConfirmLeave(false);
    } catch (error) {
      setLeaveError(
        error instanceof Error ? error.message : "Could not leave the table. Try again.",
      );
    } finally {
      setLeavePending(false);
    }
  };
  const manageBots = async (event: GameEvent) => {
    if (botPending) return;
    setBotPending(true);
    setBotError(undefined);
    try {
      await send(event);
      setRemoveBot(undefined);
    } catch (error) {
      setBotError(error instanceof Error ? error.message : "Could not update the bots. Try again.");
    } finally {
      setBotPending(false);
    }
  };
  const hint = () => {
    const cards = requestHint?.();
    setSelectedCards(cards ?? []);
    setMessage(
      cards?.length ? "A little nudge. Your move is selected." : "Consider passing this turn.",
    );
    playSound("select");
  };

  const resetDevLayout = () => {
    setFanOut(DEFAULT_DEV_LAYOUT.fanOut);
    setCardArc(DEFAULT_DEV_LAYOUT.arc);
    setSelectedLiftOverride(undefined);
    setShowGuides(DEFAULT_DEV_LAYOUT.showGuides);
    setShowCardOrder(DEFAULT_DEV_LAYOUT.showCardOrder);
    setMotion(DEFAULT_DEV_LAYOUT.motion);
  };

  const devClassName = [
    showGuides ? "dev-show-guides" : "",
    showCardOrder ? "dev-show-card-order" : "",
    motion ? "" : "dev-reduce-motion",
  ]
    .filter(Boolean)
    .join(" ");
  const selectedLift = selectedLiftOverride ?? DEFAULT_DEV_LAYOUT.selectedLift;
  const devStyle =
    selectedLiftOverride === undefined
      ? undefined
      : ({ "--dev-selected-lift": `${selectedLiftOverride}px` } as CSSProperties);

  return (
    <main className={`game-room ${devClassName}`} style={devStyle}>
      <CasinoBackdrop />
      <header className="room-header">
        <div className="room-header-left">
          <button
            className="room-icon"
            aria-label="Open table menu"
            onClick={() => setPanel("menu")}
          >
            <Menu />
          </button>
          {roomCode && sendChat && (
            <RoomChat
              key={roomCode}
              roomId={roomCode}
              blocked={panel !== null || (finished && showResult)}
              send={sendChat}
              playSound={playSound}
            />
          )}
          {spectatorCount !== undefined && (
            <span className="room-spectators" aria-label={`${spectatorCount} watching`}>
              <Eye aria-hidden="true" />
              <span className="room-spectators-count">{spectatorCount}</span>
              <span className="room-spectators-label" aria-hidden="true">
                watching
              </span>
            </span>
          )}
        </div>
        {roomCode && (
          <button
            className="room-code"
            aria-label={`Copy room code ${roomCode}`}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(roomCode);
                setCopied(true);
                playSound("select");
              } catch {
                setMessage(`Room: ${roomCode}`);
              }
            }}
          >
            <span>
              <small>Room</small>
              <strong>{tableLabel}</strong>
            </span>
            {copied ? <Check /> : <Copy />}
          </button>
        )}
        <div className="room-header-actions">
          <button
            className="room-icon help-icon"
            aria-label="How to play"
            onClick={() => setPanel("help")}
          >
            <HelpCircle />
          </button>
          <button
            className="room-icon"
            aria-label="Table settings"
            onClick={() => setPanel("settings")}
          >
            <Settings />
          </button>
        </div>
      </header>
      {roomNotice && (
        <p className="room-departure-notice" role="status">
          {roomNotice}
        </p>
      )}
      {roomCode && finished && (
        <section className="finished-room-strip" aria-label="Finished room">
          <div className="finished-room-summary">
            <span className="finished-room-eyebrow">Table complete</span>
            <strong>{winner ? winner.name : "An opponent"} wins!</strong>
            {spectator && <small>Waiting for the host to start another game…</small>}
          </div>
          <div className="finished-room-actions">
            <button
              ref={resultsButton}
              className="table-small-button"
              onClick={() => setShowResult(true)}
            >
              Results
            </button>
            {host && (
              <button
                className="table-small-button finished-room-restart"
                onClick={() => void restart()}
              >
                Play again
              </button>
            )}
            <a className="table-small-button" href="/">
              Return to lobby
            </a>
          </div>
          {restartError && (
            <p role="alert" className="finished-room-error">
              {restartError}
            </p>
          )}
        </section>
      )}
      <section className="table-shell" aria-label="Big Two game table">
        <div className="table-felt">
          <CasinoTableMark subtle={Boolean(lastHand?.length)} />
          {[
            { index: top, position: "top" },
            { index: left, position: "left" },
            { index: right, position: "right" },
          ].map(({ index, position }) => (
            <PlayerSeat
              key={position}
              name={players[index]?.name ?? "Open seat"}
              count={cardCount(index)}
              avatar={players[index]?.isBot ? "🤖" : (players[index]?.emoji ?? "♠️")}
              active={
                isGameTurnState(currentValue) && index === gameState.context.currentPlayerIndex
              }
              thinking={thinkingPlayerId === players[index]?.id}
              jevFallback={jevFallbackPlayerIds?.has(players[index]?.id)}
              position={position}
              turnLabel={
                spectator
                  ? "Playing…"
                  : !sharedDevice && index !== myIndex
                    ? "Thinking…"
                    : "Your turn"
              }
            />
          ))}
          <div
            className="table-play-area"
            role="region"
            aria-label={
              lastHand?.length
                ? `Cards to beat: ${lastHand.map(getCardAccessibleName).join(", ")}`
                : "No cards have been played"
            }
          >
            {lastHand?.length ? (
              <>
                <span className="pile-label">CARDS TO BEAT</span>
                <div className="table-pile">
                  {lastHand.map((card, i) => (
                    <PlayingCard
                      key={card.suit + card.value}
                      card={card}
                      className="table-card played-card"
                      style={
                        {
                          "--pile-angle": `${(i - (lastHand.length - 1) / 2) * 5}deg`,
                        } as CSSProperties
                      }
                    />
                  ))}
                </div>
              </>
            ) : null}
          </div>
          <div className="table-prompt" role="status" aria-live="polite">
            {waiting ? (
              <>
                <span>{status}</span>
                {roomCode && host && players.length < 4 && (
                  <button
                    className="table-small-button"
                    disabled={botPending}
                    onClick={() => void manageBots({ type: "FILL_WITH_BOTS" })}
                  >
                    {botPending ? "Adding bots…" : "Fill with bots"}
                  </button>
                )}
                {!me && players.length < 4 ? (
                  <button
                    className="table-small-button"
                    onClick={() =>
                      act({ type: "JOIN_GAME", playerId: user.id, playerName: user.name })
                    }
                  >
                    Join Table
                  </button>
                ) : !me ? (
                  <small>All seats are taken · watching the table</small>
                ) : host ? (
                  <button
                    className="table-small-button"
                    onClick={() => act({ type: "START_GAME" })}
                  >
                    Deal Cards
                  </button>
                ) : (
                  <small>Waiting for the host to deal</small>
                )}
                {message && <span role="alert">{message}</span>}
                {botError && <span role="alert">{botError}</span>}
              </>
            ) : (
              <>
                <small className={isMyTurn ? "your-turn-text" : ""}>{status}</small>
                <span>
                  {finished && roomCode
                    ? "Results are available above."
                    : spectator
                      ? "Watching live · cards in hand are private"
                      : (isMyTurn && guardMessage === "It is not your turn"
                          ? undefined
                          : guardMessage) ||
                        message ||
                        (selectedCards.length
                          ? handType
                            ? `${handType} selected`
                            : "Choose a valid combination"
                          : isMyTurn
                            ? "Play a card or a valid combination"
                            : "A good hand is worth the wait.")}
                </span>
              </>
            )}
          </div>
          {!spectator && (
            <div
              className="your-hand"
              role="group"
              aria-label={`${user.name}'s hand, ${hand.length} cards`}
            >
              {hand.map((card, i) => {
                const offset = i - (hand.length - 1) / 2;
                const selected = selectedCards.some(
                  (c) => c.suit === card.suit && c.value === card.value,
                );
                return (
                  <PlayingCard
                    key={card.suit + card.value}
                    card={card}
                    className="table-card hand-card"
                    style={
                      {
                        "--card-x": `${offset * Math.min(8.2, 69 / Math.max(hand.length - 1, 1)) * (fanOut / 100)}cqw`,
                        "--card-angle": `${offset * Math.min(3.5, 32 / Math.max(hand.length - 1, 1)) * (fanOut / 100)}deg`,
                        "--card-y": `${Math.pow(offset / Math.max((hand.length - 1) / 2, 1), 2) * cardArc * (fanOut / 100)}cqw`,
                        "--card-order": i,
                      } as CSSProperties
                    }
                    selected={selected}
                    disabled={!isMyTurn}
                    onClick={() => {
                      setSelectedCards((previous) =>
                        selected
                          ? previous.filter((c) => c.suit !== card.suit || c.value !== card.value)
                          : [...previous, card],
                      );
                      setMessage(undefined);
                      playSound(selected ? "deselect" : "select");
                      navigator.vibrate?.(8);
                    }}
                  />
                );
              })}
            </div>
          )}
          {spectator && players[bottom] && (
            <PlayerSeat
              name={players[bottom].name}
              count={cardCount(bottom)}
              avatar={players[bottom].isBot ? "🤖" : (players[bottom].emoji ?? "♠️")}
              active={
                isGameTurnState(currentValue) && bottom === gameState.context.currentPlayerIndex
              }
              position="you"
              showBacks
              turnLabel="Playing…"
            />
          )}
          {me && (
            <PlayerSeat
              name={sharedDevice ? user.name : "You"}
              count={cardCount(myIndex)}
              avatar={me.isBot ? "🤖" : (user.emoji ?? me.emoji ?? "♠️")}
              active={isMyTurn}
              jevFallback={jevFallbackPlayerIds?.has(me.id)}
              position="you"
            />
          )}
        </div>
      </section>
      {!spectator && !(roomCode && finished) && (
        <footer className="table-controls">
          <button
            className="table-action"
            aria-label="Pass turn"
            disabled={
              !isMyTurn || currentValue === "ROUND_FIRST_MOVE" || currentValue === "PLAY_NEW_ROUND"
            }
            onClick={() => {
              playSound("deselect");
              void act({ type: "PASS_TURN", playerId: user.id });
            }}
          >
            Pass
          </button>
          <button
            className="table-action"
            aria-label={`Sort cards by ${sortBySuit ? "rank" : "suit"}`}
            onClick={() => {
              setSortBySuit(!sortBySuit);
              playSound("select");
            }}
          >
            Sort
          </button>
          <button
            className="table-action action-play"
            aria-label="Play selected cards"
            disabled={!isMyTurn || !handType}
            onClick={() => {
              const event = createPlayEvent(gameState, user.id, selectedCards);
              if (event) void act(event);
            }}
          >
            Play
          </button>
          <div className="table-footnote">
            <span>♠ &nbsp; BIG TWO</span>
            {requestHint && (
              <button disabled={!isMyTurn} onClick={hint} aria-label="Suggest a move">
                Need a hint?
              </button>
            )}
            <button onClick={toggleMuted} aria-label={muted ? "Unmute sounds" : "Mute sounds"}>
              {muted ? <VolumeX /> : <Volume2 />}
            </button>
          </div>
        </footer>
      )}
      {import.meta.env.DEV && localDevTools && LazyGameRoomDevTools ? (
        <Suspense fallback={null}>
          <LazyGameRoomDevTools
            handCount={hand.length}
            fanOut={fanOut}
            arc={cardArc}
            selectedLift={selectedLift}
            showGuides={showGuides}
            showCardOrder={showCardOrder}
            motion={motion}
            onFanOutChange={setFanOut}
            onArcChange={setCardArc}
            onSelectedLiftChange={setSelectedLiftOverride}
            onShowGuidesChange={setShowGuides}
            onShowCardOrderChange={setShowCardOrder}
            onMotionChange={setMotion}
            onReset={resetDevLayout}
          />
        </Suspense>
      ) : null}
      <Dialog
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <DialogContent className={`table-dialog ${panel === "menu" ? "table-menu-dialog" : ""}`}>
          <DialogTitle>
            {panel === "menu"
              ? "Your table"
              : panel === "settings"
                ? "Table settings"
                : "A little table wisdom"}
          </DialogTitle>
          <DialogDescription>
            {panel === "help"
              ? "Be the first to play all your cards. Play singles, pairs, triples, or five-card poker hands. Match the previous combination with a stronger one, or pass. Ranks run from 3 up to 2; suits from diamonds, clubs, hearts to spades. The first play must include 3 ♦."
              : panel === "settings"
                ? botSettings?.onStrategyChange
                  ? "Choose how each opponent plays. Changes apply to their next turn."
                  : "Make yourself comfortable. Sound starts after your first interaction."
                : `${tableLabel} · ${players.length} players at the table`}
          </DialogDescription>
          {panel === "settings" && (
            <div className="table-settings-list">
              {roomCode && host && players.some((player) => player.isBot) && (
                <div className="online-bot-settings">
                  <p>Remove a bot to open a seat. This resets the game for everyone.</p>
                  {players
                    .filter((player) => player.isBot)
                    .map((bot) => (
                      <button
                        key={bot.id}
                        className="table-small-button"
                        onClick={() => {
                          setBotError(undefined);
                          setRemoveBot({ id: bot.id, name: bot.name });
                          setPanel(null);
                        }}
                      >
                        Remove {bot.name}
                      </button>
                    ))}
                </div>
              )}
              {botSettings?.onStrategyChange && (
                <div className="bot-strategy-settings">
                  <div className="settings-section-heading">
                    <span>Opponent AI</span>
                    <small>Basic is instant. Jev plays strategically.</small>
                  </div>
                  {botSettings.players.map((bot) => {
                    const strategy = bot.botStrategy ?? "basic";
                    return (
                      <div className="bot-strategy-row" key={bot.id}>
                        <span className="bot-strategy-name">{bot.name}</span>
                        <div
                          className="bot-strategy-toggle"
                          role="group"
                          aria-label={`AI mode for ${bot.name}`}
                        >
                          <button
                            type="button"
                            aria-pressed={strategy === "basic"}
                            onClick={() => botSettings.onStrategyChange?.(bot.id, "basic")}
                          >
                            Basic
                          </button>
                          <button
                            type="button"
                            aria-pressed={strategy === "jev"}
                            onClick={() => botSettings.onStrategyChange?.(bot.id, "jev")}
                          >
                            ✨ Jev
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <p className="bot-strategy-note">
                    If Jev is unavailable, that opponent safely falls back to Basic AI.
                  </p>
                </div>
              )}
              <button className="table-small-button settings-sound-button" onClick={toggleMuted}>
                {muted ? "Turn sound on" : "Turn sound off"}
              </button>
              {roomCode && !spectator && turnNotifications && panel === "settings" && (
                <TurnNotificationSettings preference={turnNotifications} />
              )}
            </div>
          )}
          {panel === "menu" && (
            <div className="table-menu-actions">
              {host && (
                <button
                  className="table-small-button table-menu-primary"
                  aria-label="Start a new game"
                  onClick={() => {
                    void act({ type: "RESET_GAME" });
                    setPanel(null);
                  }}
                >
                  New Game
                </button>
              )}
              {roomCode && !spectator ? (
                <button
                  className="table-small-button table-leave-button"
                  onClick={() => {
                    setPanel(null);
                    setLeaveError(undefined);
                    setConfirmLeave(true);
                  }}
                >
                  Leave table
                </button>
              ) : !roomCode ? (
                <a className="table-small-button" href="/">
                  Leave table
                </a>
              ) : null}
              {roomCode && <ReturnToLobby />}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {roomCode && (
        <Dialog
          open={Boolean(removeBot)}
          onOpenChange={(open) => {
            if (!open && !botPending) setRemoveBot(undefined);
          }}
        >
          <DialogContent className="table-dialog" showCloseButton={!botPending}>
            <DialogTitle>Remove {removeBot?.name}?</DialogTitle>
            <DialogDescription>
              This resets the game for everyone and opens this seat for a human to join. The other
              players and bots keep their seats.
            </DialogDescription>
            <div className="leave-table-actions">
              <button
                className="table-small-button"
                disabled={botPending}
                onClick={() => setRemoveBot(undefined)}
              >
                Cancel
              </button>
              <button
                className="table-small-button table-leave-button"
                disabled={botPending || !host}
                onClick={() =>
                  removeBot && void manageBots({ type: "REMOVE_BOT", botId: removeBot.id })
                }
              >
                {botPending ? "Removing…" : "Remove bot and reset game"}
              </button>
            </div>
            {botError && <p role="alert">{botError}</p>}
          </DialogContent>
        </Dialog>
      )}
      {roomCode && (
        <Dialog
          open={confirmLeave}
          onOpenChange={(open) => {
            if (!open && !leavePending) setConfirmLeave(false);
          }}
        >
          <DialogContent
            className="table-dialog leave-table-dialog"
            showCloseButton={!leavePending}
          >
            <DialogTitle>Leave this table?</DialogTitle>
            <DialogDescription>
              You’ll give up your seat and reset the game for everyone. You’ll stay here as a
              Spectator and can take an open seat again later.
            </DialogDescription>
            <div className="leave-table-actions">
              <button
                type="button"
                className="table-small-button"
                disabled={leavePending}
                onClick={() => setConfirmLeave(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="table-small-button table-leave-button"
                disabled={leavePending}
                onClick={() => void leave()}
              >
                {leavePending ? "Leaving…" : "Leave table and reset game"}
              </button>
            </div>
            {leaveError && (
              <p role="alert" className="leave-table-error">
                {leaveError}
              </p>
            )}
          </DialogContent>
        </Dialog>
      )}
      <Dialog
        open={finished && (!roomCode || showResult)}
        onOpenChange={(open) => {
          if (roomCode && !open) setShowResult(false);
        }}
      >
        <DialogContent
          showCloseButton={Boolean(roomCode)}
          className="table-dialog winner-dialog"
          onCloseAutoFocus={(event) => {
            if (roomCode && resultsButton.current) {
              event.preventDefault();
              resultsButton.current.focus();
            }
          }}
        >
          {(sharedDevice || winner?.id === user.id) && <Confetti />}
          <p className="winner-eyebrow">Table complete</p>
          <WinnerArtwork isWinner={sharedDevice || winner?.id === user.id} />
          <DialogTitle>
            {!sharedDevice && winner?.id === user.id
              ? "Beautifully played."
              : `${winner ? winner.name : "An opponent"} wins!`}
          </DialogTitle>
          <DialogDescription>
            {spectator
              ? "Stay to watch the next game, or head back home."
              : !sharedDevice && winner?.id === user.id
                ? "Every card played. The table is yours."
                : "Good cards. Great company. Ready for another?"}
          </DialogDescription>
          {host ? (
            <button
              className="table-small-button"
              aria-label="Start a new game"
              onClick={() => (roomCode ? restart() : act({ type: "RESET_GAME" }))}
            >
              Play again
            </button>
          ) : spectator ? (
            <p>Waiting for the host to start another game…</p>
          ) : null}
          {roomCode && <ReturnToLobby />}
          {!roomCode && !host && (
            <a className="table-small-button" href="/">
              Return home
            </a>
          )}
          {roomCode && restartError && <p role="alert">{restartError}</p>}
        </DialogContent>
      </Dialog>
    </main>
  );
};
