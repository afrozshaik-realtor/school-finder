import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";

/**
 * Reads a CSV file into an array of plain-string-keyed records (header
 * row required). Every value comes back as a string or undefined --
 * callers validate/coerce with zod so a malformed row is rejected with a
 * clear reason instead of silently becoming NaN/undefined downstream.
 */
export function readCsv(path: string): Record<string, string>[] {
  const raw = readFileSync(path, "utf-8");
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, string>[];
}
