import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, getCurrentUserWithRole } from "@/lib/supabase/server";
import { checkRateLimit, adminWriteKey } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ versionId: z.string().uuid() });

export async function POST(request: NextRequest) {
  const { user, role } = await getCurrentUserWithRole();
  if (!user || (role !== "admin" && role !== "editor")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!checkRateLimit(adminWriteKey(user.id)).allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  // The RPC re-checks is_editor_or_admin() itself (SECURITY DEFINER); this
  // route's own role check above is a fast-fail, not the authority.
  const { error } = await supabase.rpc("publish_boundary_version", {
    version_id: parsed.data.versionId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ status: "ok" });
}
