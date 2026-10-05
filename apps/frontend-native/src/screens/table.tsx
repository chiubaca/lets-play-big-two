import { useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Image,
  Modal,
  ScrollView,
  Platform,
  Share,
  StyleSheet,
  Switch,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { Menu, Settings, CircleHelp, Smartphone } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { getCardKey, getCardRank, SUITS, sortCards, detectHandType } from "@big-two/game-core";
import { getLegalPlays } from "@big-two/game-ai";
import type {
  BigTwoGameMachineSnapshot,
  GameEvent,
  RoomGameState,
  Player,
} from "@big-two/game-state-machine";
import { CasinoScreen, Label, Button, ErrorMessage, Sheet, styles as ui } from "../ui/primitives";
import { Hand, PlayingCard, CardBacks } from "../ui/cards";
import { artwork, colors, fonts } from "../ui/theme";
import { RulesSheet } from "./rules";
import { tableSeats } from "../table-seats";

type TableProps = {
  snapshot: BigTwoGameMachineSnapshot | RoomGameState;
  userId: string;
  userName?: string;
  userEmoji?: string | null;
  mode: "solo" | "pass-and-play" | "online";
  hidden?: boolean;
  roomId?: string;
  connected?: boolean;
  error?: string | null;
  send: (event: GameEvent) => void | Promise<void>;
  onHome: () => void;
  onRedeal?: () => void;
  onChat?: () => void;
  chatUnread?: number;
  onReveal?: () => void;
};

function Seat({
  player,
  count,
  active,
  self = false,
}: {
  player?: Player;
  count: number;
  active: boolean;
  self?: boolean;
}) {
  return (
    <View
      accessible
      accessibilityLabel={
        player ? `${player.name}, ${count} cards${active ? ", current turn" : ""}` : "Open seat"
      }
      style={table.seat}
    >
      <View style={[table.plaque, active && table.activePlaque]}>
        <Label style={table.avatar}>
          {player?.isBot ? "🤖" : (player?.emoji ?? (player ? "♠️" : "＋"))}
        </Label>
        <View style={{ flexShrink: 1 }}>
          <Label
            numberOfLines={1}
            style={{ fontFamily: fonts.strong, fontSize: 12, lineHeight: 17 }}
          >
            {player?.name ?? "Open seat"}
          </Label>
          <Label style={{ fontSize: 11, color: colors.muted }}>♦ {count}</Label>
        </View>
        {active && self && <Label style={table.turnBadge}>Your turn</Label>}
      </View>
      {!self && <CardBacks count={count} />}
    </View>
  );
}

export function TableScreen({
  snapshot,
  userId,
  userName = "Player",
  userEmoji,
  mode,
  hidden = false,
  roomId,
  connected = true,
  error,
  send,
  onHome,
  onRedeal,
  onChat,
  chatUnread = 0,
  onReveal,
}: TableProps) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const width = window.width - insets.left - insets.right;
  const height = window.height - insets.top - insets.bottom;
  const compact = height < 550;
  const requestedBoardWidth = Math.min(width - 16, compact ? width * 0.69 : 760);
  const [measuredBoardWidth, setMeasuredBoardWidth] = useState(0);
  const boardWidth = measuredBoardWidth || requestedBoardWidth;
  const context = snapshot.context;
  const current = context.players[context.currentPlayerIndex];
  const you = context.players.find((player) => player.id === userId);
  const spectator = mode === "online" && !you;
  const isHost = context.players.find((player) => !player.isBot)?.id === userId;
  const waiting = snapshot.value === "WAITING_FOR_PLAYERS";
  const finished = snapshot.value === "GAME_END";
  const yourTurn = !hidden && !spectator && !finished && !waiting && current?.id === userId;
  const [selected, setSelected] = useState<string[]>([]);
  const [sortSuit, setSortSuit] = useState(false);
  const [panel, setPanel] = useState<"menu" | "help" | "settings" | "results" | "cards" | null>(
    null,
  );
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [removeBot, setRemoveBot] = useState<Player | null>(null);
  const [busy, setBusy] = useState(false);
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
    "handCounts" in snapshot
      ? snapshot.handCounts
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
    if (busy) return false;
    setBusy(true);
    setMessage(null);
    try {
      await send(event);
      setSelected([]);
      return true;
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Could not update the table.");
      return false;
    } finally {
      setBusy(false);
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
  const seat = (player?: Player, self = false) => (
    <Seat
      player={player}
      count={count(player)}
      active={!waiting && !finished && current?.id === player?.id}
      self={self}
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
        <View style={[table.header, compact && { minHeight: 49 }]}>
          <Button
            title="☰"
            icon={<Menu color={colors.gold} size={24} />}
            accessibilityLabel="Table menu"
            onPress={() => setPanel("menu")}
            style={table.iconButton}
          />
          {roomId && (
            <View style={{ alignItems: "center", flex: 1 }}>
              <Label mono>ROOM CODE</Label>
              <Button
                title={roomId}
                onPress={() =>
                  void shareRoom().catch(() => setMessage("Could not share this room."))
                }
                style={{ borderRadius: 10, minHeight: 40, paddingVertical: 5 }}
              />
            </View>
          )}
          {!roomId && <View style={{ flex: 1 }} />}
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
        {mode === "online" && (
          <View style={[ui.row, { justifyContent: "center", minHeight: 30 }]}>
            <Label mono>{connected ? "● LIVE TABLE" : "RECONNECTING…"}</Label>
            {onChat && (
              <Button
                title={chatUnread ? `Room chat · ${chatUnread}` : "Room chat"}
                onPress={onChat}
                style={{ minHeight: 30, paddingVertical: 3, borderRadius: 10 }}
              />
            )}
          </View>
        )}
        <View style={[table.playArea, compact && { flexDirection: "row" }]}>
          <View
            onLayout={({ nativeEvent }) => setMeasuredBoardWidth(nativeEvent.layout.width)}
            style={[
              table.board,
              { width: requestedBoardWidth },
              compact && { marginTop: 0, alignSelf: "stretch" },
            ]}
          >
            <View pointerEvents="none" style={[table.shell, compact && { top: 0, transform: [] }]}>
              <LinearGradient colors={["#123d28", "#075333", "#002b17"]} style={table.felt}>
                <View style={table.innerRim} />
                <View style={table.tableMark}>
                  <Label style={{ color: "rgba(241,201,106,0.11)", fontSize: 70, lineHeight: 85 }}>
                    ♠
                  </Label>
                  <Label mono style={{ color: "rgba(241,201,106,0.12)", textAlign: "center" }}>
                    BIG PLAYS{`\n`}BIGGER FRIENDSHIPS
                  </Label>
                </View>
              </LinearGradient>
            </View>
            <View style={[table.topSeat, compact && { top: 0 }]}>{seat(seats.top)}</View>
            <View style={[table.leftSeat, compact && { top: "16%" }]}>{seat(seats.left)}</View>
            <View style={[table.rightSeat, compact && { top: "16%" }]}>{seat(seats.right)}</View>
            <View
              style={[
                table.center,
                waiting ? { top: "20%", bottom: "16%" } : { top: compact ? "28%" : "34%" },
              ]}
            >
              {waiting ? (
                <ScrollView
                  style={{ width: "100%", flex: 1 }}
                  contentContainerStyle={table.waiting}
                >
                  <Label heading style={{ fontSize: 20, textAlign: "center" }}>
                    Waiting for players
                  </Label>
                  <Label style={table.centerText}>{context.players.length} of 4 seats filled</Label>
                  {spectator && context.players.length < 4 && (
                    <Button
                      title="Join Table"
                      gold
                      busy={busy}
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
                      <Button
                        title="Fill with bots"
                        disabled={context.players.length >= 4}
                        busy={busy}
                        onPress={() => void act({ type: "FILL_WITH_BOTS" })}
                      />
                      <Button
                        title="Deal Cards"
                        gold
                        disabled={context.players.length < 2}
                        busy={busy}
                        onPress={() => void act({ type: "START_GAME" })}
                      />
                    </>
                  )}
                  {!isHost && !spectator && (
                    <Label style={table.centerText}>Waiting for the host to deal.</Label>
                  )}
                  {"spectatorCount" in snapshot && mode === "online" && (
                    <Label mono>{snapshot.spectatorCount} watching</Label>
                  )}
                </ScrollView>
              ) : (
                <>
                  {!compact && (
                    <Label mono style={{ fontSize: 8 }}>
                      CARDS TO BEAT
                    </Label>
                  )}
                  <View style={[ui.row, { gap: 0, justifyContent: "center", marginTop: 5 }]}>
                    {pile.map((card, index) => (
                      <View
                        key={getCardKey(card)}
                        style={{
                          marginLeft: index ? -8 : 0,
                          transform: [{ rotate: `${(index - (pile.length - 1) / 2) * 4}deg` }],
                        }}
                      >
                        <PlayingCard
                          card={card}
                          width={compact ? 44 : Math.min(64, boardWidth * 0.12)}
                        />
                      </View>
                    ))}
                  </View>
                  {compact && (
                    <Label mono style={{ fontSize: 8, lineHeight: 12, marginTop: 4 }}>
                      CARDS TO BEAT
                    </Label>
                  )}
                </>
              )}
            </View>
            {!compact && !waiting && !finished && (
              <View
                style={[
                  table.prompt,
                  { bottom: compact ? "35%" : "33%", maxWidth: boardWidth * 0.57 },
                ]}
              >
                <Label mono style={{ fontSize: 9, color: colors.gold }}>
                  {spectator
                    ? "WATCHING THE TABLE"
                    : yourTurn
                      ? "YOUR TURN"
                      : current?.isBot
                        ? "THINKING…"
                        : `${current?.name ?? "Player"}'S TURN`}
                </Label>
                <Label style={table.centerText}>
                  {context.guardMessage ??
                    (snapshot.value === "ROUND_FIRST_MOVE"
                      ? "First move must include 3♦"
                      : snapshot.value === "PLAY_NEW_ROUND"
                        ? "You lead. Play a card or combination"
                        : yourTurn
                          ? "Play a card or a valid combination"
                          : "Waiting for the next play")}
                </Label>
              </View>
            )}
            {!waiting && !spectator && (
              <View style={[table.hand, compact && { bottom: 38 }]}>
                <Hand
                  cards={hand}
                  width={boardWidth}
                  compact={compact}
                  selected={selected}
                  disabled={!yourTurn || busy}
                  onToggle={(card) => {
                    if (!yourTurn || busy) return;
                    if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => undefined);
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
          </View>
          <View
            style={[table.controls, compact && { width: width * 0.25, justifyContent: "center" }]}
          >
            <ErrorMessage
              message={message ?? error ?? ("roomNotice" in snapshot ? snapshot.roomNotice : null)}
            />
            {compact && !waiting && !finished && (
              <Label style={table.centerText}>
                {context.guardMessage ??
                  (yourTurn
                    ? snapshot.value === "ROUND_FIRST_MOVE"
                      ? "Your turn · include 3♦"
                      : "Your turn · choose your cards"
                    : `${current?.name ?? "Player"}'s turn`)}
              </Label>
            )}
            {!spectator && !waiting && !finished && (
              <View style={[table.actions, compact && { flexDirection: "column" }]}>
                <Button
                  title="Pass"
                  disabled={!yourTurn || !activeRound || !connected || busy}
                  onPress={() => void act({ type: "PASS_TURN", playerId: userId })}
                  style={table.action}
                />
                <Button
                  title="Sort"
                  disabled={hidden || busy}
                  onPress={() => setSortSuit((value) => !value)}
                  style={table.action}
                />
                <Button
                  title="Play"
                  gold
                  disabled={!yourTurn || !connected || busy || !detectHandType(selectedCards)}
                  onPress={() => void play()}
                  style={table.action}
                />
              </View>
            )}
            {mode === "solo" && !finished && (
              <Button
                title="Need a hint?"
                ghost
                labelStyle={{ fontFamily: fonts.body, fontSize: 9 }}
                disabled={!yourTurn}
                onPress={() => {
                  if (legal[0]) setSelected(legal[0].map(getCardKey));
                  else setMessage("No beating move. You can pass.");
                }}
                style={table.hint}
              />
            )}
            {spectator && <Label style={table.centerText}>You are watching as a spectator.</Label>}
          </View>
        </View>
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
                {(mode !== "online" || isHost) && (
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
            {mode === "online" && (
              <Label style={{ color: colors.muted }}>
                Native turn notifications are not available in this build. Web notification
                preferences are unchanged.
              </Label>
            )}
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
  page: { flex: 1, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
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
  },
  playArea: { flex: 1, alignItems: "center", gap: 8 },
  board: {
    flex: 1,
    marginTop: 58,
    padding: 6,
  },
  shell: {
    ...StyleSheet.absoluteFillObject,
    top: -40,
    borderTopLeftRadius: 66,
    borderTopRightRadius: 66,
    borderBottomLeftRadius: 37,
    borderBottomRightRadius: 37,
    borderWidth: 3,
    borderColor: colors.goldDark,
    backgroundColor: "#211b10",
    borderBottomWidth: 6,
    transform: [{ perspective: 1350 }, { rotateX: "25deg" }],
  },
  felt: {
    ...StyleSheet.absoluteFillObject,
    margin: 6,
    borderTopLeftRadius: 55,
    borderTopRightRadius: 55,
    borderBottomLeftRadius: 29,
    borderBottomRightRadius: 29,
    borderWidth: 1.5,
    borderColor: colors.gold,
    overflow: "hidden",
  },
  innerRim: {
    ...StyleSheet.absoluteFillObject,
    margin: 5,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: "rgba(241,201,106,0.25)",
  },
  tableMark: { position: "absolute", top: "25%", alignSelf: "center", alignItems: "center" },
  seat: { alignItems: "center" },
  plaque: {
    position: "relative",
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: "#000d06",
    borderColor: colors.gold,
    borderWidth: 1.2,
    borderRadius: 18,
    paddingHorizontal: 7,
    paddingVertical: 4,
    minWidth: 85,
    maxWidth: 145,
    borderBottomColor: colors.goldDark,
    borderBottomWidth: 3,
  },
  activePlaque: { borderColor: colors.gold, boxShadow: "0 0 8px rgba(244,206,120,0.5)" },
  avatar: {
    fontSize: 25,
    lineHeight: 34,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 20,
    width: 34,
    height: 34,
    textAlign: "center",
  },
  turnBadge: {
    position: "absolute",
    top: -13,
    alignSelf: "center",
    backgroundColor: colors.gold,
    color: "#172012",
    borderRadius: 10,
    fontSize: 9,
    paddingHorizontal: 7,
    lineHeight: 17,
    fontFamily: fonts.strong,
    left: 15,
  },
  topSeat: { position: "absolute", top: 4, alignSelf: "center" },
  leftSeat: { position: "absolute", left: 3, top: "29%" },
  rightSeat: { position: "absolute", right: 3, top: "29%" },
  bottomSeat: { position: "absolute", alignSelf: "center", bottom: 6 },
  center: { position: "absolute", alignItems: "center", alignSelf: "center", width: "65%" },
  waiting: { width: "100%", gap: 8, alignItems: "stretch", marginTop: -15 },
  centerText: { textAlign: "center", fontSize: 12, lineHeight: 19, color: colors.muted },
  prompt: {
    position: "absolute",
    alignSelf: "center",
    alignItems: "center",
    borderColor: "rgba(241,201,106,0.15)",
    borderWidth: 1,
    padding: 10,
    borderRadius: 12,
    gap: 6,
    backgroundColor: "rgba(0,25,13,0.3)",
  },
  hand: { position: "absolute", bottom: 52, alignSelf: "center" },
  controls: { width: "100%", maxWidth: 760, paddingHorizontal: 12, gap: 5 },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1, minHeight: 49, borderRadius: 20 },
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
