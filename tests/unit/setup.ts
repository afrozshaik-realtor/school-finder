import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest.config.ts does not set test.globals = true, so
// @testing-library/react's automatic per-test DOM cleanup (which detects
// global afterEach) never registers. Without this, DOM from one test
// leaks into the next within the same file, which is exactly what caused
// several SchoolCard tests to see duplicate rendered cards and fail with
// "multiple elements found" the first time this suite was written.
afterEach(() => {
  cleanup();
});
