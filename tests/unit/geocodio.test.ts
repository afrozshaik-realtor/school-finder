import { describe, it, expect, vi, afterEach } from "vitest";
import { createGeocodioProvider } from "@/lib/geocoding/geocodio";

function fakeResult(overrides: Partial<{ formatted_address: string; lat: number; lng: number; accuracy: number; accuracy_type: string }>) {
  return {
    formatted_address: overrides.formatted_address ?? "123 Example St, Calgary, AB, 51.05,-114.07",
    location: { lat: overrides.lat ?? 51.05, lng: overrides.lng ?? -114.07 },
    accuracy: overrides.accuracy ?? 1,
    accuracy_type: overrides.accuracy_type ?? "rooftop",
    address_components: { city: "Calgary", state_province: "AB", postal_code: "T1T 1T1" },
  };
}

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
    })
  );
}

describe("Geocodio provider -- never invents a coordinate", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 'ok' with the single clear result when confidence is high and unambiguous", async () => {
    mockFetchOnce({ results: [fakeResult({ accuracy: 1 })] });
    const provider = createGeocodioProvider("fake-key");
    const result = await provider.geocode("123 Example St, Calgary, AB");
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.candidate.latitude).toBe(51.05);
      expect(result.candidate.longitude).toBe(-114.07);
      expect(result.candidate.city).toBe("Calgary");
    }
  });

  it("returns 'no_results' (never a guessed coordinate) when the provider finds nothing", async () => {
    mockFetchOnce({ results: [] });
    const provider = createGeocodioProvider("fake-key");
    const result = await provider.geocode("not a real address at all");
    expect(result.status).toBe("no_results");
  });

  it("returns 'ambiguous' when two results are too close in confidence to pick one", async () => {
    mockFetchOnce({
      results: [fakeResult({ accuracy: 0.9, formatted_address: "A" }), fakeResult({ accuracy: 0.88, formatted_address: "B" })],
    });
    const provider = createGeocodioProvider("fake-key");
    const result = await provider.geocode("123 Ambiguous St");
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidates.length).toBe(2);
    }
  });

  it("returns 'ambiguous' when the single best result is itself low-confidence", async () => {
    mockFetchOnce({ results: [fakeResult({ accuracy: 0.5 })] });
    const provider = createGeocodioProvider("fake-key");
    const result = await provider.geocode("vague address");
    expect(result.status).toBe("ambiguous");
  });

  it("returns 'provider_error' (not a crash, not a fabricated result) on an HTTP error", async () => {
    mockFetchOnce({ error: "invalid API key" }, false, 403);
    const provider = createGeocodioProvider("bad-key");
    const result = await provider.geocode("123 Example St");
    expect(result.status).toBe("provider_error");
    if (result.status === "provider_error") {
      expect(result.message).toContain("invalid API key");
    }
  });

  it("returns 'provider_error' on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const provider = createGeocodioProvider("fake-key");
    const result = await provider.geocode("123 Example St");
    expect(result.status).toBe("provider_error");
  });
});
