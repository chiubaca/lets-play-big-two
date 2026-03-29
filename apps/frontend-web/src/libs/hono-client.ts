import { hc } from "hono/client";
import type { AppType } from "backend/hono/app";

export const client = hc<AppType>(import.meta.env.VITE_BACKEND_URL, {
  init: {
    credentials: "include",
  },
});
