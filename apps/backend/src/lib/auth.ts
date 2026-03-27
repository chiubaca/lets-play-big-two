import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "@big-two/data-ops/drizzle/schema";

import { env } from "cloudflare:workers";

export const auth = betterAuth({
  database: drizzleAdapter(drizzle(env.BIG_TWO_DB), {
    provider: "sqlite",
    schema,
  }),
  baseURL: env.BETTER_AUTH_URL,
  advanced: {
    useSecureCookies: false,
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
});
