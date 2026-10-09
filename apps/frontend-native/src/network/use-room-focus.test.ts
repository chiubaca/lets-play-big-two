import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useForeground } from "./use-foreground";
import { useRoomFocus } from "./use-room-focus";

const native = vi.hoisted(() => ({
  state: "active",
  listeners: new Set<(state: string) => void>(),
  focus: vi.fn(),
}));
vi.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return native.state;
    },
    addEventListener: (_event: string, listener: (state: string) => void) => {
      native.listeners.add(listener);
      return { remove: () => native.listeners.delete(listener) };
    },
  },
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "11111111-1111-4111-8111-111111111111" }));
vi.mock("./api", () => ({ api: { roomFocus: native.focus } }));

let renderer: ReactTestRenderer;
let focused: boolean | undefined;
function Room() {
  const foreground = useForeground();
  useRoomFocus("ABCDE", "ada", focused ?? foreground);
  return null;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  native.state = "active";
  focused = undefined;
  native.listeners.clear();
  native.focus.mockReset().mockResolvedValue({ ok: true });
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
});

it("releases room focus on the native background event before React can render again", async () => {
  await act(async () => {
    renderer = create(createElement(Room));
  });
  expect(native.focus).toHaveBeenLastCalledWith(
    "ABCDE",
    expect.objectContaining({ focused: true }),
  );
  act(() => {
    native.state = "background";
    for (const listener of native.listeners) listener("background");
    // A native app can be suspended before its next render or passive effect.
    expect(native.focus).toHaveBeenLastCalledWith(
      "ABCDE",
      expect.objectContaining({ focused: false }),
    );
  });
});

it("stops renewing a background lease even before the React effect cleanup runs", async () => {
  vi.useFakeTimers();
  try {
    await act(async () => {
      renderer = create(createElement(Room));
    });
    act(() => {
      native.state = "background";
      for (const listener of native.listeners) listener("background");
      vi.advanceTimersByTime(24000);
      expect(native.focus).toHaveBeenCalledTimes(2);
      expect(native.focus).toHaveBeenLastCalledWith(
        "ABCDE",
        expect.objectContaining({ focused: false, sequence: 2 }),
      );
    });
  } finally {
    vi.useRealTimers();
  }
});

it("resumes the same lease and its heartbeat when background and foreground precede a render", async () => {
  vi.useFakeTimers();
  try {
    await act(async () => {
      renderer = create(createElement(Room));
    });
    act(() => {
      for (const state of ["background", "active"]) {
        native.state = state;
        for (const listener of native.listeners) listener(state);
      }
      expect(native.focus).toHaveBeenLastCalledWith(
        "ABCDE",
        expect.objectContaining({ focused: true, sequence: 3 }),
      );
      vi.advanceTimersByTime(8000);
      expect(native.focus).toHaveBeenLastCalledWith(
        "ABCDE",
        expect.objectContaining({ focused: true, sequence: 4 }),
      );
    });
  } finally {
    vi.useRealTimers();
  }
});

it("does not claim focus when mounting with a stale foreground prop after native backgrounding", async () => {
  native.state = "background";
  focused = true;
  await act(async () => {
    renderer = create(createElement(Room));
  });
  expect(native.focus).toHaveBeenLastCalledWith(
    "ABCDE",
    expect.objectContaining({ focused: false }),
  );
});
