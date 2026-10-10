import { getServerEnv } from "@/lib/env";
import { createGeocodioProvider } from "./geocodio";
import type { GeocodingProvider } from "./types";

export type { GeocodeCandidate, GeocodeResult, GeocodingProvider } from "./types";

const SUPPORTED_CITIES = ["Calgary", "Airdrie", "Chestermere", "Cochrane"] as const;
export type SupportedCity = (typeof SUPPORTED_CITIES)[number];

/**
 * Returns the configured geocoding provider, or null if none is
 * configured. Callers must render an explicit "address search is
 * currently unavailable" state when this returns null -- never fall back
 * to inventing coordinates.
 */
export function getGeocodingProvider(): GeocodingProvider | null {
  const env = getServerEnv();
  if (env.GEOCODING_PROVIDER === "geocodio") {
    if (!env.GEOCODIO_API_KEY) return null;
    return createGeocodioProvider(env.GEOCODIO_API_KEY);
  }
  return null;
}

/**
 * This app only covers Calgary, Airdrie, Chestermere, and Cochrane. A
 * geocode result in a different city is a real, successfully-resolved
 * address -- just outside scope -- and must be reported as such rather
 * than silently searched against boundary data that doesn't cover it.
 */
export function cityInScope(city: string | null): city is SupportedCity {
  if (!city) return false;
  return SUPPORTED_CITIES.includes(city as SupportedCity);
}

export { SUPPORTED_CITIES };
