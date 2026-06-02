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


test.describe("Kendaraan CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    const plate = `B${String(ts).slice(-4)}E2E`
    const updatedPlate = `D${String(ts).slice(-4)}E2E`
    const color = `Hitam E2E ${ts}`
    const updatedColor = `Putih E2E ${ts}`

    await page.goto("/kendaraan/tambah", { waitUntil: "domcontentloaded" })
    await page.locator("#plateNo").first().fill(plate)
    await page.locator("#year").first().fill("2024")
    await page.locator("#color").first().fill(color)
    await waitForHydration(page)
    await page.locator("#submit-vehicle").first().click()

    await page.waitForURL("**/kendaraan", { timeout: 20000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(plate)

    const detailLink = page.locator(`a[href^="/kendaraan/"]`).filter({ hasText: plate }).first()
    await expect(detailLink).toBeVisible()
    const href = await detailLink.getAttribute("href")
    const idMatch = href?.match(/\/kendaraan\/(\d+)/)
    if (!idMatch) throw new Error("Could not parse vehicle ID from detail link")
    const id = idMatch[1]

    await page.goto(`/kendaraan/${id}/ubah`, { waitUntil: "domcontentloaded" })
    await page.locator("#plateNo").first().fill(updatedPlate)
    await page.locator("#year").first().fill("2025")
    await page.locator("#color").first().fill(updatedColor)
    await waitForHydration(page)
    await page.locator("#submit-vehicle").first().click()

    await page.waitForURL("**/kendaraan", { timeout: 20000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updatedPlate)
    await expect(page.locator("body")).toContainText(updatedColor)

    const updatedRow = page.locator("tr").filter({ hasText: updatedPlate }).first()
    await expect(updatedRow).toBeVisible()

    const updatedDetailLink = page.locator(`a[href^="/kendaraan/"]`).filter({ hasText: updatedPlate }).first()
    await expect(updatedDetailLink).toBeVisible()
    await updatedDetailLink.click()

    const deleteBtn = page.getByRole("button").filter({ has: page.locator("svg.lucide-trash2") }).first()
    await expect(deleteBtn).toBeVisible()
    await deleteBtn.click()
    await page.locator("button").filter({ hasText: "Hapus" }).last().click()

    await page.waitForURL("**/kendaraan", { timeout: 20000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(updatedPlate)
  })
})
