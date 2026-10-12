import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { MembershipCardTexture } from "./membership-card-texture";
import { Image } from "react-native";
import Svg from "react-native-svg";

vi.mock("react-native", () => ({
  Image: "Image",
  StyleSheet: { absoluteFill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } },
}));
vi.mock("react-native-svg", () => ({ default: "Svg" }));

let renderer: ReactTestRenderer;
let nextFrame = 0;
const frames = new Map<number, FrameRequestCallback>();
const capture = vi.fn<(done: (data: string) => void) => void>();
const fixture = (key: string) =>
  createElement(MembershipCardTexture, {
    cacheKey: key,
    width: "100%",
    height: "100%",
    viewBox: "0 0 400 266",
  });
async function mount(key: string) {
  await act(async () => {
    renderer = create(fixture(key), { createNodeMock: () => ({ toDataURL: capture }) });
  });
}
async function rasterize() {
  await act(async () => renderer.root.findByType(Svg).props.onLayout());
  await flushFrame();
}
async function flushFrame() {
  await act(async () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(0));
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  frames.clear();
  capture.mockImplementation((done) => done("material"));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(async () => {
  await act(async () => renderer.unmount());
  vi.unstubAllGlobals();
});

it("reuses the preview's rasterized artwork when it mounts again in the modal, without an Android image fade", async () => {
  await mount("reuse");
  expect(capture).not.toHaveBeenCalled();
  await rasterize();
  expect(capture).toHaveBeenCalledOnce();
  const image = renderer.root.findByType(Image);
  expect(image.props).toMatchObject({
    source: { uri: "data:image/png;base64,material" },
    fadeDuration: 0,
    resizeMode: "stretch",
    accessible: false,
  });
  await act(async () => renderer.unmount());
  await mount("reuse");
  expect(renderer.root.findAllByType(Svg)).toHaveLength(0);
  expect(capture).toHaveBeenCalledOnce();
});

it("ignores an old capture when the card's dimensions change", async () => {
  let delayed!: (data: string) => void;
  capture.mockImplementation((done) => {
    delayed = done;
  });
  await mount("old-size");
  await rasterize();
  await act(async () => renderer.update(fixture("new-size")));
  await act(async () => delayed("old"));
  expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  capture.mockImplementation((done) => done("new"));
  // The physical SVG bounds are unchanged, so native onLayout won't fire again.
  await flushFrame();
  expect(renderer.root.findByType(Image).props.source.uri).toBe("data:image/png;base64,new");
});

it("cancels pending rasterization on unmount", async () => {
  await mount("unmounted");
  await act(async () => renderer.root.findByType(Svg).props.onLayout());
  expect(frames.size).toBe(1);
  await act(async () => renderer.unmount());
  expect(frames.size).toBe(0);
  expect(capture).not.toHaveBeenCalled();
});

it("evicts old sizes rather than growing the shared texture cache indefinitely", async () => {
  for (let index = 0; index < 17; index += 1) {
    await mount(`bounded-${index}`);
    await rasterize();
    await act(async () => renderer.unmount());
  }
  await mount("bounded-0");
  expect(renderer.root.findAllByType(Svg)).toHaveLength(1);
});
