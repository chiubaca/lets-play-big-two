# React Query opportunities in the native app

## Implementation and verification

Implemented on 9–10 October 2026, one slice at a time:

- Stable native provider, backend/account/visit-scoped keys, AppState/connectivity
  integration, and private-cache cleanup.
- Lobby and room snapshot queries; create/join/leave and game/Host mutations.
  WebSockets still supply authoritative snapshots, with cancellation protecting
  them from older HTTP responses.
- Profile update/deletion mutations. Better Auth still owns sessions and cookies.
- Separate account-preference/device-inspection queries and notification-write
  mutations. Consent orchestration remains in `TurnDevice`; token refresh now
  invalidates device inspection, including uncertain retirement outcomes.
- Infinite chat history, older-message pagination, and send mutations. Reconnect
  rebuilds history and catches up every missed page; live frames, redactions,
  server page boundaries, and explicit retry IDs remain protected. Late send
  responses cannot publish into a later room visit or repopulate an unmounted
  screen's private cache.

No private cache or mutations are persisted. Time-sensitive writes fail offline
without automatic retries or replay. Offline game authority, focus heartbeats,
notification eligibility/tap verification, and authentication initiation remain
outside Query.

Android UI checks used Expo MCP after each slice: sign-in/account replacement,
lobby/create, spectator/join/leave, Host controls/deal/play, profile emoji save
and restoration, deletion confirmation, notification Off/On/enroll/remove,
50-message chat pagination plus older history, native sending, and Solo play
with Wi-Fi/mobile data disabled. Multiplayer checks used the supplied accounts
with one native client and an authenticated peer through the local API. Profile
and notification settings were restored, and connectivity was re-enabled.
Neither account was deleted. The isolated test room retains its test chat history.

Verification limits: iOS and end-to-end push delivery were not exercised;
deletion success/failure, late responses, redaction races, pending sessions,
and no-replay policies are covered by automated tests rather than destructive
live checks. A supplemental offline-send UI check was blocked by the development
client trying to reload its Metro bundle without network connectivity; its
no-replay policy is covered by the hook tests. Connectivity was restored.

The local backend also returned HTTP 500 from sign-in independently of the app.
With permission, Wrangler's watched configuration was reloaded without changing
its contents or stopping Metro/the tunnel. Direct and native sign-in succeeded
afterward, as did room reopening, notification inspection, chat history, and a
final native send check. No frontend auth workaround was introduced.

The lockfile regeneration pruned duplicate peer snapshots and normalized peer
resolutions; existing package-version/integrity entries are unchanged. A frozen
`vp install --frozen-lockfile` succeeded. `vp check`, `vp test --run`, and
`vp run frontend-native#check` pass.

## Codebase audit

Audited on 9 October 2026. Scope: runtime data flows in
`apps/frontend-native`, including rooms, chat, Better Auth, notifications, and
local persistence. The assessment below records the pre-migration state.

Before the migration, the native app did not declare React Query or mount a
`QueryClientProvider` ([package manifest](../apps/frontend-native/package.json),
[app root](../apps/frontend-native/App.tsx)). The web app already uses it for
the lobby, room snapshots, profile updates, and account deletion, and writes
WebSocket snapshots into its query cache. Those are useful precedents, not
drop-in native implementations: native cookies, lifecycle handling, and private
state safeguards must remain intact.

### Recommended areas

