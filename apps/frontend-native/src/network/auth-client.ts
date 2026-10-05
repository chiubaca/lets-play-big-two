import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, usernameClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";
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

export const useSession = authClient.useSession;
export type NativeSession = typeof authClient.$Infer.Session;
export type NativeUser = NativeSession["user"];
