// Centralized, validated access to environment configuration.
//
// Hard rule: the Supabase SERVICE ROLE key must never be read here. This
// module is imported by both server and client code, so it intentionally
// has no export that could expose it to a browser bundle. Server-only
// scripts (scripts/*.ts, run with `node`/`tsx` outside Next.js) read
// SUPABASE_SERVICE_ROLE_KEY directly from process.env themselves and are
// never imported by any `src/` module that ships to the client.

import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_MAPTILE_STYLE_URL: z.string().url().optional(),
});

const serverEnvSchema = z.object({
  GEOCODING_PROVIDER: z.enum(["geocodio", "none"]).default("none"),
  GEOCODIO_API_KEY: z.string().optional(),
  ENABLE_SEARCH_HISTORY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  SEARCH_HISTORY_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  RATE_LIMIT_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(30),
});

let cachedPublicEnv: z.infer<typeof publicEnvSchema> | null = null;
let cachedServerEnv: z.infer<typeof serverEnvSchema> | null = null;

/** Safe to call from client or server code. */
export function getPublicEnv() {
  if (cachedPublicEnv) return cachedPublicEnv;
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_MAPTILE_STYLE_URL: process.env.NEXT_PUBLIC_MAPTILE_STYLE_URL,
  });
  if (!parsed.success) {
    throw new Error(
      `Missing/invalid public environment configuration: ${parsed.error.message}. ` +
        "Copy .env.example to .env.local and fill in your Supabase project URL + anon key."
    );
  }
  cachedPublicEnv = parsed.data;
  return cachedPublicEnv;
}

/** Server-only: do not import this module's getServerEnv() from client components. */
export function getServerEnv() {
  if (cachedServerEnv) return cachedServerEnv;
  const parsed = serverEnvSchema.safeParse({
    GEOCODING_PROVIDER: process.env.GEOCODING_PROVIDER,
    GEOCODIO_API_KEY: process.env.GEOCODIO_API_KEY,
    ENABLE_SEARCH_HISTORY: process.env.ENABLE_SEARCH_HISTORY,
    SEARCH_HISTORY_RETENTION_DAYS: process.env.SEARCH_HISTORY_RETENTION_DAYS,
    RATE_LIMIT_REQUESTS_PER_MINUTE: process.env.RATE_LIMIT_REQUESTS_PER_MINUTE,
  });
  if (!parsed.success) {
    throw new Error(`Invalid server environment configuration: ${parsed.error.message}`);
  }
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}