| Area                                                    | Current implementation                                                                                                                                                                | React Query opportunity                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lobby / Your tables                                     | [`use-rooms.ts`](../apps/frontend-native/src/network/use-rooms.ts): manual fetch state, cancellation, and 15-second timer; [`home.tsx`](../apps/frontend-native/src/screens/home.tsx) | `useQuery` for `api.listRooms`, with foreground-only `refetchInterval: 15_000`, authentication gating, caching, request deduplication, and separate initial/background loading states. Keep known rooms visible if refresh fails.                                                                                                                                                                                                                                               |
| Create room                                             | `useRooms.createRoom`, `HomeScreen.create`                                                                                                                                            | `useMutation` for `api.createRoom`; replace create-specific busy/error plumbing, invalidate the lobby, and navigate using the returned room ID. The creation response is not a complete game snapshot and must not seed one.                                                                                                                                                                                                                                                    |
| Join / Leave table                                      | `useRooms.joinRoom/leaveRoom`, [`use-online-room.ts`](../apps/frontend-native/src/network/use-online-room.ts), and table `JOIN_GAME` / `LEAVE_GAME` actions                           | Shared mutations that refresh/invalidate both the viewer-specific room snapshot and lobby membership. Joining claims a seat; merely opening a room spectates. Leaving remains explicit, never an unmount cleanup or a side effect of returning to the lobby.                                                                                                                                                                                                                    |
| Room snapshot and reconnect recovery                    | `useOnlineRoom.refresh`, `api.getRoom`, room socket `onMessage`                                                                                                                       | `useQuery` owns the HTTP snapshot, loading, errors, and cancellation; the existing socket validates frames and updates the same cache with `setQueryData`. Refetch on reconnect and re-authentication. A slow HTTP response must not overwrite a newer socket snapshot.                                                                                                                                                                                                         |
| Online game and Host actions                            | `useOnlineRoom.send`, [`table.tsx`](../apps/frontend-native/src/screens/table.tsx) `act`, `play`, and auto-pass                                                                       | `useMutation` for `api.action`: `PLAY_FIRST_MOVE`, `PLAY_NEW_ROUND_FIRST_MOVE`, `PLAY_CARDS`, `PASS_TURN`, `START_GAME`, `RESET_GAME`, `FILL_WITH_BOTS`, and `REMOVE_BOT`. Share online pending/error state; refresh the authoritative room snapshot, and invalidate lobby summaries when membership, player count, or game status changes. Do not optimistically advance the game, retry uncertain actions, or queue old turns. The offline table still uses its local engine. |
| Chat history and older messages                         | [`use-room-chat.ts`](../apps/frontend-native/src/network/use-room-chat.ts) `refresh` / `loadOlder`, `api.chatHistory`, [`chat.tsx`](../apps/frontend-native/src/screens/chat.tsx)     | `useInfiniteQuery` for the latest page plus `before` cursors. `fetchNextPage` can mean loading older history; derive the cursor from the oldest server order and `hasMore`. Keep reconnect `after` catch-up and live-frame reconciliation as explicit coordination, not just pagination.                                                                                                                                                                                        |
| Send chat message                                       | `useRoomChat.send`, `api.sendChat`, `ChatScreen.submit`                                                                                                                               | `useMutation` for pending/errors, then merge the validated accepted message into history. Preserve the same `clientSendId` on an uncertain retry and deduplicate the HTTP response with its socket echo. An optional optimistic row must be visibly pending, not a confirmed server message.                                                                                                                                                                                    |
| Account turn-notification preference                    | [`turn-device.ts`](../apps/frontend-native/src/notifications/turn-device.ts) `preference`, [`turn-settings.tsx`](../apps/frontend-native/src/notifications/turn-settings.tsx)         | `useQuery` for the account-wide preference, replacing part of the effect / `revision` reload mechanism. Refresh on foreground return because another device can change it.                                                                                                                                                                                                                                                                                                      |
| Device notification readiness / registration inspection | `TurnDevice.inspect`, `TurnNotificationSettings`                                                                                                                                      | A separate `useQuery` for server registration plus local permission/token inspection. Load it in parallel with the account preference; scope it to the authenticated session and install. Recheck after system-settings return or token changes. Inspection must never request permission or enroll a device.                                                                                                                                                                   |
| Notification preference / device writes                 | `TurnDevice.setPreference`, `enable`, `remove`, `TurnNotificationSettings.change`                                                                                                     | `useMutation` wraps the existing orchestration. Reinspect preference and device status after success **or uncertain failure**, preserving generation checks, session-bound requests, SecureStore write ordering, and dismissal. Account-on must not automatically enroll the device; permission prompts remain explicit. Never optimistically show Ready.                                                                                                                       |
| Profile name / emoji update                             | [`profile.tsx`](../apps/frontend-native/src/screens/profile.tsx) `save`, `authClient.updateUser`                                                                                      | `useMutation` replaces save busy/error state. Throw on `result.error`; keep Better Auth's session as the profile read owner. Update saved form values only after confirmation. Drafts and editor selection stay local; no duplicate query for fields already in the session.                                                                                                                                                                                                    |
| Delete account                                          | `ProfileScreen.remove`, `authClient.deleteUser`                                                                                                                                       | A non-retrying mutation for pending/errors. On confirmed deletion, centrally clear private queries and mutation state, close transports, and return home. Retain the explicit DELETE confirmation and remove stale private room/chat data.                                                                                                                                                                                                                                      |

