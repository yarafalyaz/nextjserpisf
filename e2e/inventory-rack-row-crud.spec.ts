import { test, expect } from "@playwright/test"

const ts = Date.now()

test.beforeEach(async ({}, testInfo) => {
  if (testInfo.project.name.includes("mobile")) {
    test.skip(true, "Desktop-focused CRUD interaction")
  }
})

test.describe("Inventaris Baris Rak CRUD", () => {
  test("create → detail → update → delete", async ({ page }) => {
    const name = `Baris Rak E2E ${ts}`
    const updated = `Baris Rak E2E Updated ${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/inventaris/baris-rak/tambah", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Tambah Baris Rak" })).toBeVisible()

    const warehouseInput = page.locator("input[placeholder='Cari gudang...']").first()
    await warehouseInput.click()
    await warehouseInput.fill("Gudang Utama")
    const warehouseOption = page.locator("[role='option']", { hasText: "Gudang Utama" }).last()
    await expect(warehouseOption).toBeVisible({ timeout: 10000 })
    await warehouseOption.click()

    const rackInput = page.locator("input[placeholder='Cari rak...']").first()
    await expect(rackInput).toBeEnabled({ timeout: 10000 })
    await rackInput.click()
    await rackInput.fill("RAK 1")
    const rackOption = page.locator("[role='option']", { hasText: "RAK 1" }).first()
    await expect(rackOption).toBeVisible({ timeout: 10000 })
    await rackOption.click()

    await page.locator("#name").fill(name)
    await page.getByRole("button", { name: /^Simpan$/ }).first().click()

    await page.waitForTimeout(1200)
    await page.goto("/inventaris/baris-rak", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // ─── DETAIL ───────────────────────────────────────────────
    const detailLink = page.locator(`a[href^="/inventaris/baris-rak/"]`).filter({ hasText: name }).first()
    await expect(detailLink).toBeVisible()
    const href = await detailLink.getAttribute("href")
    const idMatch = href?.match(/\/inventaris\/baris-rak\/(\d+)/)
    if (!idMatch) throw new Error("Could not parse rack row ID from detail link")
    const id = idMatch[1]

    await page.goto(`/inventaris/baris-rak/${id}`, { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ───────────────────────────────────────────────
    await page.getByRole("link", { name: "Ubah" }).click()
    await page.waitForURL(`**/inventaris/baris-rak/${id}/ubah`, { timeout: 15000 })

    await page.locator("#name").fill(updated)
    await page.getByRole("button", { name: /^Update$/ }).first().click()

    await page.waitForTimeout(1200)
    await page.goto("/inventaris/baris-rak", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ───────────────────────────────────────────────
    const updatedRow = page.locator("tr").filter({ hasText: updated })
    await expect(updatedRow).toBeVisible()
    await updatedRow.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
    await page.locator("button").filter({ hasText: "Hapus" }).last().click()

    await page.waitForTimeout(1500)
    await page.goto("/inventaris/baris-rak", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(updated)
  })
})
