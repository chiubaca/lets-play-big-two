// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { MembershipCard } from "./membership-card";

let preference: {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};
let frame: FrameRequestCallback | null;

beforeEach(() => {
  preference = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  frame = null;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => preference),
  );
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn(() => {
      frame = null;
    }),
  );
  vi.stubGlobal(
    "PointerEvent",
    class extends MouseEvent {
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerType = init.pointerType ?? "mouse";
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderCard(compact = false) {
  const result = render(<MembershipCard name="Lucky Dragon" emoji="🐲" compact={compact} />);
  const stage = result.container.querySelector<HTMLSpanElement>(".membership-card-stage")!;
  vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 440,
    bottom: 252,
    width: 440,
    height: 252,
    toJSON: () => ({}),
  });
  return { ...result, stage };
}

it("uses all three brand assets and preserves accessible edit controls", () => {
  const editName = vi.fn();
  const editEmoji = vi.fn();
  const { container } = render(
    <MembershipCard name="Lucky Dragon" emoji="🐲" onEditName={editName} onEditEmoji={editEmoji} />,
  );
  for (const src of ["/title-logo.png", "/title-text.png", "/title-crew.png"]) {
    expect(container.querySelector(`img[src="${src}"]`)).toBeTruthy();
  }
  fireEvent.click(screen.getByRole("button", { name: "Edit profile emoji" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit username, currently Lucky Dragon" }));
  expect(editName).toHaveBeenCalledOnce();
  expect(editEmoji).toHaveBeenCalledOnce();
});

it("moves foil, glare and tilt together in one animation frame and returns to rest", () => {
  const { stage } = renderCard();
  fireEvent.pointerMove(stage, { clientX: 330, clientY: 63 });
  expect(stage.dataset.interacting).toBeUndefined();
  frame?.(0);
  expect(stage.dataset.interacting).toBe("true");
  expect(stage.style.getPropertyValue("--pointer-x")).toBe("75%");
  expect(stage.style.getPropertyValue("--pointer-y")).toBe("25%");
  expect(stage.style.getPropertyValue("--rotate-x")).toBe("2.5deg");
  expect(stage.style.getPropertyValue("--rotate-y")).toBe("2.5deg");
  fireEvent.pointerLeave(stage);
  expect(stage.dataset.interacting).toBeUndefined();
  expect(stage.style.getPropertyValue("--rotate-x")).toBe("0deg");
});

it("provides a hidden back face with the homepage's stacked logo", () => {
  const { container } = renderCard();
  const back = container.querySelector(".membership-card-back")!;
  expect(back.getAttribute("aria-hidden")).toBe("true");
  expect(back.querySelector(".home-logo-title")).toBeTruthy();
  for (const src of ["/title-logo.png", "/title-text.png", "/title-crew.png"]) {
    expect(back.querySelector(`img[src="${src}"]`)).toBeTruthy();
  }
  expect(back.querySelector(".membership-card-identity")).toBeNull();
  expect(back.querySelector("button")).toBeNull();
});

it("keeps the compact dropdown card static with no holographic layers or nested buttons", () => {
  const { stage } = renderCard(true);
  fireEvent.pointerMove(stage, { clientX: 440, clientY: 126 });
  expect(requestAnimationFrame).not.toHaveBeenCalled();
  expect(stage.getAttribute("style")).toBeNull();
  expect(stage.querySelector(".membership-card-foil")).toBeNull();
  expect(stage.querySelector(".membership-card-glare")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});

it("does not animate when reduced motion is preferred", () => {
  preference.matches = true;
  const { stage } = renderCard();
  fireEvent.pointerMove(stage, { clientX: 330, clientY: 63 });
  expect(requestAnimationFrame).not.toHaveBeenCalled();
  expect(stage.getAttribute("style")).toBeNull();
});

it("cancels queued pointer updates when inspection is closing without erasing its lighting", () => {
  const { stage, rerender } = renderCard();
  fireEvent.pointerMove(stage, { clientX: 330, clientY: 63 });
  const queued = frame;
  stage.style.setProperty("--pointer-x", "41%");
  rerender(<MembershipCard name="Lucky Dragon" emoji="🐲" interactive={false} />);
  queued?.(0);
  expect(cancelAnimationFrame).toHaveBeenCalled();
  expect(stage.dataset.interacting).toBeUndefined();
  expect(stage.style.getPropertyValue("--pointer-x")).toBe("41%");
  vi.mocked(requestAnimationFrame).mockClear();
  fireEvent.pointerMove(stage, { clientX: 330, clientY: 63 });
  expect(requestAnimationFrame).not.toHaveBeenCalled();
});

it("responds to touch while leaving scroll gestures and edit clicks alone", () => {
  const { stage } = renderCard();
  fireEvent.pointerDown(stage, { pointerType: "touch", buttons: 1, clientX: 330, clientY: 63 });
  frame?.(0);
  expect(stage.dataset.interacting).toBe("true");
  fireEvent.pointerUp(stage, { pointerType: "touch" });
  expect(stage.dataset.interacting).toBeUndefined();
  expect(stage.style.getPropertyValue("--rotate-y")).toBe("0deg");
  vi.mocked(requestAnimationFrame).mockClear();
  fireEvent.pointerMove(stage, { pointerType: "touch", buttons: 0, clientX: 330, clientY: 63 });
  expect(requestAnimationFrame).not.toHaveBeenCalled();
});

it("cancels pending movement when motion preferences change", () => {
  const { stage } = renderCard();
  fireEvent.pointerMove(stage, { clientX: 330, clientY: 63 });
  frame?.(0);
  fireEvent.pointerMove(stage, { clientX: 220, clientY: 126 });
  preference.matches = true;
  const updatePreference = preference.addEventListener.mock.calls[0][1];
  updatePreference();
  expect(stage.dataset.interacting).toBeUndefined();
  expect(stage.getAttribute("style")).toBeNull();
  expect(frame).toBeNull();
});

it("cancels queued frames and removes the preference listener on unmount", () => {
  const { stage, unmount } = renderCard();
  fireEvent.pointerMove(stage, { clientX: 330, clientY: 63 });
  unmount();
  expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  expect(preference.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
});