### Conditional, lower-value uses

- **Email sign-in, sign-up, sign-out, and Google sign-in initiation:**
  [`auth.tsx`](../apps/frontend-native/src/screens/auth.tsx) and
  [`home.tsx`](../apps/frontend-native/src/screens/home.tsx) could use mutations
  for request status. Keep Better Auth's Expo bridge in charge of cookies,
  OAuth callbacks, and session refresh. Normalize its `{ data, error }` results.
  Google request completion is not callback/session completion. Do not persist
  authentication mutations or retain passwords and callback credentials in
  mutation history; keeping these flows as-is is reasonable.
- **Notification-tap return verification:**
  [`use-turn-notifications.ts`](../apps/frontend-native/src/notifications/use-turn-notifications.ts)
  manages a ticket, manual retries, cancellation, and a ten-second deadline for
  `/api/turn-notifications/return`. Query can model this lookup, but must make a
  fresh authenticated request for each attempt, validate HTTP-200 denial/missing
  outcomes through
  [`notificationRoom`](../apps/frontend-native/src/notifications/turn-return.ts),
  and never use cached authorization to navigate. Its one-shot nature makes the
  current imperative flow a defensible, simpler choice.
- **Saved setup / resume metadata and auto-pass preference:**
  [`App.tsx`](../apps/frontend-native/App.tsx) reads Pass & Play setup and saved
  game existence; `TableScreen` reads auto-pass. Local query hooks could
  deduplicate these reads if more screens need them, but they are device state,
  not server state. They need `networkMode: 'always'` so offline play is not
  blocked, plus invalidation after local writes. Do not move complete game
  snapshots into Query just for this.
- **Token refresh integration:** retain `TurnDevice.refreshToken` and the
  push-token listener. Invalidate cached device inspection after a relevant
  refresh/removal. An optional mutation wrapper can expose status, but automatic
  enrollment/retry is not an improvement.

### Keep outside the query cache

- **Session, cookies, OAuth callbacks:**
  [`auth-client.ts`](../apps/frontend-native/src/network/auth-client.ts) already
  delegates these to Better Auth's official Expo integration. Confirmed-session
  retention is display continuity, not permission to make requests.
- **WebSocket ownership / connection state:**
  [`use-room-socket.ts`](../apps/frontend-native/src/network/use-room-socket.ts)
  and [`socket.ts`](../apps/frontend-native/src/network/socket.ts) retain
  transport, native headers, reconnect backoff, handshake deadlines, and
  foreground cleanup. Query's fetching/online flags do not mean a socket is
  connected.
- **Room focus leases:**
  [`use-room-focus.ts`](../apps/frontend-native/src/network/use-room-focus.ts)
  sends sequenced eight-second heartbeats and immediately releases focus in an
  AppState callback. These are presence evidence, not cached reads. Do not
  substitute Query's application focus flag, queue stale heartbeats, or delay
  release behind a generic mutation lifecycle.
