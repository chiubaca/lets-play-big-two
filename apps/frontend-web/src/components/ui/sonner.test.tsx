// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { toast } from "sonner";
import { Toaster } from "./sonner";

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("mounts top-center with casino styling", async () => {
  render(<Toaster />);

  toast.success("Welcome back, tester!");
  const message = await screen.findByText("Welcome back, tester!");

  const toaster = document.querySelector("[data-sonner-toaster]");
  expect(toaster?.getAttribute("data-x-position")).toBe("center");
  expect(toaster?.getAttribute("data-y-position")).toBe("top");

  const item = message.closest("li");
  expect(item?.className).toContain("casino-toast");
  expect(message.className).toContain("casino-toast-title");
  expect(item?.querySelector("[data-icon]")).toBeNull();
});

it("lets callers override the position", async () => {
  render(<Toaster position="bottom-right" />);

  toast.success("Hello");
  await screen.findByText("Hello");

  const toaster = document.querySelector("[data-sonner-toaster]");
  expect(toaster?.getAttribute("data-x-position")).toBe("right");
  expect(toaster?.getAttribute("data-y-position")).toBe("bottom");
});
