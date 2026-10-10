import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { addressSearchSchema } from "@/lib/validation/search";
import { checkRateLimit, clientKeyFromHeaders } from "@/lib/rateLimit";
import { createClient } from "@/lib/supabase/server";
import { runSearch } from "@/lib/search/runSearch";
import { SearchReportDocument } from "@/lib/pdf/SearchReportDocument";

export const dynamic = "force-dynamic";

// PDF generation is heavier than a JSON search -- rate-limit it under its
// own key so it can't be used to multiply a user's effective request
// budget beyond /api/search's limit.
export async function POST(request: NextRequest) {
  const rate = checkRateLimit(`pdf:${clientKeyFromHeaders(request.headers)}`);
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

  if (outcome.status !== "ok") {
    // No PDF for an address that didn't resolve to an in-scope result --
    // a PDF implies "here is a documented answer," which doesn't exist
    // yet for no_results/ambiguous/out_of_scope/provider_error states.
    return NextResponse.json(
      {
        error:
          "A PDF report is only available for a successfully resolved, in-scope address. Resolve the address in the search UI first.",
        status: outcome.status,
      },
      { status: 422 }
    );
  }

  const generatedAt = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const buffer = await renderToBuffer(
    SearchReportDocument({ result: outcome, includeDemo: parsed.data.includeDemo, generatedAt })
  );

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="schoolfinder-report.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
