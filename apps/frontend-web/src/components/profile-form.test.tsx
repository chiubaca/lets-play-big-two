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

it("opens an enlarged card independently of the editing dialogs and restores focus", async () => {
  renderProfile();
  const opener = screen.getByRole("button", { name: "Zoom in on your membership card" });
  fireEvent.click(opener);
  const dialog = screen.getByRole("dialog", { name: "Your membership card" });
  expect(dialog.querySelector(".membership-card-stage--enlarged")).toBeTruthy();
  expect(screen.queryByLabelText("Username")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(opener));
  fireEvent.click(screen.getByRole("button", { name: "Edit profile emoji" }));
  expect(screen.getByRole("dialog", { name: "Choose your emoji" })).toBeTruthy();
  expect(authClient.updateUser).not.toHaveBeenCalled();
});

it("explains scrolling and previews the selected emoji without saving", () => {
  renderProfile();
  fireEvent.click(screen.getByRole("button", { name: "Edit profile emoji" }));
  const picker = screen.getByRole("region", { name: "Emoji choices" });
  expect(picker.getAttribute("aria-describedby")).toBe("profile-emoji-scroll-hint");
  expect(screen.getByText(/Scroll for more/)).toBeTruthy();
  expect(screen.getByLabelText("Selected emoji: 😎")).toBeTruthy();
  const choice = screen.getByRole("button", { name: "Choose 🐲" });
  fireEvent.click(choice);
  expect(screen.getByLabelText("Selected emoji: 🐲")).toBeTruthy();
  expect(choice.getAttribute("aria-pressed")).toBe("true");
  expect(choice.querySelector(".profile-emoji-check")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Choose 😎" }).querySelector(".profile-emoji-check"),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(authClient.updateUser).not.toHaveBeenCalled();
});

it.each(["Escape", "card"])(
  "returns the enlarged card to its preview when closed with %s",
  (method) => {
    renderProfile();
    const preview = screen
      .getByLabelText("Profile preview")
      .querySelector(".membership-card-stage")!;
    fireEvent.click(screen.getByRole("button", { name: "Zoom in on your membership card" }));
    const dialog = screen.getByRole("dialog", { name: "Your membership card" });
    const enlarged = dialog.querySelector(".membership-card-stage")!;
    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 200,
      width: 400,
      height: 250,
    } as DOMRect);
    vi.spyOn(enlarged, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 100,
      width: 600,
      height: 400,
    } as DOMRect);
    if (method === "Escape") {
      fireEvent.keyDown(document, { key: "Escape" });
    } else {
      fireEvent.click(screen.getByRole("button", { name: "Return to your profile" }));
    }
    expect(dialog.style.getPropertyValue("--card-return-x")).toBe("0px");
    expect(dialog.style.getPropertyValue("--card-return-y")).toBe("25px");
    expect(dialog.style.getPropertyValue("--card-return-scale-x")).toBe(`${400 / 600}`);
    expect(dialog.style.getPropertyValue("--card-return-scale-y")).toBe("0.625");
    expect(screen.queryByRole("dialog")).toBeNull();
  },
);

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
