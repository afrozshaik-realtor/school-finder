import { describe, it, expect } from "vitest";
import { addressSearchSchema, schoolFilterSchema } from "@/lib/validation/search";
import { createSourceSchema, createAuthoritySchema, createSchoolSchema, createProgramSchema } from "@/lib/validation/admin";

describe("addressSearchSchema", () => {
  it("accepts a minimal valid search", () => {
    const parsed = addressSearchSchema.safeParse({ address: "123 Example St" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.schoolYear).toBe("2025-26"); // default applied
      expect(parsed.data.includeDemo).toBe(false);
    }
  });

  it("rejects an address shorter than 3 characters", () => {
    expect(addressSearchSchema.safeParse({ address: "ab" }).success).toBe(false);
  });

  it("rejects a malformed school year", () => {
    expect(addressSearchSchema.safeParse({ address: "123 Example St", schoolYear: "2025" }).success).toBe(false);
  });

  it("accepts an explicit valid school year and includeDemo flag", () => {
    const parsed = addressSearchSchema.safeParse({ address: "123 Example St", schoolYear: "2026-27", includeDemo: true });
    expect(parsed.success).toBe(true);
  });
});

describe("schoolFilterSchema", () => {
  it("rejects a city outside the app's coverage", () => {
    expect(schoolFilterSchema.safeParse({ city: "Edmonton" }).success).toBe(false);
  });

  it("accepts an empty filter set", () => {
    const parsed = schoolFilterSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it("rejects a malformed authorityId (must be a uuid)", () => {
    expect(schoolFilterSchema.safeParse({ authorityId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("admin create-record schemas", () => {
  it("createSourceSchema requires name + organization, everything else optional", () => {
    expect(createSourceSchema.safeParse({ name: "X", organization: "Y" }).success).toBe(true);
    expect(createSourceSchema.safeParse({ name: "X" }).success).toBe(false);
  });

  it("createSourceSchema rejects a malformed last_verified_at", () => {
    expect(
      createSourceSchema.safeParse({ name: "X", organization: "Y", last_verified_at: "not-a-date" }).success
    ).toBe(false);
  });

  it("createAuthoritySchema requires a valid authority_type and source_id uuid", () => {
    expect(
      createAuthoritySchema.safeParse({ name: "X", authority_type: "public", source_id: "00000000-0000-0000-0000-000000000000" })
        .success
    ).toBe(true);
    expect(createAuthoritySchema.safeParse({ name: "X", authority_type: "nonsense", source_id: "x" }).success).toBe(false);
  });

  it("createSchoolSchema requires a valid city", () => {
    const base = {
      authority_id: "00000000-0000-0000-0000-000000000000",
      name: "Test School",
      school_type: "public",
      grade_min: "K",
      grade_max: "6",
      address: "1 Test St",
      source_id: "00000000-0000-0000-0000-000000000000",
    };
    expect(createSchoolSchema.safeParse({ ...base, city: "Calgary" }).success).toBe(true);
    expect(createSchoolSchema.safeParse({ ...base, city: "Edmonton" }).success).toBe(false);
  });

  it("createProgramSchema allows optional grade/program_code/notes but requires school_id and source_id", () => {
    expect(
      createProgramSchema.safeParse({
        school_id: "00000000-0000-0000-0000-000000000000",
        program_name: "French Immersion",
        source_id: "00000000-0000-0000-0000-000000000000",
      }).success
    ).toBe(true);
    expect(createProgramSchema.safeParse({ program_name: "French Immersion" }).success).toBe(false);
  });
});
