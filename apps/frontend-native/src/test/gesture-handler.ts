import type { GestureTouchEvent } from "react-native-gesture-handler";

type Manager = { fail: () => void };
type TouchHandler = (event: GestureTouchEvent, manager: Manager) => void;
class ManualGesture {
  config = { enabled: true, shouldCancelWhenOutside: true };
  handlers: {
    onTouchesDown?: TouchHandler;
    onTouchesMove?: TouchHandler;
    onTouchesUp?: TouchHandler;
    onTouchesCancelled?: TouchHandler;
    onFinalize?: () => void;
  } = {};
  enabled(value: boolean) {
    this.config.enabled = value;
    return this;
  }
  shouldCancelWhenOutside(value: boolean) {
    this.config.shouldCancelWhenOutside = value;
    return this;
  }
  onTouchesDown(callback: TouchHandler) {
    this.handlers.onTouchesDown = callback;
    return this;
  }
  onTouchesMove(callback: TouchHandler) {
    this.handlers.onTouchesMove = callback;
    return this;
  }
  onTouchesUp(callback: TouchHandler) {
    this.handlers.onTouchesUp = callback;
    return this;
  }
  onTouchesCancelled(callback: TouchHandler) {
    this.handlers.onTouchesCancelled = callback;
    return this;
  }
  onFinalize(callback: () => void) {
    this.handlers.onFinalize = callback;
    return this;
  }
}
export const Gesture = { Manual: () => new ManualGesture() };
export const GestureDetector = "GestureDetector";
export const GestureHandlerRootView = "GestureHandlerRootView";
