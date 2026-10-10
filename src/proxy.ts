// Next.js 16 renamed `middleware.ts` to `proxy.ts` (same mechanism). This
// refreshes the Supabase auth session on every navigation so server
// components always see an up-to-date cookie, and gates /admin routes at
// the edge as a fast, OPTIMISTIC check only -- the authoritative
// authorization check still happens server-side via is_admin()/RLS on
// every read and write (see src/lib/supabase/server.ts). Never trust this
// check alone for anything sensitive.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = getPublicEnv();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data } = await supabase.auth.getUser();

  // Exclude /admin/login itself: without this, an unauthenticated visit
  // to /admin/login matches "starts with /admin" and gets redirected to
  // .../admin/login?next=/admin/login -- which is still unauthenticated,
  // so it redirects again, forever. Confirmed as a real infinite redirect
  // loop against a running server before this fix (curl showed
  // /admin/login -> 307 -> /admin/login?next=%2Fadmin%2Flogin -> repeats).
  if (
    request.nextUrl.pathname.startsWith("/admin") &&
    request.nextUrl.pathname !== "/admin/login" &&
    !data.user
  ) {
    const redirectUrl = new URL("/admin/login", request.url);
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets, so the session cookie stays
     * fresh app-wide, while skipping the overhead for images/fonts/etc.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
