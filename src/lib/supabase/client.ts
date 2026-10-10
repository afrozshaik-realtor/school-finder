// Browser Supabase client. Uses only the anon/publishable key, which is
// safe to ship to the browser (Supabase's anon key is designed for this;
// RLS is what actually protects data, not secrecy of this key).
"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export function createClient() {
  const env = getPublicEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
