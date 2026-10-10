import { NextResponse, type NextRequest } from "next/server";
import { createSchoolSchema } from "@/lib/validation/admin";
import { createClient, getCurrentUserWithRole } from "@/lib/supabase/server";
import { checkRateLimit, adminWriteKey } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { user, role } = await getCurrentUserWithRole();
  if (!user || (role !== "admin" && role !== "editor")) {
    return NextResponse.json({ error: "Editor or admin role required." }, { status: 403 });
  }
  if (!checkRateLimit(adminWriteKey(user.id)).allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchoolSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("schools")
    .insert({
      authority_id: d.authority_id,
      name: d.name,
      school_type: d.school_type,
      grade_min: d.grade_min,
      grade_max: d.grade_max,
      address: d.address,
      city: d.city,
      postal_code: d.postal_code || null,
      phone: d.phone || null,
      website: d.website || null,
      source_id: d.source_id,
      is_demo: false,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ status: "ok", school: data });
}