- **Foreground notification eligibility:** the notification handler in
  `use-turn-notifications.ts` calls `/api/turn-notifications/check` under a
  two-second deadline and checks current identity/active room again before
  showing an alert. Keep it fresh, bounded, and fail-closed; cached eligibility
  or a paused offline request is unsafe. The
  [backend endpoints](../apps/backend/src/hono/app.ts) deliberately return
  no-store, account/registration-sensitive results.
- **Offline game authority and saves:**
  [`OfflineGameSession`](../apps/frontend-native/src/game/offline-game-session.ts)
  retains the XState actor, local bots, hidden-hand projection, suspension, and
  serialized saves.
  [`game-persistence.ts`](../apps/frontend-native/src/game/game-persistence.ts)
  validates restored games. Query is not a replacement for either.
- **UI state / local derivations:** routes, sheets, room-code input, selected or
  sorted cards, form/chat drafts, scrolling, last-read order/unread count,
  handoff visibility, hints/legal plays, motion/accessibility, font/splash
  bootstrap, sharing, and system-settings navigation keep their existing owners.

### Integration requirements

1. **Stable provider and native wiring.** Add the dependency directly to the
   native workspace and mount a stable `QueryClientProvider` above `GameApp`.
   Wire AppState to `focusManager` and the already-installed `expo-network` to
   `onlineManager`. Retain foreground/screen gates for polling, sockets, and
   authenticated reads. The app uses its own route state rather than React
   Navigation; derive screen focus from that state.
2. **Private keys and cleanup.** Namespace by backend URL, viewer ID, and an
   authenticated-visit generation. Suggested suffixes: `['rooms']`,
   `['room', roomId]`, `['chat', roomId, 'history']`,
   `['turn-notifications', 'preference']`, and
   `['turn-notifications', 'device', sessionId, endpointId]`. Include inputs that
   change a result, not raw credentials. Cancel/remove private queries and
   clear sensitive mutation state on confirmed sign-out, account replacement,
   or deletion, including same-account sign-in after sign-out. A pending
   same-account check must not clear display data.
3. **Keep authorization / late-response guards.** `enabled` controls automatic
   queries, not mutations or a retained `refetch` callback; it does not itself
   cancel an already-started request. Preserve current-visit checks, block
   authenticated reads/writes while confirmation is pending, and fence late
   results. `cancelQueries` does not cancel a running mutation, and cache
   clearing cannot undo server work.
4. **Reuse the native request adapter.**
   [`api.ts`](../apps/frontend-native/src/network/api.ts) accepts `AbortSignal`
   for room/list/chat reads;
   [`request.ts`](../apps/frontend-native/src/network/request.ts) throws
   status-bearing `ApiError` and enforces backend-only paths and native
   cookie/origin handling. Pass Query's `signal` through it; do not replace it
   with unauthenticated fetch or the web Hono client. Add cancellation support
   to notification read adapters if migrated. HTTP `cache: 'no-store'` and
   Query's in-memory cache are separate concerns.
5. **Explicit retry / no-replay policies.** Start conservatively: current hooks
   generally expose errors immediately. Retry suitable transient reads, not
   ordinary auth, missing-room, validation, or consent/generation errors. Game,
   membership, deletion, and device-consent writes must not retry uncertain
   outcomes. `retry: false` alone does not prevent offline mutation pausing and
   later execution: reject unavailable/stale actions before submission, and
   consider `networkMode: 'always'` with connectivity/identity checks inside
   fail-fast mutation functions. Do not persist/resume these mutations.
