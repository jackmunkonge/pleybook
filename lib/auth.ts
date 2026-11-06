import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { getDb } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import * as schema from "@/lib/db/schema";

/**
 * Invite-only auth. Public sign-up is disabled for the app instance; accounts are
 * created by scripts/create-user.ts, which builds its own instance with allowSignUp.
 */
export function createAuth(opts: { allowSignUp?: boolean } = {}) {
  const env = getEnv();
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    emailAndPassword: { enabled: true, disableSignUp: !opts.allowSignUp },
    // Rate limiting defaults to on in production (off in dev/test), persisted in Postgres.
    rateLimit: {
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/username": { window: 60, max: 5 },
        "/sign-in/email": { window: 60, max: 5 },
      },
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 32,
        usernameValidator: (u) => /^[a-z0-9_.]+$/.test(u),
      }),
      nextCookies(), // must be last
    ],
  });
}

export const auth = createAuth();
