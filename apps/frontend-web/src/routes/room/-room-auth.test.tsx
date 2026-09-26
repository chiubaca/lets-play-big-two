// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { RoomSignIn } from "./$roomId";
import { authClient } from "../../libs/auth-client";

vi.mock("../../libs/auth-client", () => ({
  authClient: {
    signIn: { social: vi.fn(), email: vi.fn() },
    signUp: { email: vi.fn() },
  },
}));

afterEach(cleanup);

test("direct room visits offer the existing sign-in and sign-up forms", () => {
  render(<RoomSignIn roomId="ABCDE" />);

  expect(screen.getByText("Room ABCDE")).toBeTruthy();
  expect(document.querySelector('img[src="/title-logo.png"]')).toBeTruthy();
  expect(document.querySelector('img[src="/title-text.png"]')).toBeTruthy();
  expect(document.querySelector('img[src="/title-crew.png"]')).toBeTruthy();
  expect(screen.queryByText("Come on in.")).toBeNull();
  expect(screen.getByLabelText("Email")).toBeTruthy();
  expect(screen.getByLabelText("Password")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Create an account" }));
  expect(screen.getByLabelText("Username")).toBeTruthy();
});

test("Google sign-in returns visitors to the same room", () => {
  window.history.replaceState({}, "", "/room/ABCDE");
  render(<RoomSignIn roomId="ABCDE" />);

  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
  expect(authClient.signIn.social).toHaveBeenCalledWith({
    provider: "google",
    callbackURL: window.location.href,
  });
});
