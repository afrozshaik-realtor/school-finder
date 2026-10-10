// Provider-agnostic geocoding contract. See docs/DATA_SOURCES.md for the
// comparison that led to choosing Geocodio as the default provider,
// including pricing, caching/storage rights, and Canada coverage.
//
// Hard rule enforced throughout this module: a coordinate is returned to
// the caller ONLY when a real provider response supplied it. There is no
// fallback path that invents or approximates coordinates for an address
// the provider could not resolve.

export interface GeocodeCandidate {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  accuracy: "rooftop" | "point" | "street" | "intersection" | "postal_code" | "unknown";
  city: string | null;
  province: string | null;
  postalCode: string | null;
}

export type GeocodeResult =
  | { status: "ok"; candidate: GeocodeCandidate; allCandidates: GeocodeCandidate[] }
  | { status: "ambiguous"; candidates: GeocodeCandidate[] }
  | { status: "no_results" }
  | { status: "provider_error"; message: string }
  | { status: "not_configured" };

export interface GeocodingProvider {
  readonly name: string;
  geocode(address: string): Promise<GeocodeResult>;
}
