import {
  forgetTurnNotificationInstall,
  turnNotificationDevice,
} from "~/components/game-room/turn-notification-device";
import { authClient } from "./auth-client";

export async function signOutAndDetachTurnDevice() {
  try {
    await turnNotificationDevice.remove();
  } catch {
    // The auth sign-out must still revoke the originating session if removal is unavailable.
  } finally {
    await forgetTurnNotificationInstall();
  }
  return authClient.signOut();
}
