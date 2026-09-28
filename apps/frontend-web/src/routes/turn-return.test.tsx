// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { TurnReturn } from "./turn-return";

const useSession = vi.fn();
const signOut = vi.fn();
vi.mock("../libs/auth-client", () => ({
  authClient: { useSession: () => useSession(), signOut: () => signOut() },
}));
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

it("hides the intended room under a missing or different account and offers original-Player sign-in", async () => {
  window.history.replaceState({}, "", `/turn-return?ticket=${"a".repeat(50)}`);
  useSession.mockReturnValue({ data: { user: { id: "different" } }, isPending: false });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ allowed: false }))),
  );
  const { rerender } = render(<TurnReturn />);
  await waitFor(() => expect(screen.getByText("Sign in as the original Player")).toBeTruthy());
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
  expect(screen.getByRole("link", { name: "Return to lobby" }).getAttribute("href")).toBe("/");
});
