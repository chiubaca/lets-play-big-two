// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { toast } from "sonner";
import { authClient } from "~/libs/auth-client";
import { ProfileForm } from "./profile-form";
import { PROFILE_EMOJI_GROUPS } from "./profile-emojis";

vi.mock("~/libs/auth-client", () => ({ authClient: { updateUser: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});

function renderProfile(emoji: string | null = "😎") {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <ProfileForm user={{ name: "Tester", username: "tester", emoji }} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("offers hundreds of unique emoji choices in a keyboard-accessible scroll region", () => {
  renderProfile();
  fireEvent.click(screen.getByRole("button", { name: "Edit profile emoji" }));
  const choices = PROFILE_EMOJI_GROUPS.flatMap((group) => [...group.emojis]);
  expect(choices.length).toBeGreaterThan(300);
  expect(new Set(choices).size).toBe(choices.length);
  expect(screen.getByRole("region", { name: "Emoji choices" }).getAttribute("tabindex")).toBe("0");
  expect(screen.getByRole("button", { name: "Choose 💋" })).toBeTruthy();
});

it("shows the saved profile and disables saving unchanged values", () => {
  renderProfile();
  expect(screen.queryByLabelText("Username")).toBeNull();
  expect(screen.queryByRole("region", { name: "Emoji choices" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit username, currently tester" }));
  expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("tester");
  expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});

it("previews edits on the card and discards them when cancelled", () => {
  renderProfile();
  const preview = screen.getByLabelText("Profile preview");
  expect(preview.textContent).toContain("Big Two Crew");
  expect(preview.textContent).toContain("Club member");
  expect(preview.textContent).toContain("tester");
  fireEvent.click(screen.getByRole("button", { name: "Edit username, currently tester" }));
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "Lucky Dragon" } });
  expect(preview.textContent).toContain("Lucky Dragon");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(preview.textContent).toContain("tester");
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit profile emoji" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose 🐲" }));
  expect(preview.textContent).toContain("🐲");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(preview.textContent).toContain("😎");
  expect(authClient.updateUser).not.toHaveBeenCalled();
});

it("defaults to the spade emoji when a user has no emoji", () => {
  renderProfile(null);
  fireEvent.click(screen.getByRole("button", { name: "Edit profile emoji" }));
  expect(screen.getByRole("button", { name: "Choose ♠️" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});

it("saves an emoji from its modal, preserves the username, and closes on success", async () => {
  vi.mocked(authClient.updateUser).mockResolvedValue({ data: { status: true }, error: null });
  renderProfile();
  fireEvent.click(screen.getByRole("button", { name: "Edit profile emoji" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose 🐲" }));
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(authClient.updateUser).toHaveBeenCalledWith({
      name: "tester",
      username: "tester",
      displayUsername: "tester",
      emoji: "🐲",
    }),
  );
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Profile updated!"));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByLabelText("Profile preview").textContent).toContain("🐲");
});

it("validates usernames before sending an update", () => {
  renderProfile();
  fireEvent.click(screen.getByRole("button", { name: "Edit username, currently tester" }));
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "ab" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByRole("alert").textContent).toContain("Use 3–30 characters");
  expect(authClient.updateUser).not.toHaveBeenCalled();
});

it("saves Unicode usernames with spaces, emoji, and normalized accents", async () => {
  vi.mocked(authClient.updateUser).mockResolvedValue({ data: { status: true }, error: null });
  renderProfile();
  fireEvent.click(screen.getByRole("button", { name: "Edit username, currently tester" }));
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "  大二 e\u0301 🐲  " } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(authClient.updateUser).toHaveBeenCalledWith({
      name: "大二 é 🐲",
      username: "大二 é 🐲",
      displayUsername: "大二 é 🐲",
      emoji: "😎",
    }),
  );
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Profile updated!"));
});

it("preserves edits and shows API errors without reporting success", async () => {
  vi.mocked(authClient.updateUser).mockResolvedValue({
    data: null,
    error: { message: "Username is already taken", status: 400, statusText: "Bad Request" },
  });
  renderProfile();
  fireEvent.click(screen.getByRole("button", { name: "Edit username, currently tester" }));
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "taken" } });
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("Username is already taken"),
  );
  expect((screen.getByLabelText("Username") as HTMLInputElement).value).toBe("taken");
  expect(toast.success).not.toHaveBeenCalled();
});
