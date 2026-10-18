import { test, expect } from "@playwright/test"

/**
 * The mobile list layout must be a stack of cards, not a table the user has to
 * pan horizontally. Checks on a real list page:
 *   1. below the md breakpoint the <table> is hidden and cards are used;
 *   2. the document does not overflow horizontally (the original complaint);
 *   3. each card keeps its primary content, a label→value detail line and the
 *      row actions, so nothing is lost when the table collapses.
 *   4. empty state: when no rows, the mobile wrapper renders
 *      div[role=region] "Tidak ada data" instead of ul cards — guard still pass.
 */

test.describe("DataTable mobile card layout", () => {
  test("barang list shows cards without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/master/barang", { waitUntil: "domcontentloaded" })

    const cards = page.locator("ul[role='list'] > li")
    const empty = page.locator("div[role='region']").filter({ hasText: "Tidak ada data" })

    // Accept either cards OR empty region — empty DB still valid
    await expect(cards.first().or(empty).first()).toBeVisible({ timeout: 15000 })
    const count = await cards.count()

    if (count > 0) {
      await expect(page.locator("table").first()).toBeHidden()

      // No left/right panning: the document fits the viewport.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(1)

      // The detail lines keep their labels (e.g. "Stok", "Posisi").
      await expect(cards.first().getByText("Stok", { exact: true }).first()).toBeVisible()

      // Row actions are carried into the card footer.
      await expect(
        cards.first().locator("button[aria-label='Buka menu aksi']"),
      ).toBeVisible()
    } else {
      // Empty state still must not overflow
      await expect(empty.first()).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(1)
    }
  })

  test("desktop keeps the table layout", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto("/master/barang", { waitUntil: "domcontentloaded" })
    await expect(page.locator("table").first()).toBeVisible({ timeout: 15000 })
    await expect(page.locator("ul[role='list'] > li").first()).toBeHidden()
  })
})
