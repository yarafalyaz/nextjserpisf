import { test, expect, type Page } from "@playwright/test"

test.describe("Master Gudang E2E CRUD Mutation", () => {
  const testWarehouseName = `Gudang E2E Test - ${Date.now()}`
  const updatedWarehouseName = `Gudang E2E Test (Updated) - ${Date.now()}`
  const warehouseAddress = "Jalan Raya E2E Test No. 42"
  const updatedWarehouseAddress = "Jalan Raya E2E Test No. 99 (Updated)"

  test("should execute full CRUD mutation successfully", async ({ page }) => {
    // ─── 1. CREATE ──────────────────────────────────────────────────────────
    await page.goto("/master/gudang/tambah")
    await page.waitForLoadState("networkidle")

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
    // `:visible` penting: di mobile tabel desktop disembunyikan dan barisnya dirender
    // sebagai kartu (lihat table-mobile-cards.tsx), sehingga `.first()` tanpa ini
    // mengambil anchor tersembunyi.
    const detailLink = page.locator(`a[href^="/master/gudang/"]:visible`).filter({
      hasText: testWarehouseName,
    }).first()
    await expect(detailLink).toBeVisible({ timeout: 30000 })

    const href = await detailLink.getAttribute("href")
    if (!href) throw new Error("Could not find detail link href")

    // Extract ID (e.g. /master/gudang/42 -> 42)
    const warehouseId = href.split("/").pop()
    if (!warehouseId) throw new Error("Could not parse warehouse ID")

    // ─── 2. READ & UPDATE ───────────────────────────────────────────────────
    await page.goto(`/master/gudang/${warehouseId}/ubah`)
    await page.waitForLoadState("networkidle")

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
    const row = page.locator("tr:visible, ul[role='list'] > li:visible").filter({ hasText: updatedWarehouseName }).first()
    await expect(row).toBeVisible({ timeout: 30000 })

    await row.locator("button[aria-label='Buka menu aksi']").click()

    // Click "Hapus" item inside popover
    const deleteItem = page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first()
    await deleteItem.click()

    // Assert ConfirmDialog popped up and click Confirm button
    const confirmButton = page.locator("button").filter({ hasText: "Hapus" }).last()
    await expect(confirmButton).toBeVisible({ timeout: 30000 })
    await confirmButton.click()

    // Tunggu dialog tertutup + toast sukses agar tidak pakai delay statis
    await expect(page.locator("[role='dialog']").filter({ hasText: "Hapus data ini?" })).toBeHidden({ timeout: 30000 })
    await expect(page.locator("text=Data berhasil dihapus").first()).toBeVisible({ timeout: 30000 })

    await page.goto("/master/gudang")
    await page.waitForLoadState("networkidle")

    // Verify item is completely removed from table
    await expect(page.locator("body")).not.toContainText(updatedWarehouseName)
  })
})