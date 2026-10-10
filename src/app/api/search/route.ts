import { NextResponse, type NextRequest } from "next/server";
import { addressSearchSchema } from "@/lib/validation/search";
import { checkRateLimit, clientKeyFromHeaders } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";
import { runSearch } from "@/lib/search/runSearch";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rate = checkRateLimit(`search:${clientKeyFromHeaders(request.headers)}`);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a minute and try again." },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = addressSearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  let outcome;
  try {
    outcome = await runSearch(supabase, parsed.data);
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "Search failed." },
      { status: 500 }
    );
  }

  if (outcome.status === "provider_error") {
    return NextResponse.json(outcome, { status: 502 });
  }
  if (outcome.status === "geocoding_unavailable") {
    return NextResponse.json(outcome, { status: 503 });
  }
  return NextResponse.json(outcome);
}
