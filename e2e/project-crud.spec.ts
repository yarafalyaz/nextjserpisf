import { test, expect, type Page } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"


test.beforeEach(async ({}, testInfo) => {
  skipOnMobile(testInfo.project.name)
})


async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(3000)
}

async function selectFirstComboBoxOption(page: Page, placeholder: string) {
  const input = page.locator(`input[placeholder='${placeholder}']`).first()
  await expect(input).toBeVisible({ timeout: 10000 })
  await input.click()
  await page.waitForTimeout(300)

  // Type to trigger filtering
  await input.fill("E2E")
  await page.waitForTimeout(1000)

  const option = page.locator("[role='option']").first()
  if (await option.isVisible().catch(() => false)) {
    await option.click()
    return true
  }

  // Clear and try without filter
  await input.clear()
  await page.waitForTimeout(500)
  await input.click()
  await page.waitForTimeout(1000)

  const anyOption = page.locator("[role='option']").first()
  if (await anyOption.isVisible().catch(() => false)) {
    await anyOption.click()
    return true
  }

  return false
}


test.describe("Proyek CRUD", () => {
  test("create → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `Proyek E2E ${ts}`
    const updated = `Proyek E2E Updated ${ts}`
    const desc = "Deskripsi proyek e2e"
    const updatedDesc = "Deskripsi proyek e2e updated"

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/proyek/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)

    const selected = await selectFirstComboBoxOption(page, "Cari pelanggan...")
    if (!selected) {
      test.skip(true, "No customers available in database — seeding issue")
      return
    }

    await page.locator("#name").fill(name)
    await page.locator("#description").fill(desc)
    await page.getByRole("button", { name: "Simpan Proyek" }).click()
    await page.waitForURL("**/proyek", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ────────────────────────────────────────────────
    const row = page.locator("tr").filter({ hasText: name })
    await expect(row).toBeVisible({ timeout: 30000 })
    await row.locator("button[aria-label='Buka menu aksi']").click()
    await page.locator("[role='menuitem']").filter({ hasText: /Edit|Ubah/ }).first().click()

    await page.waitForURL(/\/proyek\/\d+\/ubah/, { timeout: 20000 })
    await page.waitForLoadState("networkidle")

    await page.locator("#name").fill(updated)
    await page.locator("#description").fill(updatedDesc)
    await page.getByRole("button", { name: /Update|Perbarui/ }).first().click()
    await page.waitForURL("**/proyek", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ────────────────────────────────────────────────
    const updatedRow = page.locator("tr").filter({ hasText: updated })
    await expect(updatedRow).toBeVisible({ timeout: 30000 })
    await updatedRow.locator("button[aria-label='Buka menu aksi']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
    await page.locator("button").filter({ hasText: "Hapus" }).last().click()

    await expect(updatedRow).toHaveCount(0, { timeout: 10000 })
    await page.goto("/proyek", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await waitForHydration(page)
    await expect(page.locator("body")).not.toContainText(updated)
  })
})
