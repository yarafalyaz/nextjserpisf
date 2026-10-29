import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"
import { awaitListContains } from "./utils/await-ready"


test.beforeEach(async ({}, testInfo) => {
  skipOnMobile(testInfo.project.name)
})


test.describe("Kendaraan Merek CRUD", () => {
  test("create → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `Vehicle Brand E2E ${ts}`
    const updated = `Vehicle Brand E2E Updated ${ts}`

    await page.goto("/kendaraan/merek/tambah", { waitUntil: "domcontentloaded" })
    await expect(page.locator("input[name='name']").first()).toBeVisible({ timeout: 30000 })
    await page.locator("input[name='name']").first().fill(name)
    await expect(page.locator("input[name='name']").first()).toHaveValue(name)
    await page.getByRole("button", { name: /^Simpan$/ }).first().click()

    await awaitListContains(page, "**/kendaraan/merek", name)
    await page.goto(`/kendaraan/merek?cari=${encodeURIComponent(name)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    const detailLink = page.locator(`a[href^="/kendaraan/merek/"]`).filter({ hasText: name }).first()
    await expect(detailLink).toBeVisible({ timeout: 30000 })
    const href = await detailLink.getAttribute("href")
    if (!href) throw new Error("Could not resolve brand detail href")

    await page.goto(`${href}/ubah`, { waitUntil: "domcontentloaded" })
    await expect(page.locator("input[name='name']").first()).toBeVisible({ timeout: 30000 })
    await page.locator("input[name='name']").first().fill(updated)
    await expect(page.locator("input[name='name']").first()).toHaveValue(updated)
    await page.getByRole("button", { name: /^Update$|^Perbarui$/ }).first().click()

    await awaitListContains(page, "**/kendaraan/merek", updated)
    await page.goto(`/kendaraan/merek?cari=${encodeURIComponent(updated)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    const updatedRow = page.locator("tr").filter({ hasText: updated })
    await expect(updatedRow).toBeVisible({ timeout: 30000 })
    await updatedRow.locator("button[aria-label='Buka menu aksi']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
    await page.locator("button").filter({ hasText: "Hapus" }).last().click()

    await expect(updatedRow).toHaveCount(0, { timeout: 10000 })
    await page.goto(`/kendaraan/merek?cari=${encodeURIComponent(updated)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(updated)
  })
})
