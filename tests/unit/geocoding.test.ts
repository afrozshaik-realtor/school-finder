import { describe, it, expect, beforeEach, vi } from "vitest";

describe("cityInScope / SUPPORTED_CITIES", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("accepts every supported city and rejects anything else", async () => {
    const { cityInScope, SUPPORTED_CITIES } = await import("@/lib/geocoding");
    for (const city of SUPPORTED_CITIES) {
      expect(cityInScope(city)).toBe(true);
    }
    expect(cityInScope("Edmonton")).toBe(false);
    expect(cityInScope(null)).toBe(false);
  });
});

describe("getGeocodingProvider", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns null when GEOCODING_PROVIDER is unset -- the API route must render 'unavailable', never guess", async () => {
    delete process.env.GEOCODING_PROVIDER;
    delete process.env.GEOCODIO_API_KEY;
    const { getGeocodingProvider } = await import("@/lib/geocoding");
    expect(getGeocodingProvider()).toBeNull();
  });

  it("returns null when GEOCODING_PROVIDER=geocodio but no API key is configured", async () => {
    process.env.GEOCODING_PROVIDER = "geocodio";
    delete process.env.GEOCODIO_API_KEY;
    const { getGeocodingProvider } = await import("@/lib/geocoding");
    expect(getGeocodingProvider()).toBeNull();
  });

  it("returns a working Geocodio provider once both are configured", async () => {
    process.env.GEOCODING_PROVIDER = "geocodio";
    process.env.GEOCODIO_API_KEY = "test-key-not-real";
    const { getGeocodingProvider } = await import("@/lib/geocoding");
    const provider = getGeocodingProvider();
    expect(provider).not.toBeNull();
    expect(provider?.name).toBe("geocodio");
  });
});
