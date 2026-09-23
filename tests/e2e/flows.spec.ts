import { expect, test, type Page } from "@playwright/test";
import type { PublicBench } from "../../src/features/benches/queries";
import { mkdir } from "node:fs/promises";

async function capture(page: Page, name: string) {
  if (process.env.CAPTURE_DEMO_SCREENSHOTS !== "1") return;
  await mkdir(".context", { recursive: true });
  await page.getByRole("heading", { level: 1 }).click();
  if (await page.locator(".leaflet-container").count())
    await page
      .locator(".leaflet-tile-loaded")
      .first()
      .waitFor({ timeout: 10_000 })
      .catch(() => {});
  await page.screenshot({ path: `.context/${name}.png`, fullPage: true });
}

test.beforeEach(async ({ page }) => {
  // The accessible inventory must work even if the third-party basemap is offline.
  if (process.env.CAPTURE_DEMO_SCREENSHOTS !== "1")
    await page.route("**tile.openstreetmap.org/**", (route) => route.abort());
});
async function openStaff(page: Page) {
  await page.goto("/staff");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".staff-main .stat strong").first()).toHaveText(
    /\d+/,
  );
  if (page.viewportSize()!.width > 760)
    await capture(page, "staff-overview-desktop");
}

test("a guest can find a bench, adopt it anonymously, and see persisted availability", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await request.get("/api/benches");
  const { benches }: { benches: PublicBench[] } = await response.json();
  expect(benches).toHaveLength(520);
  const bench = benches.find((b) => b.availability === "available")!;
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /^VCP-/ }).first(),
  ).toBeVisible();
  await page.locator(".leaflet-container").waitFor();
  await capture(page, "bench-registry-desktop");
  await page.getByLabel("Filter by availability").selectOption("available");
  await page.getByRole("textbox", { name: "Search benches" }).fill(bench.code);
  await expect(page).toHaveURL(new RegExp(`q=${bench.code}.*status=available`));
  await page
    .getByRole("button", { name: new RegExp(`^${bench.code},`) })
    .click();
  await page.getByRole("link", { name: "View & adopt" }).click();
  await page.getByLabel("Contact name").fill("Private Browser Donor");
  await page.getByLabel("Email address").fill("private-browser@example.com");
  await page.getByLabel("Show me as an anonymous supporter").check();
  await page.getByLabel("Duration unit").selectOption("months");
  await page
    .getByRole("spinbutton", { name: "Duration", exact: true })
    .fill("3");
  await page.getByRole("button", { name: "Confirm adoption" }).click();
  await expect(
    page.getByRole("heading", { name: "Thank you for supporting the park." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Anonymous supporter", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm adoption" }),
  ).toHaveCount(0);
  const publicResponse = await request.get(`/api/benches/${bench.code}`);
  expect(await publicResponse.text()).not.toContain(
    "private-browser@example.com",
  );
  expect(errors).toEqual([]);
});

