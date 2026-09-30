import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: `${import.meta.env.VITE_BACKEND_URL}/api/auth`,
  plugins: [
    usernameClient(),
    inferAdditionalFields({
      user: { emoji: { type: "string", required: false, defaultValue: "♠️" } },
    }),
  ],
});