6. **Keep stream reconciliation.** Query replaces ordinary fetch bookkeeping,
   not the protocol. Validate frames, cancel obsolete snapshot fetches before
   live updates, and retain ordering/visit guards. Chat still needs
   [`mergeChat`](../apps/frontend-native/src/network/chat.ts), deduplication,
   ordering, redaction tombstones across all pages, buffering during HTTP sync,
   and complete `after` catch-up. Authoritatively rebuild/revalidate history
   on reconnect so offline account deletion cannot resurrect names or text.
7. **Preserve display / action semantics.** Use `isPending` for a gated initial
   read, `isFetching` for background refresh, and mutation `isPending` for an
   online operation. A disabled query can still be pending: guard signed-out
   loading displays. Stale read data is informational, not authority to act.
   Room-scoped `useMutationState` / `useIsMutating` can share operation state.
   Preserve the [native layout contract](native-state-transitions.md).
8. **No blanket persistence.** Begin with the memory cache. AsyncStorage already
   serves purpose-built offline-game persistence. Do not persist private hands,
   room chat, auth material, notification tickets/tokens, or time-sensitive
   mutations. Selected non-sensitive persistence is a separate, versioned and
   identity-aware design decision, never authorization to play.

### Suggested adoption order

1. Provider, keys, native lifecycle/connectivity, and private-cache cleanup.
2. Lobby query and create/join/leave mutations: high value, little stream
   complexity. Profile save/delete are also small, isolated migrations.
3. Notification settings queries/mutations, retaining consent orchestration.
4. Room HTTP query plus socket-to-cache bridge, then online action state.
5. Chat pagination/sending last, retaining and testing reconciliation.

Web precedents:
[`home-screen.tsx`](../apps/frontend-web/src/components/home-screen.tsx),
[`online-game-room.tsx`](../apps/frontend-web/src/components/game-room/online-game-room.tsx),
[`-subscribe-to-game-state.ts`](../apps/frontend-web/src/routes/room/-subscribe-to-game-state.ts),
[`profile-form.tsx`](../apps/frontend-web/src/components/profile-form.tsx), and
[`account.tsx`](../apps/frontend-web/src/routes/account.tsx). Reuse concepts,
not browser transport or assumptions about native lifecycle.

### Regression coverage for implementation

Preserve
[`use-online-room.test.ts`](../apps/frontend-native/src/network/use-online-room.test.ts)
coverage for pending revalidation, blocked retained callbacks, same-account
sign-out/sign-in cleanup, account replacement, retry-safe chat IDs, and late
send responses. Retain socket, chat/redaction, focus, consent, notification-return,
and stable-shell/layout tests.

Add cache-specific tests for shared fetch deduplication, foreground-only polling,
refresh errors retaining data, room/lobby invalidation after membership changes,
slow HTTP losing to live snapshots, older chat pages racing redactions, and
offline actions failing without replay. Each test should own a fresh QueryClient
with retries disabled to avoid leaked caches/timers.

## Documentation scope

Official React v5 guidance checked **2026-10-09**. These are audit criteria, not
additional codebase findings. Gameplay and privacy recommendations below are application
design conclusions, not guarantees supplied by TanStack Query. Source-level
citations pin official commit `a8163e0`; check the app's installed v5 minor before
adopting newer options.

## Official guidance

### Native lifecycle and connectivity

- Connect native `AppState` changes to
  `focusManager.setFocused(status === 'active')`, with app-level subscription
  cleanup and a web-platform guard. This enables normal stale-query focus
  refetching; it is distinct from navigation screen focus. [Native guide][native]
- Wire **either** NetInfo **or** Expo Network into
  `onlineManager.setEventListener`, returning subscription cleanup. Both official
  examples use `!!state.isConnected`. The Expo example also obtains initial state,
  avoids overwriting a newer event with that asynchronous result, and catches
  initialization failures. Treat connectivity as a scheduling hint, not proof that
  the server, credentials, or room WebSocket work. [Native guide][native]
  [Network modes][network]
