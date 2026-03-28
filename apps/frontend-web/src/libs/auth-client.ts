import { createAuthClient } from "better-auth/react";

console.log(
  "🔍 ~  ~ apps/frontend-web/src/libs/auth-client.ts:4 ~ import.meta.env.VITE_BACKEND_URL:",
  import.meta.env.VITE_BACKEND_URL,
);
export const authClient = createAuthClient({
  baseURL: `${import.meta.env.VITE_BACKEND_URL}/api/auth`,
});
