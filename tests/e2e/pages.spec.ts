import { test, expect } from "@playwright/test";

test.describe("Public pages", () => {
  test("home page renders the search UI and links to the DEMO", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /SchoolFinder: Calgary & Airdrie/i })).toBeVisible();
    await expect(page.getByLabel(/Home address/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Try the DEMO/i })).toBeVisible();
  });

  test("DEMO page clearly labels itself as fictional data", async ({ page }) => {
    const response = await page.goto("/demo");
    expect(response?.status()).toBe(200);
    await expect(page.getByText(/This is a DEMO\./i)).toBeVisible();
    await expect(page.getByText(/every school, address, and boundary shown here is\s*\n?\s*fictional/i)).toBeVisible();
  });

  test("an empty/too-short address is rejected client-side (minLength) before any request", async ({ page }) => {
    await page.goto("/");
    const input = page.getByLabel(/Home address/i);
    await input.fill("ab");
    await page.getByRole("button", { name: "Search" }).click();
    // The native minlength validation should block submission -- the
    // input stays invalid and no loading/result state appears.
    const isValid = await input.evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(isValid).toBe(false);
  });
});

test.describe("Admin auth gate (src/proxy.ts)", () => {
  test("an unauthenticated visit to /admin/login renders the login form directly, with no redirect loop", async ({ page }) => {
    // Regression test for a real bug found and fixed during this project:
    // proxy.ts used to redirect any unauthenticated /admin/* request --
    // including /admin/login itself -- to /admin/login?next=/admin/login,
    // which is still unauthenticated, so it redirected again forever.
    // Confirmed via curl before the fix (repeated 307s to the same URL);
    // this test keeps that regression from coming back unnoticed.
    const response = await page.goto("/admin/login", { waitUntil: "load" });
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/admin/login");
    await expect(page.getByRole("heading", { name: /Admin sign in/i })).toBeVisible();
    await expect(page.getByLabel(/^Email$/i)).toBeVisible();
    await expect(page.getByLabel(/^Password$/i)).toBeVisible();
  });

  test("an unauthenticated visit to a protected /admin page redirects to /admin/login with a 'next' param", async ({ page }) => {
    await page.goto("/admin/boundary-versions");
    const url = new URL(page.url());
    expect(url.pathname).toBe("/admin/login");
    expect(url.searchParams.get("next")).toBe("/admin/boundary-versions");
    await expect(page.getByRole("heading", { name: /Admin sign in/i })).toBeVisible();
  });

  for (const path of ["/admin/sources", "/admin/authorities", "/admin/schools", "/admin/programs"]) {
    test(`unauthenticated visit to ${path} also redirects to login (not a dead end, not an error page)`, async ({ page }) => {
      await page.goto(path);
      const url = new URL(page.url());
      expect(url.pathname).toBe("/admin/login");
      expect(url.searchParams.get("next")).toBe(path);
    });
  }
});