- For screen return, use a navigation focus effect with targeted
  `refetchQueries({ queryKey, stale: true, type: 'active' })`; skip its first call
  to avoid duplicating mount fetching. Where appropriate,
  `subscribed: isFocused` disconnects that screen's query observer from updates
  and fetching, not other consumers or the entire cache. [Native guide][native]
  [useQuery][query]

### Reads, cache lifetime, cancellation, and errors

- Query keys must include changing inputs. For private resources, include the
  authenticated identity, room, and filters that determine the response; never
  put credentials in keys. Gate dependent reads with `enabled` or `skipToken`
  until their prerequisites are known. Identity scoping is an app-level privacy
  requirement, not automatic authentication support. [Query keys][keys]
  [useQuery][query]
- Choose resource-specific `staleTime` and `gcTime`: cached data is stale by
  default, and inactive queries normally survive five minutes. Stale queries
  normally refetch on mount, focus, and reconnect. `staleTime: Infinity` still
  permits invalidation; `'static'` blocks invalidation-triggered refetching and is
  unsuitable for changing room data. [Defaults][defaults]
- Pass the query function's `signal` through the actual request wrapper to
  `fetch`. Unused/unmounted queries are **not cancelled by default**; consuming
  the signal enables transport abort and cancellation restores previous query
  state. Use targeted `cancelQueries` when replacing identity or protecting a
  cache update from an older in-flight read. [Cancellation][cancellation]
- A query function must throw/reject on failure; `fetch` needs an explicit
  non-success response check. Preserve typed HTTP status information for policy.
  Distinguish initial `isPending`, active first-load `isLoading`, background
  `isFetching`, and offline `fetchStatus: 'paused'`. Retain last successful data
  alongside `isRefetchError`; do not turn a refresh error into an empty list or
  sign-out. `throwOnError` can selectively route errors to a boundary. v5 removed
  query `onSuccess`/`onError`/`onSettled`, not mutation callbacks.
  [Query functions][functions] [useQuery][query] [v5 migration][migration]
- Client `useQuery` defaults to **three retries**, with exponential delay starting
  at one second and capped at 30 seconds. There is no built-in HTTP-status
  classification. Recommend a bounded predicate for transient failures, **not
  blanket retries on 401/403/404**; ordinary auth/not-found failures need their
  own handling, unless an endpoint explicitly defines them as temporary.
  `retryOnMount` separately controls retrying failed queries on remount.
  [Retries][retries] [useQuery][query] [Retry implementation][retry-source]

### Mutations and time-sensitive gameplay

- Use `useMutation` for asynchronous writes and their pending/error state.
  Mutations default to **zero retries**; `mutateAsync` returns a rejecting promise
  that callers must handle. Put shared cache work in hook-level callbacks:
  per-call `mutate` callbacks do not run after unmount and only the latest call's
  callbacks run for consecutive calls. Update confirmed response data directly
  or invalidate related keys. Returning/awaiting invalidation from `onSuccess`
  keeps the mutation pending until that work finishes. [Mutations][mutations]
  [Mutation invalidation][mutation-invalidation]
- **Zero retries does not mean no offline queue.** Default `networkMode: 'online'`
  can pause a mutation **before its first attempt**, even with `retry: 0`;
  mounted clients resume paused mutations on reconnect/focus. Shared `scope.id`
  also deliberately serializes/queues mutations. Persisted paused mutations need
  a registered default `mutationFn` to resume after restart because functions are
  not serialized. [Network modes][network] [Mutations][mutations]
  [Retry implementation][retry-source] [Client lifecycle][client-source]
- **App recommendation: never queue/replay time-sensitive play/pass commands.**
  Keep the transport's immediate rejection behavior, or use an explicitly
  fail-fast adapter (`networkMode: 'always'`, `retry: 0`, no serial mutation
  scope) that rejects disconnected or obsolete-turn commands. Do not persist
  those mutations. Merely accepting a WebSocket send is **not server
  confirmation**: Query considers the write successful when the supplied
  mutation function's promise resolves. An adapter must wait for a correlated
  server acknowledgement if its success UI means server acceptance; otherwise
  keep send status separate from authoritative game state. Query supplies no
  gameplay expiry, acknowledgement, or deduplication protocol.
  [Network modes][network] [Mutation execution][mutation-source]

