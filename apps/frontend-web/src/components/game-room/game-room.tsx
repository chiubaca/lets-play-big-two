import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import { Check, Copy, HelpCircle, Menu, Settings, Volume2, VolumeX, WifiOff } from "lucide-react";
import type { BigTwoGameMachineSnapshot, Card, GameEvent } from "@big-two/game-state-machine";
import { detectHandType } from "@big-two/game-core";
import { Confetti } from "../Confetti";
import { Card as PlayingCard, getCardAccessibleName } from "./card";
import { DEFAULT_DEV_LAYOUT } from "./game-room-dev-layout";
import { makePlayerOrder } from "./helpers/make-player-order";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import { createPlayEvent, isGameTurnState } from "./game-room-session";
import { useTableAudio } from "./use-table-audio";
import "./game-room.css";

const LOCAL_DEV_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "local.bigtwo.com"]);
const LazyGameRoomDevTools = import.meta.env.DEV
  ? lazy(() =>
      import("./game-room-dev-tools").then(({ GameRoomDevTools }) => ({
        default: GameRoomDevTools,
      })),
    )
  : null;

export type GameRoomUser = { id: string; name: string };
export type BotStrategy = "basic" | "jev";
export type BotSettings = {
  players: ReadonlyArray<GameRoomUser & { botStrategy?: BotStrategy }>;
  onStrategyChange: (playerId: string, strategy: BotStrategy) => void;
};
type GameRoomProps = {
  botSettings?: BotSettings;
  gameState?: BigTwoGameMachineSnapshot;
  jevFallbackPlayerIds?: ReadonlySet<string>;
  requestHint?: () => Card[] | null;
  send: (event: GameEvent) => Promise<void> | void;
  tableLabel: string;
  thinkingPlayerId?: string;
  user: GameRoomUser;
  sharedDevice?: boolean;
  hideHand?: boolean;
};

