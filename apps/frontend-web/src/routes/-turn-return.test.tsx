// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { TurnReturn } from "./turn-return";

const useSession = vi.fn();
const signOut = vi.fn();
vi.mock("../libs/auth-client", () => ({
  authClient: { useSession: () => useSession() },
}));
vi.mock("../libs/turn-sign-out", () => ({ signOutAndDetachTurnDevice: () => signOut() }));
vi.mock("../components/auth-panel", () => ({ AuthPanel: () => <button>Sign in</button> }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("hides the intended room under a missing or different account and offers sign-in with the receiving account", async () => {
  window.history.replaceState({}, "", `/turn-return?ticket=${"a".repeat(50)}`);
  useSession.mockReturnValue({ data: { user: { id: "different" } }, isPending: false });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ allowed: false }))),
  );
  const { rerender } = render(<TurnReturn />);
  await waitFor(() =>
    expect(
      screen.getByText("Sign in with the account that received this notification"),
    ).toBeTruthy(),
  );
  expect(
    screen.getByText(
      "This notification belongs to a different account. Switch accounts to open it.",
    ),
  ).toBeTruthy();
  expect(document.body.textContent).not.toContain("ABCDE");
  fireEvent.click(screen.getByRole("button", { name: "Sign out to switch accounts" }));
  expect(signOut).toHaveBeenCalledTimes(1);
  useSession.mockReturnValue({ data: null, isPending: false });
  rerender(<TurnReturn />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy());
  expect(document.body.textContent).not.toContain("ABCDE");
});

it("shows missing-room recovery rather than resurrecting a finished or expired room", async () => {
  window.history.replaceState({}, "", `/turn-return?ticket=${"b".repeat(50)}`);
  useSession.mockReturnValue({ data: { user: { id: "ada" } }, isPending: false });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ allowed: true, missing: true }))),
  );
  render(<TurnReturn />);
  await waitFor(() => expect(screen.getByText("This room could not be found")).toBeTruthy());
  expect(screen.getByRole("link", { name: "Back home" }).getAttribute("href")).toBe("/");
});

it("clears a resolved missing-room result immediately when the account or ticket changes", async () => {
  window.history.replaceState({}, "", `/turn-return?ticket=${"b".repeat(50)}`);
  useSession.mockReturnValue({ data: { user: { id: "ada" } }, isPending: false });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ allowed: true, missing: true }))),
  );
  const { rerender } = render(<TurnReturn />);
  await waitFor(() => expect(screen.getByText("This room could not be found")).toBeTruthy());

  useSession.mockReturnValue({ data: { user: { id: "ben" } }, isPending: true });
  rerender(<TurnReturn />);
  expect(screen.queryByText("This room could not be found")).toBeNull();
  expect(screen.getByText("Checking your account…")).toBeTruthy();

  useSession.mockReturnValue({ data: null, isPending: false });
  rerender(<TurnReturn />);
  await waitFor(() => expect(screen.getByText("Sign in to return to your turn")).toBeTruthy());
  expect(screen.queryByText("This room could not be found")).toBeNull();
});

it("rejects an arbitrary response target without navigating to it", async () => {
  window.history.replaceState({}, "", `/turn-return?ticket=${"c".repeat(50)}`);
  useSession.mockReturnValue({ data: { user: { id: "ada" } }, isPending: false });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ allowed: true, target: "https://evil.example/room/ABCDE" })),
    ),
  );
  render(<TurnReturn />);
  await waitFor(() =>
    expect(
      screen.getByText("Sign in with the account that received this notification"),
    ).toBeTruthy(),
  );
  expect(window.location.origin).not.toBe("https://evil.example");
});

it("offers home-page recovery when the notification cannot be verified", async () => {
  window.history.replaceState({}, "", `/turn-return?ticket=${"d".repeat(50)}`);
  useSession.mockReturnValue({ data: { user: { id: "ada" } }, isPending: false });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
  render(<TurnReturn />);
  await screen.findByRole("heading", { name: "Could not verify this notification" });
  expect(
    screen.getByText("Open your room from the home page to check whose turn it is."),
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back home" }).getAttribute("href")).toBe("/");
});
