import { z } from "zod";

// Shared validation for the admin create-record forms
// (src/app/admin/{sources,authorities,schools,programs}). These mirror
// the CSV row shapes in scripts/import-*.ts so the same rules apply
// whether a record comes in one at a time through the UI or in bulk
// through a script.

const optionalUrl = z.string().trim().url().optional().or(z.literal(""));
const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
  .optional()
  .or(z.literal(""));

export const createSourceSchema = z.object({
  name: z.string().trim().min(1),
  organization: z.string().trim().min(1),
  source_url: optionalUrl,
  license: z.string().trim().optional().or(z.literal("")),
  license_url: optionalUrl,
  coverage_description: z.string().trim().optional().or(z.literal("")),
  authorization_notes: z.string().trim().optional().or(z.literal("")),
  last_verified_at: optionalDate,
});

export const createAuthoritySchema = z.object({
  name: z.string().trim().min(1),
  authority_type: z.enum(["public", "catholic", "private", "charter"]),
  website: optionalUrl,
  phone: z.string().trim().optional().or(z.literal("")),
  source_id: z.string().uuid("Select a data source"),
});

export const createSchoolSchema = z.object({
  authority_id: z.string().uuid("Select an authority"),
  name: z.string().trim().min(1),
  school_type: z.enum(["public", "catholic", "private", "charter"]),
  grade_min: z.string().trim().min(1),
  grade_max: z.string().trim().min(1),
  address: z.string().trim().min(1),
  city: z.enum(["Calgary", "Airdrie", "Chestermere", "Cochrane"]),
  postal_code: z.string().trim().optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  website: optionalUrl,
  source_id: z.string().uuid("Select a data source"),
});

export const createProgramSchema = z.object({
  school_id: z.string().uuid("Select a school"),
  program_name: z.string().trim().min(1),
  program_code: z.string().trim().optional().or(z.literal("")),
  grade_min: z.string().trim().optional().or(z.literal("")),
  grade_max: z.string().trim().optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal("")),
  source_id: z.string().uuid("Select a data source"),
});