### WebSocket-fed cache updates

- Apply complete, authoritative server snapshots with immutable `setQueryData`;
  `setQueriesData` updates matching **existing** entries without creating new
  ones. Invalidate targeted keys for partial events or affected lists that cannot
  be patched safely. Invalidation normally refetches active queries only;
  inactive entries are marked invalid for later use. `refetchType: 'none'` can
  mark stale without immediate requests. Query is not a normalized entity cache
  and does not update related keys automatically. [QueryClient][client]
  [Invalidation][invalidation] [Immutable updates][updates]
- **App recommendation:** retain socket ownership, session/room isolation,
  event-order/revision checks, and reconnect snapshot recovery. Prevent an older
  HTTP response from overwriting newer pushed state through cancellation and/or
  revision validation. Long `staleTime` can reduce redundant refetches only when
  missed-event recovery and explicit invalidation remain reliable.
  [QueryClient][client] [Cancellation][cancellation] [Defaults][defaults]

### Offline behavior, persistence, and private data

- **`offlineFirst` is not cache persistence.** It runs the query function once
  even offline, then pauses retries; its documented use assumes an existing
  HTTP/service-worker/storage cache can satisfy that first attempt. It does not
  install a native disk cache. `networkMode: 'always'` suits genuinely local
  AsyncStorage reads. [Network modes][network]
- Persistence is a separate integration: `createAsyncStoragePersister` with
  AsyncStorage and `PersistQueryClientProvider`. The provider prevents fetching
  races during asynchronous restoration, not authentication races. Choose an
  explicit `maxAge` (default 24 hours), set `gcTime >= maxAge`, and use a schema
  `buster`. The adapter defaults to JSON serialization and one-second throttled
  saves; these are neither encryption nor immediate durable writes.
  [AsyncStorage persister][async-storage] [Persistence][persistence]
- Dehydration defaults to **successful queries and paused mutations**, not only
  harmless public data. Recommend an explicit query allowlist combined with
  `defaultShouldDehydrateQuery`, and `shouldDehydrateMutation: () => false` unless
  replay has separately been designed as safe. Do not persist auth material,
  private hands, or pending gameplay commands by default. Scope any approved
  private display cache to its owner; restored data must not grant access or
  establish a live turn. [Dehydration implementation][hydration-source]
  [Persistence][persistence]
- On **confirmed** logout/account change, coordinate stopping persistence,
  cancelling old reads, clearing the relevant in-memory query/mutation caches,
  and `persister.removeClient()`. Fence late socket/mutation callbacks and pending
  storage writes so they cannot repopulate the next identity's cache. Clearing
  caches does not undo server side effects; age/buster settings are not access
  controls. A pending/offline session recheck alone is not confirmed sign-out.
  These lifecycle fences are app responsibilities. [QueryClient][client]
  [Persistence][persistence] [Mutation execution][mutation-source]

### Infinite pagination

- Use `useInfiniteQuery` for cursor-based history/lists with explicit
  `initialPageParam` and `getNextPageParam`; `null`/`undefined` means no next page.
  Include identity, room, and filters in its key. Preserve both `data.pages` and
  `data.pageParams` in manual updates, including socket-driven ones.
  [Infinite queries][infinite] [Query keys][keys]
- Guard native end-reached handlers with `hasNextPage && !isFetching` to avoid
  collisions with background refreshes; expose loading-more errors separately.
  Refetching retained pages is sequential. Consider `maxPages` to bound native
  memory and refetch cost only if dropping pages is acceptable; provide reverse
  cursors when users need to recover evicted pages in a bidirectional history.
  [Infinite queries][infinite] [useInfiniteQuery][infinite-reference]

