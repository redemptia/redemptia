import { expect, test } from "../../test";
import { brandUrl, MENTIONS_BRAND_ID } from "../../fixtures";

const MENTIONS_URL = `${brandUrl(MENTIONS_BRAND_ID)}/mentions`;

test.describe("Mentions page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(MENTIONS_URL);
    await expect(page.getByRole("heading", { name: "Mentions" })).toBeVisible({ timeout: 30_000 });
  });

  test("says how many runs are analysed, and that the rest are left out rather than counted as zero", async ({ page }) => {
    const coverage = page.getByTestId("mention-coverage");
    await expect(coverage).toContainText("4 of 6 runs in this window are analysed");
    await expect(coverage).toContainText("not the same as not mentioning anyone");
    await expect(coverage).toContainText("it can rise while you watch");
    await expect(page.getByTestId("mention-none-analysed")).toHaveCount(0);
    await expect(page.getByText("they can differ from Visibility and Share of Voice").first()).toBeVisible();
  });

  test("shows each brand's mentions, rate, prominence and rank over the analysed runs only", async ({ page }) => {
    const row = (name: string) => page.locator(`[data-subject="${name}"]`);
    const cells = async (name: string) => (await row(name).locator("td").allInnerTexts()).map((t) => t.trim());

    // Prominence is 1 − (first offset / length), averaged over the answers that
    // name the brand: computed by hand from MENTIONS_ANALYSED_ANSWERS.
    // Initrode is named only in the two runs that aren't analysed, so it must show nothing.
    await expect(row("Initrode")).toBeVisible();
    await expect(row("Northwind").locator("td").first()).toHaveText(/Northwind\s*You/);
    expect((await cells("Northwind")).slice(1)).toEqual(["2 of 4", "50%", "0.60", "2.0"]);
    expect(await cells("Contoso")).toEqual(["Contoso", "2 of 4", "50%", "0.58", "1.5"]);
    expect(await cells("Fabrikam")).toEqual(["Fabrikam", "2 of 4", "50%", "0.88", "1.5"]);
    expect(await cells("Initrode")).toEqual(["Initrode", "0 of 4", "0%", "—", "—"]);
  });

  test("is reachable from the sidebar", async ({ page }) => {
    await page.goto(brandUrl(MENTIONS_BRAND_ID));
    await page.getByRole("link", { name: "Mentions" }).click();
    await expect(page).toHaveURL(/\/mentions$/);
  });
});
