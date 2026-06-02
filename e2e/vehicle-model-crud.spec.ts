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


test.describe("Kendaraan Model CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    const name = `Vehicle Model E2E ${ts}`
    const updated = `Vehicle Model E2E Updated ${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/kendaraan/model/tambah", { waitUntil: "domcontentloaded" })

    // Choose brand via the ComboBox input — type to trigger popover then pick first option
    const brandInput = page.locator("input[placeholder='Cari merek...']").first()
    await brandInput.click()
    await brandInput.press("ArrowDown")
    await brandInput.press("Enter")

    await page.locator("#name").fill(name)
    await waitForHydration(page)
    await page.getByRole("button", { name: /^Simpan$/ }).first().click()

    await page.waitForURL("**/kendaraan/model", { timeout: 20000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE via detail → edit button ──────────────────────
    const detailLink = page.locator(`a[href^="/kendaraan/model/"]`).filter({ hasText: name }).first()
    await expect(detailLink).toBeVisible()
    const href = await detailLink.getAttribute("href")
    const idMatch = href?.match(/\/kendaraan\/model\/(\d+)/)
    if (!idMatch) throw new Error("Could not parse model ID from detail link")
    const id = idMatch[1]

    await page.goto(`/kendaraan/model/${id}/ubah`, { waitUntil: "domcontentloaded" })
    const nameInput = page.getByPlaceholder('Contoh: Avanza').first()
    await expect(nameInput).toBeVisible()

    await nameInput.fill(updated)
    const editBrandInput = page.locator("input[placeholder='Cari merek...']").first()
    await editBrandInput.click()
    await editBrandInput.press("ArrowDown")
    await editBrandInput.press("Enter")
    await page.getByRole("button", { name: /^Update$/ }).first().click()

    await page.waitForURL("**/kendaraan/model", { timeout: 20000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE via ActionDropdown ────────────────────────────
    const updatedRow = page.locator("tr").filter({ hasText: updated })
    await expect(updatedRow).toBeVisible()
    await updatedRow.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
    await page.locator("button").filter({ hasText: "Hapus" }).last().click()

    // Wait for delete to complete
    await expect(updatedRow).toHaveCount(0, { timeout: 10000 })
    await page.goto("/kendaraan/model", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(updated)
  })
})