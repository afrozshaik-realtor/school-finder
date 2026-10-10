// PDF layout for a school-designation search result, built with
// @react-pdf/renderer (pure JS -- no headless browser, no network, no
// font download required: it uses PDF's built-in Helvetica).
//
// Hard rule: this component only ever renders fields that were present
// in the SearchOutcome ("ok" status) produced by runSearch() -- it never
// substitutes a guess for a missing source/date, and always prints the
// same "evidence unavailable" / "proximity is not eligibility" language
// used in the on-screen UI (see src/components/SchoolCard.tsx /
// StatusStates.tsx) so the PDF can't accidentally overstate certainty
// relative to what the app shows on screen.
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { SearchOutcome, SourceRecord } from "@/lib/search/runSearch";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#1e293b" },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#64748b", marginBottom: 12 },
  demoBanner: {
    backgroundColor: "#fdf4ff",
    borderWidth: 1,
    borderColor: "#e9b8f4",
    color: "#86198f",
    padding: 8,
    marginBottom: 12,
    fontSize: 9,
    fontWeight: 700,
  },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginTop: 14, marginBottom: 6 },
  summaryBox: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 10,
    marginBottom: 6,
    borderRadius: 4,
  },
  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
  schoolName: { fontSize: 11, fontWeight: 700 },
  badge: { fontSize: 8, fontWeight: 700, marginTop: 2 },
  badgeDesignated: { color: "#065f46" },
  badgeNoneConfirmed: { color: "#334155" },
  badgeUnavailable: { color: "#92400e" },
  row: { flexDirection: "row", marginTop: 3 },
  label: { width: 90, color: "#64748b" },
  value: { flex: 1 },
  footerNote: { fontSize: 8, color: "#64748b", marginTop: 3 },
  provenance: { fontSize: 8, color: "#94a3b8", marginTop: 4, borderTopWidth: 1, borderTopColor: "#f1f5f9", paddingTop: 4 },
  disclaimer: {
    marginTop: 18,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
    fontSize: 8,
    color: "#475569",
  },
});

function badgeStyleFor(status: "designated" | "none_confirmed" | "unavailable" | null) {
  if (status === "designated") return [styles.badge, styles.badgeDesignated];
  if (status === "none_confirmed") return [styles.badge, styles.badgeNoneConfirmed];
  return [styles.badge, styles.badgeUnavailable];
}

function badgeLabelFor(status: "designated" | "none_confirmed" | "unavailable" | null) {
  if (status === "designated") return "DESIGNATED SCHOOL";
  if (status === "none_confirmed") return "CONFIRMED: NOT YOUR DESIGNATED SCHOOL";
  return "DESIGNATION DATA UNAVAILABLE";
}

function sourceLine(sourceId: string | null, sourcesById: Record<string, SourceRecord>): string {
  if (!sourceId) return "Source and verification date unavailable.";
  const s = sourcesById[sourceId];
  if (!s) return "Source and verification date unavailable.";
  const org = s.organization ? `, ${s.organization}` : "";
  const verified = s.last_verified_at ? ` -- last verified ${s.last_verified_at}` : "";
  return `Source: ${s.name}${org}${verified}.`;
}

export function SearchReportDocument({
  result,
  includeDemo,
  generatedAt,
}: {
  result: SearchOutcome & { status: "ok" };
  includeDemo: boolean;
  generatedAt: string;
}) {
  return (
    <Document title="SchoolFinder search report">
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>SchoolFinder: Calgary &amp; Airdrie -- Search Report</Text>
        <Text style={styles.subtitle}>Generated {generatedAt}</Text>

        {includeDemo && (
          <Text style={styles.demoBanner}>
            DEMO REPORT -- every school, address, and boundary below is fictional and exists only
            to demonstrate the interface. It is not backed by any real data source.
          </Text>
        )}

        <View style={styles.summaryBox}>
          <View style={styles.row}>
            <Text style={styles.label}>Address</Text>
            <Text style={styles.value}>{result.resolvedAddress}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Coordinates</Text>
            <Text style={styles.value}>
              {result.coordinates.lat.toFixed(5)}, {result.coordinates.lon.toFixed(5)} (geocode
              accuracy: {result.geocodeAccuracy})
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>School designation</Text>
        {result.schools.length === 0 ? (
          <Text>No designation data is available for this location and school year yet.</Text>
        ) : (
          result.schools.map((s) => {
            const designation = result.designations.find((d) => d.school_id === s.id);
            const status = designation?.status ?? null;
            return (
              <View key={s.id} style={styles.card} wrap={false}>
                <Text style={styles.schoolName}>{s.name}</Text>
                <Text style={badgeStyleFor(status)}>{badgeLabelFor(status)}</Text>
                <View style={styles.row}>
                  <Text style={styles.label}>Type / grades</Text>
                  <Text style={styles.value}>
                    {s.school_type} &middot; {s.grade_min}-{s.grade_max}
                  </Text>
                </View>
                {s.school_authorities && (
                  <View style={styles.row}>
                    <Text style={styles.label}>Authority</Text>
                    <Text style={styles.value}>{s.school_authorities.name}</Text>
                  </View>
                )}
                <View style={styles.row}>
                  <Text style={styles.label}>Address</Text>
                  <Text style={styles.value}>{s.address}</Text>
                </View>
                {s.school_programs.length > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.label}>Programs</Text>
                    <Text style={styles.value}>{s.school_programs.map((p) => p.program_name).join(", ")}</Text>
                  </View>
                )}
                <Text style={styles.provenance}>{sourceLine(s.source_id, result.sourcesById)}</Text>
              </View>
            );
          })
        )}

        <Text style={styles.sectionTitle}>Nearby transit</Text>
        {result.nearbyStopsError ? (
          <Text>Transit data unavailable: {result.nearbyStopsError}</Text>
        ) : result.nearbyStops.length === 0 ? (
          <Text>No authorized transit stop data is available near this address.</Text>
        ) : (
          <View style={styles.card}>
            {result.nearbyStops.map((stop, i) => (
              <View key={i} style={styles.row}>
                <Text style={styles.value}>
                  {stop.stop_name} -- {(stop.distance_m / 1000).toFixed(2)} km ({stop.feed_name})
                </Text>
              </View>
            ))}
            <Text style={styles.footerNote}>
              Proximity to a stop is not the same as a valid school-bus route or eligibility --
              see the authorized eligibility data on each school above, if any.
            </Text>
          </View>
        )}

        <Text style={styles.disclaimer}>
          This report reflects officially published designation and transit data where available,
          and explicitly marks it as unavailable where it is not -- it never substitutes a guess
          for missing evidence. A geographic match is informational only and does not itself
          confirm admission or transportation eligibility; confirm directly with the school
          authority before relying on this for enrollment or transportation decisions.
        </Text>
      </Page>
    </Document>
  );
}