test("staff can add, adopt, renew, correct a donor, cancel, and retire a bench", async ({
  page,
}) => {
  await openStaff(page);
  await page.getByRole("link", { name: "Benches", exact: true }).click();
  await page.getByRole("button", { name: "Add bench", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Bench code").fill("E2E-001");
  await dialog
    .getByLabel("Location description")
    .fill("A bench beside the south entrance");
  await dialog.getByLabel("Latitude", { exact: true }).fill("40.8895");
  await dialog.getByLabel("Longitude", { exact: true }).fill("-73.8965");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("link", { name: "Adoptions", exact: true }).click();
  await page.getByRole("button", { name: "Add adoption" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Bench", { exact: true }).selectOption("E2E-001");
  await dialog.getByLabel("Contact name").fill("Browser Donor");
  await dialog.getByLabel("Contact email").fill("browser-donor@example.com");
  await dialog.getByLabel("Public display name").fill("The Browser Family");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel("Search adoptions").fill("E2E-001");
  const row = page.getByRole("row").filter({ hasText: "E2E-001" });
  await row.getByRole("button", { name: "Renew", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Additional months").fill("6");
  await page.getByRole("button", { name: "Confirm renewal" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await row
    .getByRole("button", { name: "History for adoption on E2E-001" })
    .click();
  await expect(
    page.getByRole("dialog").getByText("renew", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByText(/Demo staff/)
      .first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Donors", exact: true }).click();
  await page.getByLabel("Search donors").fill("browser-donor@example.com");
  await page.getByRole("button", { name: "Edit contact" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Contact name")
    .fill("Corrected Browser Donor");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes" })
    .click();
  await expect(
    page.getByText("Corrected Browser Donor", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "1 adoption", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("The Browser Family");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Adoptions", exact: true }).click();
  await page.getByLabel("Search adoptions").fill("E2E-001");
  await page
    .getByRole("row")
    .filter({ hasText: "E2E-001" })
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel adoption", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: "E2E-001" }),
  ).toContainText("Cancelled");
  await page.getByRole("link", { name: "Benches", exact: true }).click();
  await page.getByLabel("Search benches", { exact: true }).fill("E2E-001");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Operational state")
    .selectOption("retired");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes" })
    .click();
  await expect(
    page.getByRole("row").filter({ hasText: "E2E-001" }),
  ).toContainText("Retired");
  expect((await page.request.get("/api/admin/records")).status()).toBe(200);
});

test("staff can preview and commit a CSV and download a filtered export", async ({
  page,
}) => {
  await openStaff(page);
  await page.getByRole("link", { name: "Import records", exact: true }).click();
  const file = {
    name: "benches.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "bench_code,description,latitude,longitude,state\nE2E-CSV,CSV browser bench,40.8895,-73.8965,in_service\n",
    ),
  };
  await page.getByLabel("CSV file").setInputFiles(file);
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(
    page.getByRole("heading", { name: "Import preview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "CSV browser bench" }),
  ).toContainText("created");
  await capture(page, "import-preview-desktop");
  expect((await page.request.get("/api/benches/E2E-CSV")).status()).toBe(404);
  await page.getByRole("button", { name: "Confirm import" }).click();
  await expect(
    page.getByRole("heading", { name: "Import saved" }),
  ).toBeVisible();
  expect((await page.request.get("/api/benches/E2E-CSV")).status()).toBe(200);
  await page.getByRole("link", { name: "Benches", exact: true }).click();
  await page.getByLabel("Search benches", { exact: true }).fill("E2E-CSV");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toBe("benches.csv");
  const response = await page.request.get(
    "/api/admin/exports/benches?q=E2E-CSV",
  );
  expect((await response.text()).trim().split("\n")).toHaveLength(2);
});

test("staff tools are open and forged cross-origin writes are rejected", async ({
  page,
  request,
}) => {
  await page.goto("/staff/donors");
  await expect(page).toHaveURL(/\/staff\/donors/);
  await expect(
    page.getByRole("heading", { name: "Donors", exact: true }),
  ).toBeVisible();
  for (const endpoint of ["records", "exports/donors", "templates/adoptions"])
    expect((await request.get(`/api/admin/${endpoint}`)).status()).toBe(200);
  const forbidden = await request.post("/api/adoptions", {
    headers: { origin: "https://attacker.example" },
    data: {},
  });
  expect(forbidden.status()).toBe(403);
});

test("mobile inventory, keyboard selection, and the open staff workspace remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /^VCP-/ }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await capture(page, "bench-registry-mobile");
  const first = page.getByRole("button", { name: /^VCP-/ }).first();
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".selection-bar")).toBeVisible();
  await page.getByRole("button", { name: "Map view", exact: true }).click();
  await expect(page.locator(".map-section")).toBeVisible();
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(first).toBeVisible();
  await openStaff(page);
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
});

test("failed catalog requests and empty searches offer a working recovery", async ({
  page,
}) => {
  await page.route("**/api/benches", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "The registry is temporarily unavailable.",
      }),
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("alert").filter({ hasText: "temporarily unavailable" }),
  ).toBeVisible();
  await page.unroute("**/api/benches");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^VCP-/ }).first(),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search benches" })
    .fill("no-bench-matches-this-search");
  await expect(
    page.getByRole("heading", { name: "No benches match" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(
    page.getByRole("button", { name: /^VCP-/ }).first(),
  ).toBeVisible();
  if (process.env.CAPTURE_DEMO_SCREENSHOTS !== "1")
    await expect(
      page.getByText(
        "Base map unavailable. Bench locations and the list still work.",
      ),
    ).toBeVisible();
});

test("pagination recovers when refreshed results remove the final page", async ({
  page,
}) => {
  let benches: PublicBench[] = Array.from({ length: 41 }, (_, index) => ({
    id: `pagination-${index + 1}`,
    code: `PAGE-${String(index + 1).padStart(3, "0")}`,
    description: "Pagination test bench",
    latitude: 40.8895,
    longitude: -73.8965,
    area: "Van Cortlandt Pool",
    state: "in_service",
    source: "sample",
    adoption: null,
    availability: "available",
  }));
  await page.route("**/api/benches", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ benches }),
    }),
  );
  await page.goto("/?status=available");
  const pagination = page.locator(".pagination");
  const previous = pagination.getByRole("button", { name: "Previous" });
  const next = pagination.getByRole("button", { name: "Next" });
  await expect(pagination).toContainText("1–20 of 41");
  await next.click();
  await next.click();
  await expect(pagination).toContainText("41–41 of 41");

  // Refreshing unchanged data must preserve a valid page selection.
  const unchangedRefresh = page.waitForResponse("**/api/benches");
  await page.getByRole("button", { name: "Refresh availability" }).click();
  await unchangedRefresh;
  await expect(pagination).toContainText("41–41 of 41");

  benches = benches.slice(0, 21);
  await page.getByRole("button", { name: "Refresh availability" }).click();
  await expect(pagination).toContainText("21–21 of 21");
  await expect(page.getByRole("button", { name: /^PAGE-021,/ })).toBeVisible();
  await expect(next).toBeDisabled();

  // Navigation must start from the clamped page, not the old third page.
  await previous.click();
  await expect(pagination).toContainText("1–20 of 21");
  await expect(page.getByRole("button", { name: /^PAGE-001,/ })).toBeVisible();
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(pagination).toContainText("21–21 of 21");
});

test("a stale adoption form explains the conflict and preserves entered details", async ({
  page,
  request,
}) => {
  const { benches }: { benches: PublicBench[] } = await (
    await request.get("/api/benches")
  ).json();
  const bench = benches.find((b) => b.availability === "available")!;
  await page.goto(`/benches/${bench.code}`);
  await page.getByLabel("Contact name").fill("Waiting Donor");
  await page.getByLabel("Email address").fill("waiting@example.com");
  await page.getByLabel("Public display name").fill("Waiting Supporter");
  const winner = await request.post("/api/adoptions", {
    headers: { origin: "http://localhost:3100" },
    data: {
      benchCode: bench.code,
      name: "First Donor",
      email: "first@example.com",
      publicName: "First Supporter",
      months: 1,
      requestId: crypto.randomUUID(),
    },
  });
  expect(winner.ok()).toBe(true);
  await page.getByRole("button", { name: "Confirm adoption" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "already has an adoption" }),
  ).toBeVisible();
  await expect(page.getByLabel("Contact name")).toHaveValue("Waiting Donor");
  await expect(page.getByLabel("Email address")).toHaveValue(
    "waiting@example.com",
  );
  await expect(
    page.getByRole("heading", { name: "Thank you for supporting the park." }),
  ).toHaveCount(0);
});
