import { expect, test } from "../../test";
import { brandUrl, MENTIONS_ANALYSED_ANSWERS, MENTIONS_BRAND_ID } from "../../fixtures";

const MENTIONS_URL = `${brandUrl(MENTIONS_BRAND_ID)}/mentions`;

/** prominence = 1 − (offset of the first mention / answer length), averaged over the answers that name it. */
function prominence(name: string): string {
  const scores = MENTIONS_ANALYSED_ANSWERS.map((answer) => answer.toLowerCase())
    .filter((answer) => answer.includes(name.toLowerCase()))
    .map((answer) => 1 - answer.indexOf(name.toLowerCase()) / answer.length);
  return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
}

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
    await expect(page.getByText("they can differ from Visibility and Share of Voice").first()).toBeVisible();
  });

  test("shows each brand's mentions, rate, prominence and rank over the analysed runs only", async ({ page }) => {
    const row = (name: string) => page.locator(`[data-subject="${name}"]`);
    const cells = async (name: string) => (await row(name).locator("td").allInnerTexts()).map((t) => t.trim());

    // Initrode is named only in the two runs that aren't analysed, so it must show nothing.
    await expect(row("Initrode")).toBeVisible();
    expect(await cells("Northwind")).toEqual(["Northwind\nYou", "2 of 4", "50%", prominence("Northwind"), "2.0"]);
    expect(await cells("Contoso")).toEqual(["Contoso", "2 of 4", "50%", prominence("Contoso"), "1.5"]);
    expect(await cells("Fabrikam")).toEqual(["Fabrikam", "2 of 4", "50%", prominence("Fabrikam"), "1.5"]);
    expect(await cells("Initrode")).toEqual(["Initrode", "0 of 4", "0%", "—", "—"]);
  });

  test("is reachable from the sidebar", async ({ page }) => {
    await page.goto(brandUrl(MENTIONS_BRAND_ID));
    await page.getByRole("link", { name: "Mentions" }).click();
    await expect(page).toHaveURL(/\/mentions$/);
  });
});