## Sources

Official TanStack documentation only; implementation links are pinned to
`a8163e00b7c02b3e5ce3f6381c13aec1b894cd71`.

- [React Native: AppState, NetInfo/Expo Network, navigation focus][native]
- [Important defaults: stale time, garbage collection, refetching][defaults]
- [Query keys][keys]
- [Query functions and thrown errors][functions]
- [useQuery API: states, gating, retry, subscription, error boundaries][query]
- [Query cancellation][cancellation]
- [Query retries][retries]
- [Network modes][network]
- [Mutations: callbacks, retries, scopes, offline restoration][mutations]
- [Invalidations from mutations][mutation-invalidation]
- [QueryClient API: updates, invalidation, cancellation, clearing][client]
- [Query invalidation][invalidation]
- [Updates from mutation responses: immutability][updates]
- [AsyncStorage persister][async-storage]
- [persistQueryClient and PersistQueryClientProvider][persistence]
- [Infinite queries][infinite]
- [useInfiniteQuery API][infinite-reference]
- [Migrating to v5][migration]
- [Official retryer source: start/pause and retry policy][retry-source]
- [Official mutation source: zero retries and promise-based success][mutation-source]
- [Official QueryClient source: reconnect/focus resumes paused mutations][client-source]
- [Official hydration source: default query/mutation dehydration filters][hydration-source]

[native]: https://tanstack.com/query/v5/docs/framework/react/react-native
[defaults]: https://tanstack.com/query/v5/docs/framework/react/guides/important-defaults
[keys]: https://tanstack.com/query/v5/docs/framework/react/guides/query-keys
[functions]: https://tanstack.com/query/v5/docs/framework/react/guides/query-functions
[query]: https://tanstack.com/query/v5/docs/framework/react/reference/useQuery
[cancellation]: https://tanstack.com/query/v5/docs/framework/react/guides/query-cancellation
[retries]: https://tanstack.com/query/v5/docs/framework/react/guides/query-retries
[network]: https://tanstack.com/query/v5/docs/framework/react/guides/network-mode
[mutations]: https://tanstack.com/query/v5/docs/framework/react/guides/mutations
[mutation-invalidation]: https://tanstack.com/query/v5/docs/framework/react/guides/invalidations-from-mutations
[client]: https://tanstack.com/query/v5/docs/framework/react/reference/classes/QueryClient
[invalidation]: https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation
[updates]: https://tanstack.com/query/v5/docs/framework/react/guides/updates-from-mutation-responses
[async-storage]: https://tanstack.com/query/v5/docs/framework/react/plugins/createAsyncStoragePersister
[persistence]: https://tanstack.com/query/v5/docs/framework/react/plugins/persistQueryClient
[infinite]: https://tanstack.com/query/v5/docs/framework/react/guides/infinite-queries
[infinite-reference]: https://tanstack.com/query/v5/docs/framework/react/reference/useInfiniteQuery
[migration]: https://tanstack.com/query/v5/docs/framework/react/guides/migrating-to-v5
[retry-source]: https://github.com/TanStack/query/blob/a8163e00b7c02b3e5ce3f6381c13aec1b894cd71/packages/query-core/src/retryer.ts#L183-L311
[mutation-source]: https://github.com/TanStack/query/blob/a8163e00b7c02b3e5ce3f6381c13aec1b894cd71/packages/query-core/src/mutation.ts#L301-L400
[client-source]: https://github.com/TanStack/query/blob/a8163e00b7c02b3e5ce3f6381c13aec1b894cd71/packages/query-core/src/queryClient.ts#L103-L119
[hydration-source]: https://github.com/TanStack/query/blob/a8163e00b7c02b3e5ce3f6381c13aec1b894cd71/packages/query-core/src/hydration.ts#L209-L282
