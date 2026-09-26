// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vite-plus/test";

import { RoomChatPrototype } from "./room-chat-prototype";

afterEach(cleanup);

it("scrolls to the latest message after sending", () => {
  render(<RoomChatPrototype spectator={false} />);
  fireEvent.click(screen.getByRole("button", { name: /room chat, 2 unread/i }));

  const messages = screen.getByRole("log", { name: "Room messages" });
  Object.defineProperty(messages, "scrollHeight", { value: 600 });
  messages.scrollTop = 0;

  fireEvent.change(screen.getByRole("textbox", { name: "Room chat message" }), {
    target: { value: "One more game?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));

  expect(screen.getByText("One more game?")).toBeTruthy();
  expect(messages.scrollTop).toBe(600);
});
