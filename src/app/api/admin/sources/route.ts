import { NextResponse, type NextRequest } from "next/server";
import { createSourceSchema } from "@/lib/validation/admin";
import { createClient, getCurrentUserWithRole } from "@/lib/supabase/server";
import { checkRateLimit, adminWriteKey } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// Defense in depth: this app-level role check is a fast, friendly 403
// before even trying the write. The AUTHORITATIVE check is the
// data_sources_write_admin RLS policy (requires is_editor_or_admin()),
// which still applies to this insert regardless of this check -- a bug
// here can make the error message worse, never bypass the real gate.
export async function POST(request: NextRequest) {
  const { user, role } = await getCurrentUserWithRole();
  if (!user || (role !== "admin" && role !== "editor")) {
    return NextResponse.json({ error: "Editor or admin role required." }, { status: 403 });
  }
  if (!checkRateLimit(adminWriteKey(user.id)).allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSourceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("data_sources")
    .insert({
      name: d.name,
      organization: d.organization,
      source_url: d.source_url || null,
      license: d.license || null,
      license_url: d.license_url || null,
      coverage_description: d.coverage_description || null,
      authorization_notes: d.authorization_notes || null,
      last_verified_at: d.last_verified_at || null,
      is_demo: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ status: "ok", source: data });
}
