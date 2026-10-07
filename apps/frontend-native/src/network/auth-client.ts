import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, usernameClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
import { useState } from "react";
import { BACKEND_URL, NATIVE_SCHEME } from "./config";

// The official bridge owns cookie persistence, session refresh and OAuth callbacks.
// updateUser({ name, username, displayUsername, emoji }) and deleteUser remain
// available on this client alongside the email/username/social sign-in methods.
export const authClient = createAuthClient({
  baseURL: `${BACKEND_URL}/api/auth`,
  plugins: [
    expoClient({ scheme: NATIVE_SCHEME, storagePrefix: NATIVE_SCHEME, storage: SecureStore }),
    usernameClient(),
    inferAdditionalFields({
      user: { emoji: { type: "string", required: false, defaultValue: "♠️" } },
    }),
  ],
});

// Retention is display continuity, not authorization: consumers must still gate
// authenticated work on isPending. Never carry a confirmed identity across a
// sign-out or a different account, including a different account seen mid-check.
export function useSession() {
  const session = authClient.useSession();
  const [confirmed, setConfirmed] = useState(session.isPending ? null : session.data);
  const changedAccount = session.data && confirmed && session.data.user.id !== confirmed.user.id;
  const next = session.isPending ? (changedAccount ? null : confirmed) : session.data;
  if (next !== confirmed) setConfirmed(next);
  return { ...session, data: next };
}
export type NativeSession = typeof authClient.$Infer.Session;
export type NativeUser = NativeSession["user"];
