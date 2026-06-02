import { test, expect, type Page } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"

const ts = Date.now()

test.beforeEach(async ({}, testInfo) => {
  skipOnMobile(testInfo.project.name)
})


async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(5000)
}


test.describe("Proyek CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    const name = `Proyek E2E ${ts}`
    const updated = `Proyek E2E Updated ${ts}`
    const desc = "Deskripsi proyek e2e"
    const updatedDesc = "Deskripsi proyek e2e updated"

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/proyek/tambah", { waitUntil: "domcontentloaded" })

    const customerInput = page.locator("input[placeholder='Cari customer...']").first()
    await customerInput.click()
    await customerInput.press("ArrowDown")
    await customerInput.press("Enter")

    await page.locator("#name").fill(name)
    await page.locator("#description").fill(desc)
    await waitForHydration(page)
    await page.getByRole("button", { name: "Simpan Proyek" }).click()
    await page.waitForURL("**/proyek", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ────────────────────────────────────────────────
    const row = page.locator("tr").filter({ hasText: name })
    await expect(row).toBeVisible()
    await row.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Edit" }).first().click()

    await page.waitForURL(/\/proyek\/\d+\/ubah/, { timeout: 20000 })
    await page.waitForLoadState("networkidle")

    await page.locator("#name").fill(updated)
    await page.locator("#description").fill(updatedDesc)
    await page.getByRole("button", { name: "Update" }).first().click()
    await page.waitForURL("**/proyek", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ────────────────────────────────────────────────
    const updatedRow = page.locator("tr").filter({ hasText: updated })
    await expect(updatedRow).toBeVisible()
    await updatedRow.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
    await page.locator("button").filter({ hasText: "Hapus" }).last().click()

    await expect(updatedRow).toHaveCount(0, { timeout: 10000 })
    await page.goto("/proyek", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(updated)
  })
})
