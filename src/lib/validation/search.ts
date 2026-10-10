import { z } from "zod";

export const addressSearchSchema = z.object({
  address: z.string().trim().min(3, "Enter a street address").max(200),
  schoolYear: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "School year must look like 2025-26")
    .default("2025-26"),
  programScope: z.string().max(50).nullable().optional(),
  includeDemo: z.boolean().default(false),
});

export type AddressSearchInput = z.infer<typeof addressSearchSchema>;

export const schoolFilterSchema = z.object({
  city: z.enum(["Calgary", "Airdrie", "Chestermere", "Cochrane"]).optional(),
  schoolType: z.enum(["public", "catholic", "private", "charter"]).optional(),
  grade: z.string().max(3).optional(), // 'K'..'12'
  program: z.string().max(100).optional(),
  authorityId: z.string().uuid().optional(),
  includeDemo: z.boolean().default(false),
});

export type SchoolFilterInput = z.infer<typeof schoolFilterSchema>;
