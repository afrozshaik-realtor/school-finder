// Server-side Supabase client for Server Components, Server Actions, and
// Route Handlers. Still uses only the anon key -- the authenticated
// user's own session (from cookies) is what grants elevated access,
// enforced by RLS + is_admin()/is_editor_or_admin() on the database side.
// This file must NEVER read SUPABASE_SERVICE_ROLE_KEY.
import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export async function createClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component where cookies can't be
            // written. The proxy.ts session-refresh handler covers this;
            // see that file for why it's required.
          }
        },
      },
    }
  );
}

/**
 * Resolves the current user AND their application role in one call,
 * re-validating the session against the Auth server (supabase.auth.getUser()
 * rather than getSession()) so a stale or tampered cookie can't grant
 * access. Use this everywhere an admin/editor check is needed server-side.
 */
export async function getCurrentUserWithRole() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { user: null, role: null as null | "user" | "editor" | "admin" };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  return { user: userData.user, role: profile?.role ?? "user" };
}
