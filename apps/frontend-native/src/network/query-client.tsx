import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession, type NativeUser } from "./auth-client";
import { BACKEND_URL } from "./config";

export function createNativeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      // Online writes fail immediately rather than replaying a stale turn or consent.
      mutations: { retry: false, networkMode: "always", gcTime: 0 },
    },
  });
}

type PrivateScope = readonly ["native", string, "private", string | undefined, number];
interface QueryAccess {
  scope: PrivateScope;
  user: NativeUser | undefined;
  sessionId: string | undefined;
  authenticated: boolean;
  isCurrent: () => boolean;
  assertCurrent: () => void;
}
const AccessContext = createContext<QueryAccess | null>(null);

export const queryKeys = {
  rooms: (scope: PrivateScope) => [...scope, "rooms"] as const,
  room: (scope: PrivateScope, roomId: string) => [...scope, "room", roomId] as const,
  chat: (scope: PrivateScope, roomId: string) => [...scope, "chat", roomId] as const,
  turnPreference: (scope: PrivateScope) => [...scope, "turn-notifications", "preference"] as const,
  turnDevice: (scope: PrivateScope, sessionId: string | undefined) =>
    [...scope, "turn-notifications", "device", sessionId] as const,
};

export function NativeQueryProvider({
  children,
  client: suppliedClient,
}: {
  children: ReactNode;
  client?: QueryClient;
}) {
  const [client] = useState(() => suppliedClient ?? createNativeQueryClient());
  const { data: session, isPending } = useSession();
  const viewerId = session?.user.id;
  const authenticated = !!viewerId && !isPending;
  const [visit, setVisit] = useState({ viewerId, generation: 0 });
  if (visit.viewerId !== viewerId) setVisit({ viewerId, generation: visit.generation + 1 });
  const scope = useMemo<PrivateScope>(
    () => ["native", BACKEND_URL, "private", viewerId, visit.generation],
    [viewerId, visit.generation],
  );
  const current = useRef({ viewerId, generation: visit.generation, authenticated });
  current.current = { viewerId, generation: visit.generation, authenticated };
  const isCurrent = useCallback(
    () =>
      !!viewerId &&
      current.current.viewerId === viewerId &&
      current.current.generation === visit.generation &&
      current.current.authenticated,
    [viewerId, visit.generation],
  );
  const assertCurrent = useCallback(() => {
    if (
      !viewerId ||
      current.current.viewerId !== viewerId ||
      current.current.generation !== visit.generation
    )
      throw new Error("Your session changed. Sign in and try again.");
    if (!current.current.authenticated) throw new Error("Wait for your session to be confirmed");
    if (!onlineManager.isOnline()) throw new Error("You’re offline. Reconnect and try again.");
  }, [viewerId, visit.generation]);
  const previous = useRef(scope);
  useEffect(() => {
    if (previous.current !== scope) {
      const old = previous.current;
      previous.current = scope;
      void client.cancelQueries({ queryKey: old });
      client.removeQueries({ queryKey: old });
      client.getMutationCache().clear();
    }
    if (!authenticated) void client.cancelQueries({ queryKey: scope });
  }, [client, scope, authenticated]);
  const access = useMemo(
    () => ({
      scope,
      user: session?.user,
      sessionId: session?.session?.id,
      authenticated,
      isCurrent,
      assertCurrent,
    }),
    [scope, session?.user, session?.session?.id, authenticated, isCurrent, assertCurrent],
  );
  return (
    <QueryClientProvider client={client}>
      <AccessContext.Provider value={access}>{children}</AccessContext.Provider>
    </QueryClientProvider>
  );
}

export function useQueryAccess() {
  const access = useContext(AccessContext);
  if (!access) throw new Error("Native network hooks require NativeQueryProvider");
  return access;
}
