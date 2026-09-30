// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { HomeScreen, type HomeSession } from "./home-screen";
import { authClient } from "../libs/auth-client";
import { honoClient } from "../libs/hono-client";
import { toast } from "sonner";
import { signOutAndDetachTurnDevice } from "../libs/turn-sign-out";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../libs/auth-client", () => ({
  authClient: {
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
  },
}));
vi.mock("../libs/hono-client", () => ({
  honoClient: { api: { rooms: { $get: vi.fn() }, room: { $post: vi.fn() } } },
}));
vi.mock("../libs/turn-sign-out", () => ({ signOutAndDetachTurnDevice: vi.fn() }));
vi.mock("./game-room/turn-notification-device", () => ({
  forgetTurnNotificationInstall: vi.fn(),
}));
vi.mock("./casino/casino", () => ({
  CasinoBackdrop: () => <div data-testid="casino-backdrop" />,
  CasinoPanel: (props: Record<string, unknown>) => {
    const { children, ...rest } = props as unknown as {
      children: React.ReactNode;
    } & React.HTMLAttributes<HTMLDivElement>;
    return <div {...rest}>{children}</div>;
  },
}));
vi.mock("./home-logo", () => ({ HomeLogo: () => <div>logo</div> }));
vi.mock("./use-scroll-overlap", () => ({ useScrollOverlap: () => {} }));
vi.mock("@tanstack/react-router", () => ({
  Link: (props: Record<string, unknown>) => {
    const {
      children,
      to,
      params: _params,
      search: _search,
      ...rest
    } = props as unknown as {
      children: React.ReactNode;
      to: string;
      params?: unknown;
      search?: unknown;
    } & React.AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a {...rest} href={to}>
        {children}
      </a>
    );
  },
  useNavigate: () => vi.fn(),
}));

const signInEmail = authClient.signIn.email as unknown as ReturnType<typeof vi.fn>;
const roomsGet = honoClient.api.rooms.$get as unknown as ReturnType<typeof vi.fn>;
const toastSuccess = toast.success as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

function testSession(username = "tester"): HomeSession {
  return {
    user: {
      id: "user-1",
      name: "Tester McTest",
      email: "test@test.com",
      emailVerified: true,
      username,
    },
  };
}

function renderHome(session: HomeSession | null = null) {
  roomsGet.mockResolvedValue({ ok: true, json: async () => ({ rooms: [] }) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HomeScreen session={session} sessionPending={false} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it("closes the sign-in modal and welcomes the player after email sign-in", async () => {
  signInEmail.mockResolvedValue({
    data: { user: { id: "user-1", username: "tester" } },
    error: null,
  });
  renderHome();

  fireEvent.click(screen.getByRole("button", { name: "Sign in for multiplayer" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: "test@test.com" } });
  fireEvent.change(within(dialog).getByLabelText("Password"), {
    target: { value: "test@test.com" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Sign in" }));

  await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Welcome back, tester!"));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("closes an open sign-in modal when the session arrives", async () => {
  const roomsGetImpl = roomsGet;
  roomsGetImpl.mockResolvedValue({ ok: true, json: async () => ({ rooms: [] }) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <HomeScreen session={null} sessionPending={false} />
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Sign in for multiplayer" }));
  expect(screen.getByRole("dialog")).toBeTruthy();

  view.rerender(
    <QueryClientProvider client={client}>
      <HomeScreen session={testSession("guser")} sessionPending={false} />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(toastSuccess).toHaveBeenCalledWith("Welcome back, guser!");
});

it("does not toast when loading with an existing session", async () => {
  renderHome(testSession());

  await waitFor(() => expect(screen.getByRole("button", { name: "Create room" })).toBeTruthy());
  expect(toastSuccess).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("opens the account submenu from the username and offers profile, deletion, and logout", async () => {
  renderHome(testSession());
  const trigger = screen.getByRole("button", { name: "Open account menu for tester" });
  fireEvent.keyDown(trigger, { key: "Enter" });
  const menu = await screen.findByRole("menu");
  expect(within(menu).getByRole("menuitem", { name: "Profile" }).getAttribute("href")).toBe(
    "/profile",
  );
  expect(
    within(menu).getByRole("menuitem", { name: "Account deletion" }).getAttribute("href"),
  ).toBe("/account");
  fireEvent.click(within(menu).getByRole("menuitem", { name: "Log out" }));
  expect(signOutAndDetachTurnDevice).toHaveBeenCalled();
});

it("marks a pending welcome before redirecting to Google", () => {
  renderHome();

  fireEvent.click(screen.getByRole("button", { name: "Sign in for multiplayer" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Continue with Google" }),
  );

  expect(sessionStorage.getItem("big-two-pending-welcome")).toBe("1");
  expect(authClient.signIn.social).toHaveBeenCalled();
});
