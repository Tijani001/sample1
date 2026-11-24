import { test, expect, type Page } from "@playwright/test";

const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function bookTrip(page: Page, { from, to, days, pax }: { from: string; to: string; days: number; pax: number }) {
  await page.goto(`/search?from=${from}&to=${to}&date=${inDays(days)}&pax=${pax}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.locator('a:has-text("Select")').filter({ visible: true }).first().click();
  await page.waitForURL(/\/book\?/);
  const free = page.locator('button[aria-label^="Seat"][aria-label$="available"], button[aria-label^="Seat"][aria-label*="available,"]');
  for (let i = 0; i < pax; i++) await free.nth(0).click();
  await page.getByRole("button", { name: /continue/i }).last().click();
  await page.waitForURL(/step=details/);
  await page.fill("#c-name", "Amina Yusuf");
  await page.fill("#c-email", `amina.${Date.now()}@example.com`);
  await page.fill("#c-phone", "08031112222");
  await page.fill("#p0-name", "Amina Yusuf");
  await page.fill("#p0-nok", "Musa Yusuf");
  await page.fill("#p0-nokp", "08033334444");
  for (let i = 1; i < pax; i++) await page.fill(`#p${i}-name`, `Traveller ${"BCDEFG"[i]}ello`);
  await page.getByRole("button", { name: /continue/i }).last().click();
  await page.waitForURL(/step=extras/);
  await page.getByRole("button", { name: /continue/i }).last().click();
  await page.waitForURL(/step=pay/);
  await page.locator('input[type="checkbox"]').check();
  await page.getByRole("button", { name: /^pay/i }).last().click();
  await page.waitForURL(/\/pay\/sandbox\//);
  await expect(page.getByText(/Sandbox payment gateway/)).toBeVisible();
}

test("guest searches, compares, books with seat selection and receives a ticket", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Where are you going next?" })).toBeVisible();
  await bookTrip(page, { from: "lagos", to: "ibadan", days: 4, pax: 2 });
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await page.waitForURL(/\/trips\/GR-[A-Z0-9]+\?confirmed=1/);
  await expect(page.getByText(/You're going to Ibadan/)).toBeVisible();
  await expect(page.getByLabel(/Ticket for/)).toHaveCount(2);
  const pdfHref = await page.locator('a:has-text("Download")').getAttribute("href");
  const pdf = await page.request.get(pdfHref!);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  const ics = await page.request.get(pdfHref!.replace("tickets", "calendar"));
  expect(await ics.text()).toContain("BEGIN:VCALENDAR");
});

test("search filters and sorting change the results", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "filter sidebar is desktop; mobile uses the sheet");
  await page.goto(`/search?from=lagos&to=abuja&date=${inDays(3)}&pax=1`);
  const count = page.locator("article");
  const before = await count.count();
  expect(before).toBeGreaterThan(1);
  await page.getByRole("tab", { name: "Cheapest" }).click();
  const prices = await page.locator("article").evaluateAll((els) => els.map((e) => Number((e.getAttribute("aria-label") ?? "").split("₦")[1]?.replace(/,/g, ""))));
  const bookable = prices.filter((p) => !Number.isNaN(p));
  expect(bookable.length).toBeGreaterThan(0);
  await page.locator("aside").getByText("Refundable fares").click();
  await expect(page.getByText(/of \d+ departures?/)).toBeVisible();
});

test("failed payment leaves the booking unpaid and offers a retry", async ({ page }) => {
  await bookTrip(page, { from: "abuja", to: "kaduna", days: 6, pax: 1 });
  await page.getByRole("button", { name: "Simulate failed payment" }).click();
  await expect(page.getByRole("heading", { name: "Payment not completed" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again" })).toBeVisible();
});

test("guest booking retrieval requires the matching contact details", async ({ page, browser }) => {
  await bookTrip(page, { from: "enugu", to: "owerri", days: 5, pax: 1 });
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await page.waitForURL(/\/trips\/GR-/);
  const ref = page.url().match(/GR-[A-Z0-9]+/)![0];
  const email = await page.locator("text=/@example.com/").first().textContent();
  const other = await browser.newPage();
  await other.goto(`/trips/${ref}`);
  await expect(other.getByRole("heading", { name: /Verify it's your booking/ })).toBeVisible();
  await other.fill("#contact", "wrong@example.com");
  await other.getByRole("button", { name: "Find my booking" }).click();
  await expect(other.getByText(/couldn't find a booking/)).toBeVisible();
  await other.fill("#contact", email!.replace(/^Contact: /, "").trim());
  await other.getByRole("button", { name: "Find my booking" }).click();
  await other.waitForURL(new RegExp(`/trips/${ref}$`));
  await expect(other.getByLabel(/Ticket for/)).toHaveCount(1);
});

test("admin areas are restricted by role", async ({ page }) => {
  await page.goto("/signin");
  await page.fill("#identifier", "finance@demo.goroada.app");
  await page.fill("#password", "goroada-demo");
  await page.click('button[type="submit"]');
  await page.waitForLoadState("networkidle");
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/admin\?denied=1/);
  await page.goto("/admin/refunds");
  await expect(page.getByRole("heading", { name: "Refunds" })).toBeVisible();
});
