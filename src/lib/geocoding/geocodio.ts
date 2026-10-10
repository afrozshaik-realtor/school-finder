// Geocodio provider adapter. See docs/DATA_SOURCES.md for why Geocodio was
// chosen over Google/HERE/Mapbox/TomTom for this app (permanent-storage
// rights on the plan used here, Canada coverage, $1/1000 lookups after a
// 2,500/day free tier, no required monthly re-processing).
//
// API reference used: https://www.geocod.io/docs/ (GET /v2/geocode).
import type { GeocodeCandidate, GeocodeResult, GeocodingProvider } from "./types";

const GEOCODIO_ENDPOINT = "https://api.geocod.io/v2/geocode";

interface GeocodioAddressComponents {
  city?: string;
  state_province?: string;
  postal_code?: string;
}

interface GeocodioResultItem {
  formatted_address: string;
  location: { lat: number; lng: number };
  accuracy: number;
  accuracy_type: string;
  address_components: GeocodioAddressComponents;
}

interface GeocodioResponse {
  results: GeocodioResultItem[];
  error?: string;
}

function mapAccuracyType(accuracyType: string): GeocodeCandidate["accuracy"] {
  switch (accuracyType) {
    case "rooftop":
      return "rooftop";
    case "point":
    case "building_centroid":
    case "parcel_centroid":
      return "point";
    case "street_center":
    case "range_interpolation":
    case "nearest_rooftop_match":
      return "street";
    case "intersection":
      return "intersection";
    case "place":
    case "place_centroid":
    case "county_centroid":
    case "state_centroid":
      return "postal_code";
    default:
      return "unknown";
  }
}

function toCandidate(item: GeocodioResultItem): GeocodeCandidate {
  return {
    formattedAddress: item.formatted_address,
    latitude: item.location.lat,
    longitude: item.location.lng,
    accuracy: mapAccuracyType(item.accuracy_type),
    city: item.address_components.city ?? null,
    province: item.address_components.state_province ?? null,
    postalCode: item.address_components.postal_code ?? null,
  };
}

/**
 * A result counts as genuinely ambiguous (as opposed to "first result is
 * clearly best") when either:
 *   - the top accuracy score itself is below a high-confidence threshold
 *     (true even with only ONE candidate -- a single low-confidence match,
 *     e.g. a city/postal-code centroid rather than a real street-level
 *     match, must never be treated as a confident "ok" result), or
 *   - there are multiple candidates and a second one is close enough in
 *     score to the first that picking one over the other would be a guess.
 * This is a documented heuristic, not a provider-guaranteed signal --
 * Geocodio does not itself label results as "ambiguous".
 *
 * Caught by a unit test (tests/unit/geocodio.test.ts) during development:
 * an earlier version of this function returned early for `results.length
 * < 2`, before ever checking the single result's own confidence -- so a
 * lone low-confidence match was silently accepted as "ok" instead of
 * surfacing as "ambiguous".
 */
function isAmbiguous(results: GeocodioResultItem[]): boolean {
  if (results.length === 0) return false;
  const HIGH_CONFIDENCE = 0.8;
  const CLOSE_ENOUGH_GAP = 0.05;
  const [best, second] = results;
  if (best.accuracy < HIGH_CONFIDENCE) return true;
  if (second && best.accuracy - second.accuracy < CLOSE_ENOUGH_GAP) return true;
  return false;
}

export function createGeocodioProvider(apiKey: string): GeocodingProvider {
  return {
    name: "geocodio",
    async geocode(address: string): Promise<GeocodeResult> {
      const url = new URL(GEOCODIO_ENDPOINT);
      url.searchParams.set("q", address);
      url.searchParams.set("country", "CA");
      url.searchParams.set("limit", "5");
      url.searchParams.set("api_key", apiKey);

      let response: Response;
      try {
        response = await fetch(url.toString(), {
          method: "GET",
          // Geocoding results for a fixed address don't change; this lets
          // Next.js's fetch cache (and any upstream CDN) avoid re-billing
          // an identical lookup. See docs/DATA_SOURCES.md for Geocodio's
          // storage/caching terms that make this permissible.
          next: { revalidate: 60 * 60 * 24 * 30 },
        });
      } catch (err) {
        return {
          status: "provider_error",
          message: err instanceof Error ? err.message : "Network error contacting Geocodio",
        };
      }

      if (!response.ok) {
        let message = `Geocodio returned HTTP ${response.status}`;
        try {
          const body = (await response.json()) as GeocodioResponse;
          if (body.error) message = body.error;
        } catch {
          // ignore parse failure, keep the generic message
        }
        return { status: "provider_error", message };
      }

      let body: GeocodioResponse;
      try {
        body = (await response.json()) as GeocodioResponse;
      } catch {
        return { status: "provider_error", message: "Could not parse Geocodio response" };
      }

      if (!body.results || body.results.length === 0) {
        return { status: "no_results" };
      }

      const candidates = body.results.map(toCandidate);

      if (isAmbiguous(body.results)) {
        return { status: "ambiguous", candidates };
      }

      return { status: "ok", candidate: candidates[0], allCandidates: candidates };
    },
  };
}