function PlayerSeat({
  name,
  count,
  avatar,
  active,
  thinking,
  jevFallback,
  position,
}: {
  name: string;
  count: number;
  avatar: string;
  active: boolean;
  thinking?: boolean;
  jevFallback?: boolean;
  position: string;
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
        {active && <span className="turn-indicator">{thinking ? "Thinking…" : "Your turn"}</span>}
      </div>
      {position !== "you" && (
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
  tableLabel,
  thinkingPlayerId,
  user,
  sharedDevice = false,
  hideHand = false,
}: GameRoomProps) => {
  const [selectedCards, setSelectedCards] = useState<Card[]>([]);
  const [message, setMessage] = useState<string>();
  const [sortBySuit, setSortBySuit] = useState(false);
  const [panel, setPanel] = useState<"menu" | "settings" | "help" | null>(null);
  const [copied, setCopied] = useState(false);
  const [fanOut, setFanOut] = useState<number>(DEFAULT_DEV_LAYOUT.fanOut);
  const [cardArc, setCardArc] = useState<number>(DEFAULT_DEV_LAYOUT.arc);
  const [selectedLiftOverride, setSelectedLiftOverride] = useState<number>();
  const [showGuides, setShowGuides] = useState<boolean>(DEFAULT_DEV_LAYOUT.showGuides);
  const [showCardOrder, setShowCardOrder] = useState<boolean>(DEFAULT_DEV_LAYOUT.showCardOrder);
  const [motion, setMotion] = useState<boolean>(DEFAULT_DEV_LAYOUT.motion);
  const { playSound, muted, toggleMuted } = useTableAudio();
  const [localDevTools, setLocalDevTools] = useState(false);
  const currentId = gameState?.context.players[gameState.context.currentPlayerIndex]?.id;
  const currentValue = gameState?.value;
  const isMyTurn = !hideHand && currentId === user.id && isGameTurnState(currentValue);
  const pile = gameState?.context.cardPile;
  const lastPlayKey = JSON.stringify(pile?.at(-1) ?? []);

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

  if (!gameState) return <main className="game-room room-loading">Taking your seat…</main>;
  const { players, guardMessage, winner } = gameState.context;
  const playerName = (player: GameRoomUser) => {
    const bot = botSettings?.players.find((entry) => entry.id === player.id);
    return bot?.botStrategy === "jev" ? `${player.name} ✨[jev]` : player.name;
  };
  const myIndex = players.findIndex((p) => p.id === user.id);
  const [, left, top, right] = makePlayerOrder(myIndex);
  const me = players[myIndex];
  const host = sharedDevice || players[0]?.id === user.id;
  const waiting = currentValue === "WAITING_FOR_PLAYERS";
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
    : isMyTurn
      ? currentValue === "ROUND_FIRST_MOVE"
        ? "Your turn · start with 3 ♦"
        : "Your turn"
      : `${players[gameState.context.currentPlayerIndex] ? playerName(players[gameState.context.currentPlayerIndex]) : "Next player"} is thinking…`;
  const act = async (event: GameEvent) => {
    try {
      await send(event);
      setSelectedCards([]);
      setMessage(undefined);
    } catch {
      setMessage("That move could not be sent. Please try again.");
      playSound("notice");
    }
  };
  const hint = () => {
    const cards = requestHint?.();
    setSelectedCards(cards ?? []);
    setMessage(
      cards?.length
        ? "A little nudge. Your move is selected."
        : "No legal play available. Pass this turn.",
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
      <div className="room-wall" aria-hidden="true" />
      <header className="room-header">
        <button className="room-icon" aria-label="Open table menu" onClick={() => setPanel("menu")}>
          <Menu />
        </button>
        <button
          className="room-code"
          aria-label={`Copy room code ${tableLabel}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(tableLabel);
              setCopied(true);
              playSound("select");
            } catch {
              setMessage(`Room: ${tableLabel}`);
            }
          }}
        >
          <span>
            <small>
              {sharedDevice ? "Shared device" : requestHint ? "Practice table" : "Room Code"}
            </small>
            <strong>{tableLabel}</strong>
          </span>
          {copied ? <Check /> : <Copy />}
        </button>
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
      <section className="table-shell" aria-label="Big Two game table">
        <div className="table-felt">
          <div
            className={`table-brand ${lastHand?.length ? "brand-subtle" : ""}`}
            aria-hidden="true"
          >
            <span className="brand-spade">♠</span>
            <span>
              BIG CARDS
              <br />
              BIGGER FRIENDSHIPS
            </span>
            <div className="brand-rule">◆</div>
          </div>
          {[
            { index: top, position: "top", avatar: "👨🏻" },
            { index: left, position: "left", avatar: "👩🏻" },
            { index: right, position: "right", avatar: "👨🏻‍✈️" },
          ].map(({ index, position, avatar }) => (
            <PlayerSeat
              key={position}
              name={players[index] ? playerName(players[index]) : "Open seat"}
              count={players[index]?.hand.length ?? 0}
              avatar={players[index] ? avatar : "♠"}
              active={
                isGameTurnState(currentValue) && index === gameState.context.currentPlayerIndex
              }
              thinking={thinkingPlayerId === players[index]?.id}
              jevFallback={jevFallbackPlayerIds?.has(players[index]?.id)}
              position={position}
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
                {!me ? (
                  <button
                    className="table-small-button"
                    onClick={() =>
                      act({ type: "JOIN_GAME", playerId: user.id, playerName: user.name })
                    }
                  >
                    Join Table
                  </button>
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
              </>
            ) : (
              <>
                <small className={isMyTurn ? "your-turn-text" : ""}>{status}</small>
                <span>
                  {guardMessage ||
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
          {me && (
            <PlayerSeat
              name={sharedDevice ? user.name : "You"}
              count={me.hand.length}
              avatar="👨🏻"
              active={isMyTurn}
              jevFallback={jevFallbackPlayerIds?.has(me.id)}
              position="you"
            />
          )}
        </div>
      </section>
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
        <DialogContent className="table-dialog">
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
                ? botSettings
                  ? "Choose how each opponent plays. Changes apply to their next turn."
                  : "Make yourself comfortable. Sound starts after your first interaction."
                : `${tableLabel} · ${players.length} players at the table`}
          </DialogDescription>
          {panel === "settings" && (
            <div className="table-settings-list">
              {botSettings && (
                <div className="bot-strategy-settings">
                  <div className="settings-section-heading">
                    <span>Opponent AI</span>
                    <small>Basic is instant. Jev plays strategically.</small>
                  </div>
                  {botSettings.players.map((bot) => {
                    const strategy = bot.botStrategy ?? "basic";
                    return (
                      <div className="bot-strategy-row" key={bot.id}>
                        <span className="bot-strategy-name">{playerName(bot)}</span>
                        <div
                          className="bot-strategy-toggle"
                          role="group"
                          aria-label={`AI mode for ${bot.name}`}
                        >
                          <button
                            type="button"
                            aria-pressed={strategy === "basic"}
                            onClick={() => botSettings.onStrategyChange(bot.id, "basic")}
                          >
                            Basic
                          </button>
                          <button
                            type="button"
                            aria-pressed={strategy === "jev"}
                            onClick={() => botSettings.onStrategyChange(bot.id, "jev")}
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
            </div>
          )}
          {panel === "menu" && (
            <>
              {host && (
                <button
                  className="table-small-button"
                  aria-label="Start a new game"
                  onClick={() => {
                    void act({ type: "RESET_GAME" });
                    setPanel(null);
                  }}
                >
                  New Game
                </button>
              )}
              <a className="table-small-button" href="/">
                Leave table
              </a>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={currentValue === "GAME_END"}>
        <DialogContent showCloseButton={false} className="table-dialog">
          {(sharedDevice || winner?.id === user.id) && <Confetti />}
          <DialogTitle>
            {!sharedDevice && winner?.id === user.id
              ? "Beautifully played."
              : `${winner ? playerName(winner) : "An opponent"} wins!`}
          </DialogTitle>
          <DialogDescription>
            {!sharedDevice && winner?.id === user.id
              ? "Every card played. The table is yours."
              : "Good cards. Great company. Ready for another?"}
          </DialogDescription>
          {host ? (
            <button
              className="table-small-button"
              aria-label="Start a new game"
              onClick={() => act({ type: "RESET_GAME" })}
            >
              Play again
            </button>
          ) : (
            <a className="table-small-button" href="/">
              Return home
            </a>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
};
