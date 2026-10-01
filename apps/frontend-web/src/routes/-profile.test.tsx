// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { ProfilePage } from "./profile";

const useSession = vi.fn();
const redirect = vi.fn();
vi.mock("~/libs/auth-client", () => ({ authClient: { useSession: () => useSession() } }));
vi.mock("~/components/casino/casino", () => ({ CasinoBackdrop: () => null }));
vi.mock("~/components/home-back-button", () => ({ HomeBackButton: () => null }));
vi.mock("~/components/profile-form", () => ({ ProfileForm: () => <p>Membership card</p> }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  Navigate: (props: unknown) => {
    redirect(props);
    return null;
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("replaces a signed-out profile visit with the homepage auth request", () => {
  useSession.mockReturnValue({ data: null, isPending: false, error: null });
  render(<ProfilePage />);
  expect(redirect).toHaveBeenCalledWith({ to: "/", search: { auth: "sign-in" }, replace: true });
  expect(screen.queryByText("Membership card")).toBeNull();
});

it("waits for the session check rather than redirecting a loading account", () => {
  useSession.mockReturnValue({ data: null, isPending: true, error: null });
  render(<ProfilePage />);
  expect(screen.getByRole("status").textContent).toContain("Loading your profile");
  expect(redirect).not.toHaveBeenCalled();
});

it("keeps session failures on the profile page instead of treating them as signed out", () => {
  useSession.mockReturnValue({ data: null, isPending: false, error: new Error("Unavailable") });
  render(<ProfilePage />);
  expect(screen.getByRole("alert").textContent).toContain("Couldn’t load your profile");
  expect(redirect).not.toHaveBeenCalled();
});

it("keeps signed-in users on their profile", () => {
  useSession.mockReturnValue({ data: { user: { id: "tester" } }, isPending: false, error: null });
  render(<ProfilePage />);
  expect(screen.getByText("Membership card")).toBeTruthy();
  expect(redirect).not.toHaveBeenCalled();
});
