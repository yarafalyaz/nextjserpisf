import { test, expect, type Page } from "@playwright/test"

async function closeMobileSidebarIfOpen(page: Page) {
  const overlay = page.locator(".sidebar-overlay")
  if (!(await overlay.isVisible().catch(() => false))) return

  const closeBtn = page.locator(".sidebar-close-btn")
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click({ force: true })
  } else {
    await page.keyboard.press("Escape")
  }

  await expect(overlay).toBeHidden()
}




test.describe("Master Gudang E2E CRUD Mutation", () => {
  const testWarehouseName = `Gudang E2E Test - ${Date.now()}`
  const updatedWarehouseName = `Gudang E2E Test (Updated) - ${Date.now()}`
  const warehouseAddress = "Jalan Raya E2E Test No. 42"
  const updatedWarehouseAddress = "Jalan Raya E2E Test No. 99 (Updated)"

  test("should execute full CRUD mutation successfully", async ({ page }) => {
    // ─── 1. CREATE ──────────────────────────────────────────────────────────
    await page.goto("/master/gudang/tambah")
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)

    // Fill form
    await page.locator("#name").fill(testWarehouseName)
    await page.locator("#address").fill(warehouseAddress)

    // Submit form
    await page.locator("#submit-warehouse").click()

    // Verify redirected back and item exists
    await page.waitForURL("**/master/gudang")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(testWarehouseName)

    // Grab the ID from the list page to bypass flaky dropdown click
    const detailLink = page.locator(`a[href^="/master/gudang/"]`).filter({
      hasText: testWarehouseName,
    }).first()
    await expect(detailLink).toBeVisible()

    const href = await detailLink.getAttribute("href")
    if (!href) throw new Error("Could not find detail link href")

    // Extract ID (e.g. /master/gudang/42 -> 42)
    const warehouseId = href.split("/").pop()
    if (!warehouseId) throw new Error("Could not parse warehouse ID")

    // ─── 2. READ & UPDATE ───────────────────────────────────────────────────
    await page.goto(`/master/gudang/${warehouseId}/ubah`)
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)

    await expect(page.locator("#name")).toHaveValue(testWarehouseName)
    await expect(page.locator("#address")).toHaveValue(warehouseAddress)

    // Update details
    await page.locator("#name").fill(updatedWarehouseName)
    await page.locator("#address").fill(updatedWarehouseAddress)
    await page.locator("#submit-warehouse").click()

    // Verify redirected back and updated
    await page.waitForURL("**/master/gudang")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updatedWarehouseName)

    // ─── 3. DELETE ──────────────────────────────────────────────────────────
    // Click Menu dropdown for the updated row
    const row = page.locator("tr").filter({ hasText: updatedWarehouseName })
    await expect(row).toBeVisible()

    await row.locator("button[aria-label='Menu']").click()

    // Click "Hapus" item inside popover
    const deleteItem = page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first()
    await deleteItem.click()

    // Assert ConfirmDialog popped up and click Confirm button
    const confirmButton = page.locator("button").filter({ hasText: "Hapus" }).last()
    await expect(confirmButton).toBeVisible()
    await confirmButton.click()

    // Tunggu dialog tertutup + toast sukses agar tidak pakai delay statis
    await expect(page.locator("[role='dialog']").filter({ hasText: "Hapus data ini?" })).toBeHidden({ timeout: 15000 })
    await expect(page.locator("text=Data berhasil dihapus").first()).toBeVisible({ timeout: 15000 })

    await page.goto("/master/gudang")
    await page.waitForLoadState("networkidle")

    // Verify item is completely removed from table
    await expect(page.locator("body")).not.toContainText(updatedWarehouseName)
  })
})