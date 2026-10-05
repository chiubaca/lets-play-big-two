import { getRandomValues, randomUUID } from "expo-crypto";
import { ensureGameRuntimeCompatibility } from "./game/native-runtime";

ensureGameRuntimeCompatibility();

// Shared bot IDs use the Web Crypto API. Hermes does not supply it on every platform.
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID, getRandomValues },
    configurable: true,
  });
} else {
  if (!globalThis.crypto.randomUUID)
    Object.defineProperty(globalThis.crypto, "randomUUID", { value: randomUUID });
  if (!globalThis.crypto.getRandomValues)
    Object.defineProperty(globalThis.crypto, "getRandomValues", { value: getRandomValues });
}
