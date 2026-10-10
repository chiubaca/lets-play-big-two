import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AppState,
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  Platform,
  Share,
  StyleSheet,
  Switch,
  View,
  useWindowDimensions,
  type LayoutRectangle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import {
  Menu,
  Settings,
  CircleHelp,
  Smartphone,
  Share2,
  MessageCircle,
  Eye,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { getCardKey, getCardRank, SUITS, sortCards, detectHandType } from "@big-two/game-core";
import { getLegalPlays } from "@big-two/game-ai";
import type {
  BigTwoGameMachineSnapshot,
  GameEvent,
  RoomGameState,
  Player,
} from "@big-two/game-state-machine";
import { bigTwoGameMachine } from "@big-two/game-state-machine";
import { CasinoScreen, Label, Button, ErrorMessage, Sheet, styles as ui } from "../ui/primitives";
import { Hand, PlayingCard, CardBack, CardBacks, CardSuit } from "../ui/cards";
import { CardPile } from "../ui/card-pile";
import { TableSurface } from "../ui/table-surface";
import { artwork, colors, fonts } from "../ui/theme";
import { RulesSheet } from "./rules";
import { tableSeats } from "../table-seats";

type TableProps = {
  snapshot?: BigTwoGameMachineSnapshot | RoomGameState;
  userId: string;
  userName?: string;
  userEmoji?: string | null;
  mode: "solo" | "pass-and-play" | "online";
  hidden?: boolean;
  roomId?: string;
  connected?: boolean;
  acting?: boolean;
  error?: string | null;
  send: (event: GameEvent) => void | Promise<void>;
  onHome: () => void;
  onRedeal?: () => void;
  onChat?: () => void;
  chatUnread?: number;
  onReveal?: () => void;
  onRetry?: () => void;
  onSignIn?: () => void;
  notificationSettings?: ReactNode;
};

// Only geometry is shown before hydration; never fabricate a dealt/private hand.
const emptyTable: BigTwoGameMachineSnapshot = bigTwoGameMachine.resolveState({
  value: "WAITING_FOR_PLAYERS",
  context: {
    players: [],
    currentPlayerIndex: 0,
    cardPile: [],
    roundMode: null,
    consecutivePasses: 0,
  },
});

function Seat({
  player,
  count,
  active,
  self = false,
  compact = false,
  waiting = false,
  showBacks = true,
}: {
  player?: Player;
  count: number;
  active: boolean;
  self?: boolean;
  compact?: boolean;
  waiting?: boolean;
  showBacks?: boolean;
}) {
  const avatarSize = compact ? 32 : self ? 45 : 38;
  return (
    <View
      accessible
      accessibilityLabel={
        player ? `${player.name}, ${count} cards${active ? ", current turn" : ""}` : "Open seat"
      }
      style={[table.seat, waiting && table.waitingSeat]}
    >
      <LinearGradient
        colors={["#0a1d0c", "#000c04"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          table.plaque,
          self && table.selfPlaque,
          compact && table.compactPlaque,
          waiting && table.waitingPlaque,
          active && table.activePlaque,
        ]}
      >
        <LinearGradient
          colors={["#101a0d", "#52462b"]}
          style={[
            table.avatar,
            { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 },
          ]}
        >
          <Label
            style={{
              fontSize: avatarSize * 0.78,
              lineHeight: avatarSize,
              includeFontPadding: false,
            }}
          >
            {player?.isBot ? "🤖" : (player?.emoji ?? (player ? "♠️" : "＋"))}
          </Label>
        </LinearGradient>
        <View style={table.playerDetails}>
          <Label
            numberOfLines={1}
            style={[table.playerName, self && { fontSize: 14 }, compact && { fontSize: 11 }]}
          >
            {player?.name ?? "Open seat"}
          </Label>
          <View style={table.playerCount}>
            <CardBack width={compact ? 10 : self ? 15 : 12} />
            <Label
              style={{ fontSize: compact ? 13 : self ? 20 : 17, lineHeight: compact ? 17 : 24 }}
            >
              {count}
            </Label>
          </View>
        </View>
        {active && (
          <View style={table.turnBadgePosition}>
            <Label style={table.turnBadge}>
              {self ? "Your turn" : player?.isBot ? "Thinking…" : "Playing…"}
            </Label>
          </View>
        )}
      </LinearGradient>
      {!self && showBacks && <CardBacks count={count} compact={compact} />}
    </View>
  );
}

export function TableScreen({
  snapshot: loadedSnapshot,
  userId,
  userName = "Player",
  userEmoji,
  mode,
  hidden = false,
  roomId,
  connected = true,
  acting = false,
  error,
  send,
  onHome,
  onRedeal,
  onChat,
  chatUnread = 0,
  onReveal,
  onRetry,
  onSignIn,
  notificationSettings,
}: TableProps) {
  const snapshot: BigTwoGameMachineSnapshot | RoomGameState = loadedSnapshot ?? emptyTable;
  const loading = !loadedSnapshot;
  const spectatorCount =
    loadedSnapshot && "spectatorCount" in loadedSnapshot ? loadedSnapshot.spectatorCount : 0;
  const roomNotice =
    loadedSnapshot && "roomNotice" in loadedSnapshot ? loadedSnapshot.roomNotice : null;
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const width = window.width - insets.left - insets.right;
  const height = window.height - insets.top - insets.bottom;
  const compact = width > height && height < 550;
  const shortWaiting = height < 650;
  const densePortrait = shortWaiting && !compact;
  const compressedLandscape = compact && height < 380;
  const Controls = compact ? ScrollView : View;
  const requestedBoardWidth = Math.min(width - 16, compact ? width * 0.69 : 760);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const [handFrame, setHandFrame] = useState<LayoutRectangle>();
  const [centerFrame, setCenterFrame] = useState<LayoutRectangle>();
  const [seatFrames, setSeatFrames] = useState<Record<string, LayoutRectangle>>({});
  const boardWidth = boardSize.width || requestedBoardWidth;
  const handWidth = compressedLandscape
    ? boardWidth * 0.75
    : compact
      ? boardWidth
      : boardWidth * 0.92;
  const pileCardWidth = compressedLandscape
    ? 22
    : densePortrait
      ? 32
      : compact
        ? 44
        : Math.min(64, boardWidth * 0.12);
  const context = snapshot.context;
  const current = context.players[context.currentPlayerIndex];
  const you = context.players.find((player) => player.id === userId);
  const spectator = mode === "online" && !you;
  const isHost = context.players.find((player) => !player.isBot)?.id === userId;
  const waiting = snapshot.value === "WAITING_FOR_PLAYERS";
  const finished = snapshot.value === "GAME_END";
  const playable = !loading && !spectator && !waiting && !finished;
  const yourTurn = playable && !hidden && current?.id === userId;
  const [selected, setSelected] = useState<string[]>([]);
  const [sortSuit, setSortSuit] = useState(false);
  const [panel, setPanel] = useState<"menu" | "help" | "settings" | "results" | "cards" | null>(
    null,
  );
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [removeBot, setRemoveBot] = useState<Player | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const busy = mode === "online" ? acting : localBusy;
  const [message, setMessage] = useState<string | null>(null);
  const [autoPass, setAutoPass] = useState(false);
  const lastAutoTurn = useRef<string | null>(null);
  const previousFinished = useRef(finished);
  const hand = hidden
    ? []
    : sortSuit
      ? [...(you?.hand ?? [])].sort(
          (a, b) =>
            SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || getCardRank(a) - getCardRank(b),
        )
      : sortCards(you?.hand ?? []);
  const selectedCards = hand.filter((card) => selected.includes(getCardKey(card)));
  const pile = context.cardPile.at(-1) ?? [];
  const activeRound = snapshot.value === "NEXT_PLAYER_TURN";
  const legal = useMemo(
    () =>
      yourTurn
        ? getLegalPlays({
            hand,
            roundMode: activeRound ? context.roundMode : null,
            cardsToBeat: activeRound ? pile : undefined,
            requiredCard:
              snapshot.value === "ROUND_FIRST_MOVE" ? { suit: "DIAMOND", value: "3" } : undefined,
          })
        : [],
    [yourTurn, context.players, userId, activeRound, context.roundMode, pile, snapshot.value],
  );
  const turnKey = JSON.stringify([
    snapshot.value,
    current?.id,
    context.cardPile.length,
    context.consecutivePasses,
  ]);
  const counts =
    loadedSnapshot && "handCounts" in loadedSnapshot
      ? loadedSnapshot.handCounts
      : Object.fromEntries(context.players.map((player) => [player.id, player.hand.length]));
  const seats = tableSeats(context.players, userId);
  const handoff =
    mode === "pass-and-play" && hidden && !!current && !current.isBot && !!onReveal && !finished;
  const handoffName = useRef("");
  // A closing handoff retains the human's name, never the next bot's name.
  if (handoff) handoffName.current = current.name;

  useEffect(() => {
    setSelected([]);
    setMessage(null);
    setPanel((previous) => (previous === "cards" ? null : previous));
  }, [turnKey, userId, hidden]);
  useEffect(() => {
    if (finished && (!previousFinished.current || mode !== "online")) setPanel("results");
    if (!finished) setPanel((previous) => (previous === "results" ? null : previous));
    previousFinished.current = finished;
  }, [finished, mode]);
  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem("big-two-native-auto-pass")
      .then((value) => {
        if (mounted) setAutoPass(value === "true");
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (
      !connected ||
      busy ||
      !autoPass ||
      !yourTurn ||
      !activeRound ||
      legal.length ||
      lastAutoTurn.current === turnKey
    )
      return;
    lastAutoTurn.current = turnKey;
    void Promise.resolve()
      .then(() => send({ type: "PASS_TURN", playerId: userId }))
      .catch((reason: unknown) =>
        setMessage(reason instanceof Error ? reason.message : "Could not pass."),
      );
  }, [connected, busy, autoPass, yourTurn, activeRound, legal.length, turnKey, userId, send]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") setSelected([]);
    });
    return () => subscription.remove();
  }, []);

  const act = async (event: GameEvent) => {
    if (busy || loading) return false;
    if (mode !== "online") setLocalBusy(true);
    setMessage(null);
    try {
      await send(event);
      setSelected([]);
      return true;
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not update the table.");
      return false;
    } finally {
      if (mode !== "online") setLocalBusy(false);
    }
  };
  const play = () =>
    act({
      type:
        snapshot.value === "ROUND_FIRST_MOVE"
          ? "PLAY_FIRST_MOVE"
          : snapshot.value === "PLAY_NEW_ROUND"
            ? "PLAY_NEW_ROUND_FIRST_MOVE"
            : "PLAY_CARDS",
      playerId: userId,
      cards: selectedCards,
    });
  const count = (player?: Player) => (player ? (counts[player.id] ?? 0) : 0);
  const measureSeat = (player: Player | undefined, frame: LayoutRectangle) => {
    if (player) setSeatFrames((previous) => ({ ...previous, [player.id]: frame }));
  };
  const seat = (player?: Player, self = false) => (
    <Seat
      player={player}
      count={count(player)}
      active={!waiting && !finished && current?.id === player?.id}
      self={self}
      compact={compact || densePortrait || (waiting && width < 360)}
      waiting={waiting}
      showBacks={!densePortrait && !compressedLandscape}
    />
  );
  const shareRoom = async () => {
    if (roomId)
      await Share.share({
        message: `Join my Big Two Crew table: https://big-two.chiubaca.com/room/${roomId}`,
      });
  };

  return (
    <CasinoScreen>
      <View
        style={table.page}
        accessibilityElementsHidden={handoff}
        importantForAccessibility={handoff ? "no-hide-descendants" : "auto"}
      >
        <View
          style={[
            table.header,
            mode === "online" && table.onlineHeader,
            compact && { minHeight: mode === "online" ? 72 : 49 },
          ]}
        >
          <Button
            title="☰"
            icon={<Menu color={colors.gold} size={24} />}
            accessibilityLabel="Table menu"
            onPress={() => setPanel("menu")}
            style={table.iconButton}
          />
          {mode === "online" && (
            <Button
              title="Room chat"
              accessibilityLabel={chatUnread ? `Room chat, ${chatUnread} unread` : "Room chat"}
              icon={
                <View>
                  <MessageCircle color={colors.gold} size={24} />
                  {chatUnread > 0 && (
                    <Label style={table.chatBadge}>{chatUnread > 9 ? "9+" : chatUnread}</Label>
                  )}
                </View>
              }
              disabled={loading || !onChat}
              onPress={() => onChat?.()}
              style={[table.iconButton, table.chatButton]}
            />
          )}
          {mode === "online" && (
            <View
              accessible
              accessibilityLabel={loading ? "Loading spectators" : `${spectatorCount} watching`}
              style={table.spectators}
            >
              <Eye color={colors.muted} size={13} />
              <Label style={table.spectatorCount}>{loading ? "–" : spectatorCount}</Label>
            </View>
          )}
          {roomId && (
            <View style={[table.roomCodePosition, mode === "online" && !compact && { top: 49 }]}>
              <Button
                title={roomId}
                accessibilityLabel={`Share room ${roomId}`}
                icon={
                  <View style={table.roomCodeContent}>
                    <Label mono style={table.roomCodeLabel}>
                      ROOM
                    </Label>
                    <Label mono style={table.roomCode}>
                      {roomId}
                    </Label>
                    <Share2 color={colors.muted} size={13} />
                  </View>
                }
                onPress={() =>
                  void shareRoom().catch(() => setMessage("Could not share this room."))
                }
                style={table.roomCodeButton}
              />
            </View>
          )}
          <View style={{ flex: 1 }} />
          <Button
            title="?"
            icon={<CircleHelp color={colors.gold} size={24} />}
            accessibilityLabel="How to play"
            onPress={() => setPanel("help")}
            style={table.iconButton}
          />
          <Button
            title="⚙"
            icon={<Settings color={colors.gold} size={24} />}
            accessibilityLabel="Table settings"
            onPress={() => setPanel("settings")}
            style={table.iconButton}
          />
        </View>
        {mode === "online" && !loading && !connected && (
          <Label
            mono
            style={[table.connectionStatus, compact && { top: 58 }]}
            accessibilityLiveRegion="polite"
          >
            RECONNECTING…
          </Label>
        )}
        <View style={[table.playArea, compact && { flexDirection: "row" }]}>
          <View
            testID="table-board"
            onLayout={({ nativeEvent }) =>
              setBoardSize({ width: nativeEvent.layout.width, height: nativeEvent.layout.height })
            }
            style={[
              table.board,
              {
                width: requestedBoardWidth,
                marginTop: compact ? 0 : 16,
              },
              compact && { marginTop: 0, alignSelf: "stretch" },
            ]}
          >
            <TableSurface width={boardWidth} height={boardSize.height} />
            <View
              pointerEvents="none"
              style={[
                table.tableMark,
                compact && { top: "18%" },
                waiting && shortWaiting && { opacity: 0.18 },
                pile.length > 0 && { opacity: 0.3 },
              ]}
            >
              <CardSuit
                suit="SPADE"
                size={compact ? 65 : Math.min(110, boardWidth * 0.23)}
                color="#97af486b"
              />
              <View style={table.brandRule}>
                <View style={table.brandRuleLine} />
                <Label style={{ color: "#b6bd60", fontSize: 8, lineHeight: 10 }}>◆</Label>
                <View style={table.brandRuleLine} />
              </View>
            </View>
            {loading ? (
              <ScrollView style={table.waitingScroll} contentContainerStyle={table.loading}>
                <Label heading style={{ textAlign: "center" }} accessibilityLiveRegion="polite">
                  {onSignIn
                    ? "Take your seat"
                    : error
                      ? "Couldn’t open the table"
                      : "Taking your seat…"}
                </Label>
                {onSignIn ? (
                  <>
                    <Label style={table.centerText}>Sign in to watch or join room {roomId}.</Label>
                    <Button title="Sign in" gold onPress={onSignIn} />
                  </>
                ) : error ? (
                  <ErrorMessage message={error} />
                ) : (
                  <ActivityIndicator color={colors.gold} />
                )}
                {error && onRetry && <Button title="Retry" gold onPress={onRetry} />}
                <Button title="Return to lobby" onPress={onHome} />
              </ScrollView>
            ) : waiting ? (
              <ScrollView
                style={table.waitingScroll}
                contentContainerStyle={[table.waiting, shortWaiting && table.shortWaiting]}
                showsVerticalScrollIndicator={false}
              >
                <View style={table.waitingSeatRow}>{seat(seats.top)}</View>
                <View style={[table.waitingSpacer, shortWaiting && { minHeight: 0 }]} />
                <View style={table.waitingSideSeats}>
                  <View style={table.waitingSideSeat}>{seat(seats.left)}</View>
                  <View style={[table.waitingSideSeat, { alignItems: "flex-end" }]}>
                    {seat(seats.right)}
                  </View>
                </View>
                <View style={[table.waitingSpacer, shortWaiting && { minHeight: 0 }]} />
                <View style={[table.waitingPrompt, shortWaiting && { padding: 8, gap: 4 }]}>
                  <Label style={table.centerText} accessibilityLiveRegion="polite">
                    {`Waiting for players · ${context.players.length} of 4 seats filled`}
                  </Label>
                  {spectator && context.players.length < 4 && (
                    <Button
                      title="Join Table"
                      busy={busy}
                      disabled={!connected}
                      style={table.smallButton}
                      labelStyle={table.smallButtonText}
                      onPress={() =>
                        void act({
                          type: "JOIN_GAME",
                          playerId: userId,
                          playerName: userName,
                          ...(userEmoji ? { playerEmoji: userEmoji } : {}),
                        })
                      }
                    />
                  )}
                  {isHost && (
                    <>
                      {context.players.length < 4 && (
                        <Button
                          title="Fill with bots"
                          disabled={!connected}
                          busy={busy}
                          style={table.smallButton}
                          labelStyle={table.smallButtonText}
                          onPress={() => void act({ type: "FILL_WITH_BOTS" })}
                        />
                      )}
                      <Button
                        title="Deal Cards"
                        disabled={context.players.length < 2 || !connected}
                        busy={busy}
                        style={table.smallButton}
                        labelStyle={table.smallButtonText}
                        onPress={() => void act({ type: "START_GAME" })}
                      />
                    </>
                  )}
                  {!isHost && !spectator && (
                    <Label style={table.centerText}>Waiting for the host to deal.</Label>
                  )}
                  {spectator && context.players.length >= 4 && (
                    <Label style={table.centerText}>All seats are taken · watching the table</Label>
                  )}
                </View>
                <View style={[table.waitingBottomSpacer, shortWaiting && { minHeight: 0 }]} />
                <View style={table.waitingSeatRow}>{seat(seats.bottom, !spectator)}</View>
              </ScrollView>
            ) : (
              <>
                <View
                  onLayout={({ nativeEvent }) => measureSeat(seats.top, nativeEvent.layout)}
                  style={[table.topSeat, compact && { top: compressedLandscape ? 0 : 10 }]}
                >
                  {seat(seats.top)}
                </View>
                <View
                  onLayout={({ nativeEvent }) => measureSeat(seats.left, nativeEvent.layout)}
                  style={[
                    table.leftSeat,
                    compact && { top: "16%" },
                    densePortrait && { top: "22%" },
                  ]}
                >
                  {seat(seats.left)}
                </View>
                <View
                  onLayout={({ nativeEvent }) => measureSeat(seats.right, nativeEvent.layout)}
                  style={[
                    table.rightSeat,
                    compact && { top: "16%" },
                    densePortrait && { top: "22%" },
                  ]}
                >
                  {seat(seats.right)}
                </View>
                <View
                  onLayout={({ nativeEvent }) => setCenterFrame(nativeEvent.layout)}
                  style={[table.center, { top: compact || densePortrait ? "28%" : "34%" }]}
                >
                  {!compact && !densePortrait && (
                    <Label
                      mono
                      style={{ fontSize: 8, lineHeight: 21, opacity: pile.length ? 1 : 0 }}
                    >
                      CARDS TO BEAT
                    </Label>
                  )}
                  <CardPile
                    cards={pile}
                    width={pileCardWidth}
                    centerFrame={centerFrame}
                    topInset={!compact && !densePortrait ? 5 + 21 * (window.fontScale ?? 1) : 5}
                    motion={{
                      userId,
                      hidden,
                      connected,
                      hand,
                      selected,
                      counts,
                      handFrame,
                      handWidth,
                      compact: compact || densePortrait,
                      seatFrames,
                    }}
                  />
                  {compact && !compressedLandscape && pile.length > 0 && (
                    <Label mono style={{ fontSize: 8, lineHeight: 12, marginTop: 4 }}>
                      CARDS TO BEAT
                    </Label>
                  )}
                </View>
                {!compact && !densePortrait && !waiting && !finished && (
                  <View
                    style={[table.prompt, { top: "53%", width: boardWidth * 0.58, maxWidth: 340 }]}
                  >
                    <Label accessibilityLiveRegion="polite" style={table.turnText}>
                      {spectator
                        ? "WATCHING THE TABLE"
                        : yourTurn
                          ? snapshot.value === "ROUND_FIRST_MOVE"
                            ? "YOUR TURN · START WITH 3 ♦"
                            : "YOUR TURN"
                          : current?.isBot
                            ? "THINKING…"
                            : `${current?.name ?? "Player"}'S TURN`}
                    </Label>
                    <Label style={table.centerText}>
                      {context.guardMessage ??
                        (snapshot.value === "ROUND_FIRST_MOVE"
                          ? "Play a card or a valid combination"
                          : snapshot.value === "PLAY_NEW_ROUND"
                            ? "You lead. Play a card or combination"
                            : yourTurn
                              ? "Play a card or a valid combination"
                              : "Waiting for the next play")}
                    </Label>
                  </View>
                )}
                {!waiting && !spectator && (
                  <View
                    onLayout={({ nativeEvent }) => setHandFrame(nativeEvent.layout)}
                    style={[table.hand, compact && { bottom: 38 }]}
                  >
                    <Hand
                      cards={hand}
                      width={handWidth}
                      compact={compact || densePortrait}
                      selected={selected}
                      disabled={!yourTurn || busy}
                      onToggle={(card) => {
                        if (!yourTurn || busy) return;
                        if (Platform.OS !== "web")
                          void Haptics.selectionAsync().catch(() => undefined);
                        setSelected((previous) =>
                          previous.includes(getCardKey(card))
                            ? previous.filter((key) => key !== getCardKey(card))
                            : [...previous, getCardKey(card)],
                        );
                      }}
                    />
                  </View>
                )}
                <View style={table.bottomSeat}>{seat(seats.bottom, !spectator)}</View>
                {finished && (
                  <View style={table.finish}>
                    <Label heading>{context.winner?.name} wins!</Label>
                    <Button title="Results" onPress={() => setPanel("results")} />
                    {(mode !== "online" || isHost) && (
                      <Button
                        title="Play again"
                        gold
                        onPress={() => {
                          if (onRedeal) onRedeal();
                          else void act({ type: "RESET_GAME" });
                        }}
                      />
                    )}
                  </View>
                )}
              </>
            )}
          </View>
          <Controls
            style={[
              table.controls,
              compact && {
                width: width * 0.25,
                alignSelf: "stretch",
                paddingTop: 0,
                flexGrow: 0,
                flexShrink: 0,
              },
            ]}
            {...(compact
              ? {
                  contentContainerStyle: { gap: 8, paddingVertical: 12 },
                  keyboardShouldPersistTaps: "handled" as const,
                }
              : {})}
          >
            {shortWaiting && (
              <View
                style={{ height: 40 * (window.fontScale ?? 1), opacity: playable ? 1 : 0 }}
                accessibilityElementsHidden={!playable}
                importantForAccessibility={!playable ? "no-hide-descendants" : "auto"}
                pointerEvents={playable ? "auto" : "none"}
              >
                <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
                  <Label style={table.centerText}>
                    {context.guardMessage ??
                      (yourTurn
                        ? snapshot.value === "ROUND_FIRST_MOVE"
                          ? "Your turn · include 3♦"
                          : "Your turn · choose your cards"
                        : `${current?.name ?? "Player"}'s turn`)}
                  </Label>
                </ScrollView>
              </View>
            )}
            <View
              testID="table-action-slot"
              pointerEvents={playable ? "auto" : "none"}
              accessibilityElementsHidden={!playable}
              importantForAccessibility={!playable ? "no-hide-descendants" : "auto"}
              style={[
                table.actions,
                compact && { flexDirection: "column" },
                !playable && { opacity: 0 },
              ]}
            >
              <Button
                title="Pass"
                disabledAppearance="muted"
                labelStyle={table.actionText}
                disabled={!yourTurn || !activeRound || !connected || busy}
                onPress={() => void act({ type: "PASS_TURN", playerId: userId })}
                style={table.action}
              />
              <Button
                title="Sort"
                disabledAppearance="muted"
                labelStyle={table.actionText}
                disabled={!playable || hidden || busy}
                onPress={() => setSortSuit((value) => !value)}
                style={table.action}
              />
              <Button
                title="Play"
                disabledAppearance="muted"
                labelStyle={table.actionText}
                gold
                disabled={!yourTurn || !connected || busy || !detectHandType(selectedCards)}
                onPress={() => void play()}
                style={table.action}
              />
            </View>
            {mode === "solo" && (
              <View
                accessibilityElementsHidden={!playable}
                importantForAccessibility={!playable ? "no-hide-descendants" : "auto"}
                pointerEvents={playable ? "auto" : "none"}
              >
                <Button
                  title="Need a hint?"
                  ghost
                  labelStyle={{ fontFamily: fonts.body, fontSize: 10, color: "#a99d6e" }}
                  disabled={!yourTurn}
                  onPress={() => {
                    if (legal[0]) setSelected(legal[0].map(getCardKey));
                    else setMessage("No beating move. You can pass.");
                  }}
                  style={[table.hint, !playable && { opacity: 0 }]}
                />
              </View>
            )}
            {!loading && spectator && (
              <Label style={[table.centerText, table.spectatorStatus]}>
                You are watching as a spectator.
              </Label>
            )}
          </Controls>
        </View>
        {!loading && (message ?? error ?? roomNotice) && (
          <View
            style={[
              table.notice,
              {
                top: compact ? (mode === "online" ? 96 : 66) : mode === "online" ? 116 : 96,
                maxHeight: height * 0.22,
              },
            ]}
          >
            <ScrollView keyboardShouldPersistTaps="handled">
              <ErrorMessage message={message ?? error ?? roomNotice} />
            </ScrollView>
          </View>
        )}
      </View>
      <RulesSheet visible={panel === "help" && !handoff} onClose={() => setPanel(null)} />
      <Sheet
        title={
          panel === "settings"
            ? "Table settings"
            : panel === "cards"
              ? "Choose cards"
              : panel === "results"
                ? "Game over"
                : confirmLeave
                  ? "Leave table?"
                  : removeBot
                    ? `Remove ${removeBot.name}?`
                    : "Table menu"
        }
        visible={!!panel && panel !== "help" && !handoff}
        onClose={() => {
          if (!busy) {
            setPanel(null);
            setConfirmLeave(false);
            setRemoveBot(null);
          }
        }}
      >
        {panel === "menu" && (
          <>
            {confirmLeave ? (
              <>
                <Label>
                  This gives up your seat and ends the current game for everyone. You will stay in
                  the room as a spectator.
                </Label>
                <Button
                  title="Leave table"
                  busy={busy}
                  onPress={() => {
                    void act({ type: "LEAVE_GAME", playerId: userId }).then((ok) => {
                      if (ok) {
                        setConfirmLeave(false);
                        setPanel(null);
                      }
                    });
                  }}
                />
                <Button title="Cancel" disabled={busy} onPress={() => setConfirmLeave(false)} />
              </>
            ) : removeBot ? (
              <>
                <Label>Removing a bot resets the game for everyone and opens their seat.</Label>
                <Button
                  title="Remove bot"
                  busy={busy}
                  onPress={() => {
                    void act({ type: "REMOVE_BOT", botId: removeBot.id }).then((ok) => {
                      if (ok) {
                        setRemoveBot(null);
                        setPanel(null);
                      }
                    });
                  }}
                />
                <Button title="Cancel" disabled={busy} onPress={() => setRemoveBot(null)} />
              </>
            ) : (
              <>
                <Button title="Return to lobby" onPress={onHome} />
                <Label style={{ color: colors.muted }}>
                  {mode === "online"
                    ? "You will not leave this table."
                    : "Your local game will be saved."}
                </Label>
                {mode === "online" && !spectator && (
                  <Button title="Leave table" onPress={() => setConfirmLeave(true)} />
                )}
                {roomId && (
                  <Button
                    title="Share room"
                    onPress={() =>
                      void shareRoom().catch(() => setMessage("Could not share this room."))
                    }
                  />
                )}
                {isHost &&
                  mode === "online" &&
                  context.players
                    .filter((player) => player.isBot)
                    .map((bot) => (
                      <Button
                        key={bot.id}
                        title={`Remove ${bot.name}`}
                        onPress={() => setRemoveBot(bot)}
                      />
                    ))}
                {!loading && (mode !== "online" || isHost) && (
                  <Button
                    title="New game"
                    onPress={() => {
                      setPanel(null);
                      if (onRedeal) onRedeal();
                      else void act({ type: "RESET_GAME" });
                    }}
                  />
                )}
              </>
            )}
            <ErrorMessage message={message} />
          </>
        )}
        {panel === "settings" && (
          <>
            {!spectator && (
              <>
                <View style={ui.row}>
                  <View style={{ flex: 1 }}>
                    <Label>Auto-pass</Label>
                    <Label style={{ color: colors.muted, fontSize: 12 }}>
                      Pass only when you cannot beat the pile.
                    </Label>
                  </View>
                  <Switch
                    accessibilityLabel="Auto-pass"
                    value={autoPass}
                    onValueChange={(value) => {
                      setAutoPass(value);
                      void AsyncStorage.setItem("big-two-native-auto-pass", String(value)).catch(
                        () => undefined,
                      );
                    }}
                    trackColor={{ true: colors.goldDark }}
                  />
                </View>
                {yourTurn && <Button title="Choose cards" onPress={() => setPanel("cards")} />}
              </>
            )}
            {mode === "online" && notificationSettings}
          </>
        )}
        {panel === "cards" && yourTurn && (
          <>
            <Label>Tap to select cards. This view gives every card a full touch target.</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {hand.map((card) => (
                <PlayingCard
                  key={getCardKey(card)}
                  card={card}
                  width={58}
                  selected={selected.includes(getCardKey(card))}
                  onPress={() =>
                    setSelected((previous) =>
                      previous.includes(getCardKey(card))
                        ? previous.filter((key) => key !== getCardKey(card))
                        : [...previous, getCardKey(card)],
                    )
                  }
                />
              ))}
            </View>
            <Button title="Done" gold onPress={() => setPanel(null)} />
          </>
        )}
        {panel === "results" && (
          <>
            <Image
              source={artwork.spade}
              style={{ width: "100%", height: 130, marginBottom: -35 }}
              resizeMode="contain"
            />
            <Image
              source={
                mode === "pass-and-play" || context.winner?.id === userId
                  ? artwork.winner
                  : artwork.loser
              }
              style={{ width: "100%", height: 150 }}
              resizeMode="contain"
            />
            <Label heading style={{ textAlign: "center" }}>
              {context.winner?.name} wins!
            </Label>
            {(mode !== "online" || isHost) && (
              <Button
                title="Play again"
                gold
                onPress={() => {
                  setPanel(null);
                  if (onRedeal) onRedeal();
                  else void act({ type: "RESET_GAME" });
                }}
              />
            )}
            <Button title="Return to lobby" onPress={onHome} />
          </>
        )}
      </Sheet>
      <Modal visible={handoff} transparent animationType="fade" onRequestClose={() => undefined}>
        <SafeAreaView
          style={{
            flex: 1,
            justifyContent: "center",
            padding: 24,
            backgroundColor: "rgba(0,5,2,0.85)",
          }}
        >
          <View accessibilityViewIsModal style={table.handoff}>
            <Smartphone color={colors.gold} size={48} />
            <Label heading>Hand to {handoffName.current}</Label>
            <Label style={table.centerText}>
              Keep your hand private. Tap Ready when you have the device.
            </Label>
            <Button title="Ready" gold onPress={() => onReveal?.()} />
          </View>
        </SafeAreaView>
      </Modal>
    </CasinoScreen>
  );
}

