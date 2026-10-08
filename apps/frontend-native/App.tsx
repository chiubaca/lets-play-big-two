import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, BackHandler, Platform, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSession, useOnlineRoom, type NativeSession } from "./src/network";
import { useOfflineGame, LOCAL_HUMAN_ID, type OfflineGameConfig } from "./src/game";
import { HomeScreen } from "./src/screens/home";
import { AuthSheet } from "./src/screens/auth";
import { ProfileScreen } from "./src/screens/profile";
import { PassSetupScreen } from "./src/screens/pass-setup";
import { TableScreen } from "./src/screens/table";
import { ChatScreen } from "./src/screens/chat";
import { Button, CasinoScreen, ErrorMessage, Label, Panel, Sheet } from "./src/ui/primitives";
import { colors } from "./src/ui/theme";
import { routeFromURL, type NativeRoute } from "./src/navigation";
import { getStorageKey } from "./src/game/game-persistence";
import { useTurnNotifications } from "./src/notifications/use-turn-notifications";
import { TurnNotificationSettings } from "./src/notifications/turn-settings";
import type { TurnDevice } from "./src/notifications/turn-device";

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
const PASS_CONFIG_KEY = "big-two-native-pass-config-v1";

function LoadingScreen({
  error,
  onHome,
  onRetry,
}: {
  error?: string | null;
  onHome?: () => void;
  onRetry?: () => void;
}) {
  return (
    <CasinoScreen>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Panel>
          <Label heading>{error ? "Couldn’t open the table" : "Taking your seat…"}</Label>
          {!error && <ActivityIndicator color={colors.gold} />}
          <ErrorMessage message={error} />
          {onRetry && <Button title="Retry" gold onPress={onRetry} />}
          {onHome && <Button title="Return to lobby" onPress={onHome} />}
        </Panel>
      </View>
    </CasinoScreen>
  );
}

function LocalTable({
  mode,
  config,
  newDeal,
  onHome,
}: {
  mode: "solo" | "pass-and-play";
  config?: OfflineGameConfig;
  newDeal?: boolean;
  onHome: () => void;
}) {
  const game = useOfflineGame(mode, config);
  const started = useRef(false);
  useEffect(() => {
    if (game.ready && newDeal && !started.current) {
      started.current = true;
      game.redeal();
    }
  }, [game.ready, game.redeal, newDeal]);
  const ready = game.ready && !!game.snapshot;
  const current = game.snapshot?.context.players[game.snapshot.context.currentPlayerIndex];
  const userId =
    mode === "solo"
      ? LOCAL_HUMAN_ID
      : (game.visiblePlayerId ?? game.handoffPlayerId ?? current?.id ?? "local-1");
  const snapshot =
    ready && game.snapshot
      ? { ...game.snapshot, handCounts: game.handCounts, spectatorCount: 0 }
      : undefined;
  return (
    <TableScreen
      snapshot={snapshot}
      userId={userId}
      mode={mode}
      hidden={!game.visiblePlayerId}
      error={game.error}
      send={game.send}
      onHome={onHome}
      onRedeal={game.redeal}
      onReveal={game.handoffPlayerId ? game.revealHand : undefined}
    />
  );
}

function OnlineTable({
  roomId,
  session,
  onHome,
  pending,
  onSignIn,
  notificationDevice,
}: {
  roomId: string;
  session: NativeSession | null;
  onHome: () => void;
  pending: boolean;
  onSignIn: () => void;
  notificationDevice: TurnDevice | null;
}) {
  const room = useOnlineRoom({ roomId });
  const [chatOpen, setChatOpen] = useState(false);
  const [lastReadOrder, setLastReadOrder] = useState<number | null>(null);
  useEffect(() => {
    setChatOpen(false);
    setLastReadOrder(null);
  }, [session?.user.id]);
  useEffect(() => {
    if (
      chatOpen ||
      (lastReadOrder === null && !room.chat.loading && room.chat.connection === "connected")
    )
      setLastReadOrder(room.chat.messages.at(-1)?.order ?? 0);
  }, [chatOpen, lastReadOrder, room.chat.loading, room.chat.connection, room.chat.messages]);
  return (
    <>
      <TableScreen
        snapshot={session ? room.gameState : undefined}
        userId={session?.user.id ?? ""}
        userName={session?.user.displayUsername ?? session?.user.username ?? session?.user.name}
        userEmoji={session?.user.emoji}
        mode="online"
        roomId={roomId}
        connected={room.connection === "connected"}
        error={session ? room.error?.message : undefined}
        send={room.send}
        onHome={onHome}
        onRetry={() => void room.refresh()}
        onSignIn={!session && !pending ? onSignIn : undefined}
        onChat={session ? () => setChatOpen(true) : undefined}
        notificationSettings={
          notificationDevice ? (
            <TurnNotificationSettings key={session?.user.id} device={notificationDevice} />
          ) : (
            <Label>
              {pending
                ? "Checking your session…"
                : session
                  ? "Use a native development or release build for turn notifications."
                  : "Sign in to manage turn notifications."}
            </Label>
          )
        }
        chatUnread={
          lastReadOrder === null
            ? 0
            : room.chat.messages.filter((message) => message.order > lastReadOrder).length
        }
      />
      <ChatScreen
        key={session?.user.id ?? "signed-out"}
        visible={chatOpen && !!session}
        roomId={roomId}
        chat={room.chat}
        onClose={() => setChatOpen(false)}
      />
    </>
  );
}

