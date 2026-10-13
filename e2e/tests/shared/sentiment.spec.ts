import type { TestInfo } from "@playwright/test";
import { expect, test } from "../../test";
import { brandUrl, MENTIONS_ANALYSED_ANSWERS, MENTIONS_BRAND_ID } from "../../fixtures";

const SENTIMENT_URL = `${brandUrl(MENTIONS_BRAND_ID)}/sentiment`;

// No e2e deployment has a sentiment key, so every mode reads the seeded
// judgements with model analysis off. In cloud the seeded org has no plan, so
// sentiment is refused there instead.
const skipInCloud = (testInfo: TestInfo) =>
  test.skip(testInfo.project.name === "cloud", "the seeded cloud org has no plan, so sentiment is refused");

test.describe("Sentiment page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SENTIMENT_URL);
    await expect(page.getByRole("heading", { name: "Sentiment" })).toBeVisible({ timeout: 30_000 });
  });

  test("opens on the risk prompts, each label with the answer's own words", async ({ page }, testInfo) => {
    skipInCloud(testInfo);
    await expect(page.getByTestId("sentiment-analysis-off-banner")).toBeVisible();
    await expect(page.getByTestId("sentiment-coverage")).toContainText("4 of 6 mentions in this window are judged");

    const risks = page.getByTestId("risk-prompts");
    await expect(risks).toBeVisible();
    await expect(risks.getByRole("link", { name: "best project tracking tools" })).toBeVisible();
    await expect(risks.getByTestId("risk-counts")).toHaveText(
      "1 advised against, 0 compared unfavourably — of 2 judged mentions",
    );
    const evidence = risks.getByTestId("risk-evidence");
    await expect(evidence).toHaveCount(1);
    await expect(evidence).toContainText("Advised against");
    await expect(evidence).toContainText(MENTIONS_ANALYSED_ANSWERS[1]);
  });

  test("shows each brand's stance mix over judged mentions only", async ({ page }, testInfo) => {
    skipInCloud(testInfo);
    await page.getByRole("tab", { name: "Stance by brand" }).click();
    const cells = async (name: string) =>
      (await page.locator(`[data-subject="${name}"] td`).allInnerTexts()).map((t) => t.trim());

    await expect(page.getByTestId("stance-table")).toBeVisible();
    expect((await cells("Northwind")).slice(1)).toEqual(["2 of 2", "1", "0", "0", "1", "0", "0%"]);
    expect(await cells("Contoso")).toEqual(["Contoso", "2 of 2", "0", "1", "0", "0", "1", "−50%"]);
    // Named twice but never judged: no stance, not a neutral one.
    expect(await cells("Fabrikam")).toEqual(["Fabrikam", "0 of 2", "0", "0", "0", "0", "0", "—"]);
  });

  test("says model analysis is off when nothing is judged", async ({ page }, testInfo) => {
    skipInCloud(testInfo);
    await page.goto(`${brandUrl()}/sentiment`);
    await expect(page.getByTestId("sentiment-analysis-off")).toBeVisible({ timeout: 30_000 });
  });

  test("says sentiment isn't in the plan, rather than showing nothing, for an org without it", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "cloud", "every other mode is unlimited");
    await expect(page.getByTestId("sentiment-not-in-plan")).toBeVisible();
    await expect(page.getByTestId("risk-prompts")).toHaveCount(0);
  });

  test("is reachable from the sidebar", async ({ page }) => {
    await page.goto(brandUrl(MENTIONS_BRAND_ID));
    await page.getByRole("link", { name: "Sentiment" }).click();
    await expect(page).toHaveURL(/\/sentiment$/);
  });
});
