import { test, expect, type Page } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"


test.beforeEach(async ({}, testInfo) => {
  skipOnMobile(testInfo.project.name)
})


async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(2000)
}


test.describe("Kendaraan Model CRUD", () => {
  test("create → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `Vehicle Model E2E ${ts}`
    const updated = `Vehicle Model E2E Updated ${ts}`

    const brandName = `Brand-E2E-${ts}`

    // ─── CREATE BRAND ──────────────────────────────────────────
    await page.goto("/kendaraan/merek/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await page.locator("input[name='name']").first().fill(brandName)
    await page.getByRole("button", { name: /^Simpan$/ }).first().click()
    await page.waitForURL("**/kendaraan/merek", { timeout: 20000 })
    await page.waitForLoadState("networkidle")

    // ─── CREATE MODEL ──────────────────────────────────────────
    await page.goto("/kendaraan/model/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)

    // Choose brand via the ComboBox input — type brandName, wait for filtered option, then pick
    const brandInput = page.locator("input[placeholder='Cari merek...']").first()
    await brandInput.click()
    await brandInput.fill(brandName)
    await page.waitForTimeout(1000)
    await brandInput.press("ArrowDown")
    await brandInput.press("Enter")

    await page.locator("#name").fill(name)
    await page.getByRole("button", { name: /^Simpan$/ }).first().click()

    await page.waitForURL("**/kendaraan/model", { timeout: 20000 })
    await page.goto(`/kendaraan/model?cari=${encodeURIComponent(name)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE via detail → edit button ──────────────────────
    const detailLink = page.locator(`a[href^="/kendaraan/model/"]`).filter({ hasText: name }).first()
    await expect(detailLink).toBeVisible({ timeout: 30000 })
    const href = await detailLink.getAttribute("href")
    const idMatch = href?.match(/\/kendaraan\/model\/(\d+)/)
    if (!idMatch) throw new Error("Could not parse model ID from detail link")
    const id = idMatch[1]

    await page.goto(`/kendaraan/model/${id}/ubah`, { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    const nameInput = page.getByPlaceholder('Contoh: Avanza').first()
    await expect(nameInput).toBeVisible({ timeout: 30000 })

    await nameInput.fill(updated)
    await expect(nameInput).toHaveValue(updated)
    const editBrandInput = page.locator("input[placeholder='Cari merek...']").first()
    await editBrandInput.click()
    await editBrandInput.fill(brandName)
    await page.waitForTimeout(1000)
    await editBrandInput.press("ArrowDown")
    await editBrandInput.press("Enter")
    await page.getByRole("button", { name: /^Update$|^Perbarui$/ }).first().click()

    await page.waitForURL("**/kendaraan/model", { timeout: 20000 })
    await page.goto(`/kendaraan/model?cari=${encodeURIComponent(updated)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE via ActionDropdown ────────────────────────────
    const updatedRow = page.locator("tr").filter({ hasText: updated })
    await expect(updatedRow).toBeVisible({ timeout: 30000 })
    await updatedRow.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
    await page.locator("button").filter({ hasText: "Hapus" }).last().click()

    // Wait for delete to complete
    await expect(updatedRow).toHaveCount(0, { timeout: 10000 })
    await page.goto(`/kendaraan/model?cari=${encodeURIComponent(updated)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(updated)

    // ─── DELETE BRAND ──────────────────────────────────────────
    await page.goto(`/kendaraan/merek?cari=${encodeURIComponent(brandName)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    const brandRow = page.locator("tr").filter({ hasText: brandName })
    await expect(brandRow).toBeVisible({ timeout: 30000 })
    await brandRow.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
    await page.locator("button").filter({ hasText: "Hapus" }).last().click()
    await expect(brandRow).toHaveCount(0, { timeout: 10000 })
  })
})