export function GameApp() {
  const { data: session, isPending } = useSession();
  const [route, setRoute] = useState<NativeRoute>({ name: "home" });
  const [authOpen, setAuthOpen] = useState(false);
  const [passConfig, setPassConfig] = useState<OfflineGameConfig>();
  const [passConfigReady, setPassConfigReady] = useState(false);
  const [passSaveCheckedRoute, setPassSaveCheckedRoute] = useState<string | null>(null);
  const [newPassDeal, setNewPassDeal] = useState(false);
  const [canResumePass, setCanResumePass] = useState(false);
  const [welcome, setWelcome] = useState<string | null>(null);
  const welcomedUser = useRef<string | undefined>(undefined);
  const openNotificationRoom = useCallback((roomId: string) => {
    setAuthOpen(false);
    setRoute({ name: "room", roomId });
  }, []);
  const notifications = useTurnNotifications(
    session,
    isPending,
    route.name === "room" ? route.roomId : undefined,
    openNotificationRoom,
  );
  const home = useCallback(() => {
    setAuthOpen(false);
    setRoute({ name: "home" });
  }, []);
  useEffect(() => {
    const handle = (url: string | null) => {
      const next = url && routeFromURL(url);
      if (next) setRoute(next);
    };
    void Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    let mounted = true;
    void AsyncStorage.getItem(getStorageKey("pass-and-play"))
      .then((saved) => {
        if (mounted) setCanResumePass(!!saved);
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setPassSaveCheckedRoute(route.name);
      });
    return () => {
      mounted = false;
    };
  }, [route.name]);
  useEffect(() => {
    if (route.name === "room" && !isPending && !session) setAuthOpen(true);
    if (!session) welcomedUser.current = undefined;
  }, [route.name, isPending, session]);
  useEffect(() => {
    if (!welcome) return;
    const timer = setTimeout(() => setWelcome(null), 3500);
    return () => clearTimeout(timer);
  }, [welcome]);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (authOpen) {
        setAuthOpen(false);
        return true;
      }
      if (route.name !== "home") {
        home();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [route.name, authOpen, home]);
  useEffect(() => {
    void AsyncStorage.getItem(PASS_CONFIG_KEY)
      .then((saved) => {
        if (!saved) return;
        try {
          const config = JSON.parse(saved) as OfflineGameConfig;
          if (
            Array.isArray(config.players) &&
            config.players.length >= 2 &&
            config.players.length <= 4 &&
            config.players.every(
              (player) => typeof player.name === "string" && typeof player.isBot === "boolean",
            )
          )
            setPassConfig(config);
        } catch {
          /* A corrupt setup is replaced when a new table is started. */
        }
      })
      .catch(() => undefined)
      .finally(() => setPassConfigReady(true));
  }, []);

  let screen: ReactNode;
  if (route.name === "solo") screen = <LocalTable mode="solo" onHome={home} />;
  else if (route.name === "pass-and-play")
    screen = (
      <LocalTable mode="pass-and-play" config={passConfig} newDeal={newPassDeal} onHome={home} />
    );
  else if (route.name === "pass-setup" && passConfigReady && passSaveCheckedRoute === route.name)
    screen = (
      <PassSetupScreen
        onHome={home}
        initialConfig={passConfig}
        onResume={
          canResumePass && passConfig
            ? () => {
                setNewPassDeal(false);
                setRoute({ name: "pass-and-play" });
              }
            : undefined
        }
        onStart={(config) => {
          setPassConfig(config);
          setNewPassDeal(true);
          void AsyncStorage.setItem(PASS_CONFIG_KEY, JSON.stringify(config)).catch(() => undefined);
          setRoute({ name: "pass-and-play" });
        }}
      />
    );
  else if (route.name === "profile" && session)
    screen = (
      <ProfileScreen
        key={session.user.id}
        session={session}
        onHome={home}
        initialEditor={route.editor}
      />
    );
  else if (route.name === "room")
    screen = (
      <OnlineTable
        key={route.roomId}
        roomId={route.roomId}
        session={session}
        onHome={home}
        pending={isPending}
        onSignIn={() => setAuthOpen(true)}
        notificationDevice={notifications.device}
      />
    );
  else
    screen = (
      <HomeScreen
        session={session}
        pending={isPending}
        onSolo={() => setRoute({ name: "solo" })}
        onPassSetup={() => setRoute({ name: "pass-setup" })}
        onRoom={(roomId) => setRoute({ name: "room", roomId })}
        onProfile={() => setRoute({ name: "profile" })}
        onDeleteAccount={() => setRoute({ name: "profile", editor: "delete" })}
        onAuth={() => setAuthOpen(true)}
      />
    );

  return (
    <>
      <View
        style={{ flex: 1 }}
        accessibilityElementsHidden={
          route.name === "pass-setup" && (!passConfigReady || passSaveCheckedRoute !== route.name)
        }
        importantForAccessibility={
          route.name === "pass-setup" && (!passConfigReady || passSaveCheckedRoute !== route.name)
            ? "no-hide-descendants"
            : "auto"
        }
      >
        {screen}
      </View>
      {route.name === "pass-setup" && (!passConfigReady || passSaveCheckedRoute !== route.name) && (
        <View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "rgba(0,5,2,0.6)",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
          accessibilityViewIsModal
        >
          <ActivityIndicator color={colors.gold} />
          <Label accessibilityLiveRegion="polite">Loading saved setup…</Label>
        </View>
      )}
      {welcome && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 35,
            alignSelf: "center",
            padding: 12,
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.gold,
            borderRadius: 16,
          }}
        >
          <Label accessibilityLiveRegion="polite">{welcome}</Label>
        </View>
      )}
      <AuthSheet
        visible={authOpen}
        callbackURL={route.name === "room" ? `bigtwocrew://room/${route.roomId}` : undefined}
        onClose={() => {
          if (route.name === "room" && !session) home();
          else setAuthOpen(false);
        }}
        onSuccess={(user) => {
          setAuthOpen(false);
          if (!user.id || welcomedUser.current !== user.id) {
            welcomedUser.current = user.id;
            setWelcome(`Welcome back, ${user.displayName || "friend"}!`);
          }
        }}
      />
      <Sheet
        visible={notifications.returning && !authOpen}
        title="Open your table"
        onClose={notifications.close}
      >
        <Label>
          {isPending
            ? "Checking your session…"
            : !session
              ? "Sign in with the account that received this notification."
              : notifications.error
                ? "Could not open this notification."
                : "Verifying your notification…"}
        </Label>
        <ErrorMessage message={notifications.error} />
        {!session && !isPending && (
          <Button title="Sign in" gold onPress={() => setAuthOpen(true)} />
        )}
        {notifications.error && session && (
          <Button title="Try again" onPress={notifications.retry} />
        )}
        <Button
          title="Return to lobby"
          onPress={() => {
            notifications.close();
            home();
          }}
        />
      </Sheet>
    </>
  );
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <LoadingScreen
        error="The app couldn’t continue. Your saved game is safe."
        onRetry={() => this.setState({ error: false })}
      />
    ) : (
      this.props.children
    );
  }
}

export default function App() {
  const [loaded, error] = useFonts({
    Inter: require("./assets/fonts/Inter_400Regular.ttf"),
    InterSemiBold: require("./assets/fonts/Inter_600SemiBold.ttf"),
    Fraunces: require("./assets/fonts/Fraunces_600SemiBold.ttf"),
    IBMPlexMono: require("./assets/fonts/IBMPlexMono-Regular.ttf"),
  });
  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AppErrorBoundary>
        {loaded || error ? (
          <GameApp />
        ) : (
          <View
            style={{
              flex: 1,
              backgroundColor: colors.background,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ActivityIndicator color={colors.gold} />
          </View>
        )}
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