const table = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 8, paddingTop: 12, paddingBottom: 4 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 4,
    minHeight: 76,
  },
  iconButton: {
    width: 42,
    height: 42,
    minHeight: 42,
    borderRadius: 24,
    paddingHorizontal: 0,
    paddingVertical: 0,
    boxShadow: "0 5px 10px rgba(0,0,0,0.55)",
  },
  onlineHeader: { minHeight: 96 },
  // The unread badge overhangs the circular button face.
  chatButton: { overflow: "visible" },
  spectators: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 42,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    backgroundColor: "#071b10",
  },
  spectatorCount: { fontSize: 11, color: colors.muted },
  chatBadge: {
    position: "absolute",
    top: -6,
    right: -8,
    backgroundColor: colors.gold,
    color: colors.panel,
    borderRadius: 7,
    paddingHorizontal: 3,
    fontSize: 9,
    lineHeight: 14,
    fontFamily: fonts.strong,
  },
  connectionStatus: {
    position: "absolute",
    top: 82,
    left: 8,
    right: 8,
    textAlign: "center",
    fontSize: 9,
    zIndex: 30,
  },
  roomCodePosition: { position: "absolute", left: 54, right: 54, alignItems: "center", top: 3 },
  roomCodeContent: { flexDirection: "row", gap: 6, alignItems: "center" },
  roomCodeLabel: { fontSize: 8, letterSpacing: 0.7 },
  roomCode: { color: colors.cream, fontSize: 12, letterSpacing: 1, flexShrink: 1 },
  roomCodeButton: {
    borderRadius: 18,
    minHeight: 35,
    paddingVertical: 5,
    paddingHorizontal: 9,
    maxWidth: "100%",
  },
  playArea: { flex: 1, alignItems: "center", gap: 8 },
  board: {
    flex: 1,
    padding: 6,
  },
  tableMark: {
    position: "absolute",
    top: "24%",
    alignSelf: "center",
    alignItems: "center",
    opacity: 0.65,
  },
  brandRule: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  brandRuleLine: { width: 28, height: 1, backgroundColor: "#b6bd60", opacity: 0.35 },
  seat: { alignItems: "center" },
  waitingSeat: { flexShrink: 1, maxWidth: "100%" },
  waitingPlaque: { minWidth: 0, maxWidth: "100%", flexShrink: 1 },
  plaque: {
    position: "relative",
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    borderColor: colors.gold,
    borderWidth: 1.2,
    borderRadius: 18,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
    minWidth: 110,
    maxWidth: 155,
    borderBottomColor: colors.goldDark,
    borderBottomWidth: 2,
    boxShadow: "0 5px 10px rgba(0,0,0,0.45)",
  },
  selfPlaque: { minWidth: 136, paddingVertical: 5, paddingRight: 15, borderRadius: 22 },
  compactPlaque: { minWidth: 100, paddingVertical: 3, paddingRight: 9 },
  activePlaque: { borderColor: colors.gold, boxShadow: "0 0 14px rgba(244,206,120,0.2)" },
  avatar: {
    borderWidth: 2,
    borderColor: "#f0ca70",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  playerDetails: { flexShrink: 1, gap: 1 },
  playerName: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, maxWidth: 72 },
  playerCount: { flexDirection: "row", alignItems: "center", gap: 6 },
  turnBadgePosition: { position: "absolute", top: -11, left: 0, right: 0, alignItems: "center" },
  turnBadge: {
    backgroundColor: "#e9be66",
    color: "#172012",
    borderColor: "#f1d58a",
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 8,
    paddingHorizontal: 7,
    lineHeight: 14,
    fontFamily: fonts.strong,
  },
  topSeat: { position: "absolute", top: 12, alignSelf: "center", zIndex: 3 },
  leftSeat: { position: "absolute", left: 18, top: "29%", zIndex: 3 },
  rightSeat: { position: "absolute", right: 18, top: "29%", zIndex: 3 },
  bottomSeat: { position: "absolute", alignSelf: "center", bottom: 14, zIndex: 20 },
  center: {
    position: "absolute",
    alignItems: "center",
    alignSelf: "center",
    width: "65%",
    zIndex: 25,
  },
  waitingScroll: { flex: 1 },
  loading: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 16 },
  waiting: { flexGrow: 1, paddingHorizontal: 12, paddingVertical: 14, gap: 12 },
  shortWaiting: { paddingVertical: 8, gap: 8 },
  waitingSeatRow: { alignItems: "center" },
  waitingSideSeats: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  waitingSideSeat: { flex: 1, minWidth: 0, alignItems: "flex-start" },
  waitingSpacer: { flexGrow: 3, minHeight: 12 },
  waitingBottomSpacer: { flexGrow: 1, minHeight: 12 },
  waitingPrompt: {
    alignSelf: "center",
    width: "65%",
    maxWidth: 340,
    padding: 12,
    gap: 8,
    alignItems: "center",
    borderColor: "#a9bd7c1f",
    borderWidth: 1,
    borderRadius: 11,
    backgroundColor: "#001c0e18",
  },
  smallButton: {
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#c5a461",
  },
  smallButtonText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  centerText: { textAlign: "center", fontSize: 13, lineHeight: 20, color: "#c1cba8" },
  turnText: {
    fontFamily: fonts.strong,
    fontSize: 9,
    letterSpacing: 1.1,
    color: "#d5c38b",
    textAlign: "center",
    lineHeight: 14,
  },
  prompt: {
    position: "absolute",
    alignSelf: "center",
    alignItems: "center",
    borderColor: "#a9bd7c1f",
    borderWidth: 1,
    padding: 8,
    borderRadius: 12,
    gap: 4,
    backgroundColor: "#001c0e18",
  },
  hand: { position: "absolute", bottom: 52, alignSelf: "center", zIndex: 5 },
  controls: { width: "100%", maxWidth: 760, paddingHorizontal: 12, paddingTop: 12, gap: 8 },
  spectatorStatus: { position: "absolute", top: 12, left: 12, right: 12 },
  notice: {
    position: "absolute",
    top: 62,
    left: 16,
    right: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.gold,
    zIndex: 40,
  },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1, minHeight: 49, borderRadius: 20, boxShadow: "0 5px 10px rgba(0,0,0,0.45)" },
  actionText: { fontFamily: fonts.strong, fontSize: 20 },
  hint: {
    alignSelf: "center",
    borderWidth: 0,
    borderBottomWidth: 0,
    backgroundColor: "transparent",
    minHeight: 22,
    paddingVertical: 0,
    opacity: 0.65,
  },
  handoff: {
    backgroundColor: "#071b10",
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.gold,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  finish: {
    position: "absolute",
    alignSelf: "center",
    top: "28%",
    gap: 12,
    alignItems: "center",
    backgroundColor: "#071b10",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.gold,
  },
});
