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

async function waitForNavigation(page: Page, url: string | RegExp, { timeout = 20000 } = {}) {
  await Promise.race([page.waitForURL(url, { timeout }), page.waitForLoadState("networkidle")])
}

test.describe("Kendaraan Merek CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    const name = `Vehicle Brand E2E ${ts}`
    const updated = `Vehicle Brand E2E Updated ${ts}`

    await page.goto("/kendaraan/merek/tambah", { waitUntil: "domcontentloaded" })
    await page.locator("input[name='name']").first().fill(name)
    await waitForHydration(page)
    await page.getByRole("button", { name: /^Simpan$/ }).first().click()

    await page.waitForURL("**/kendaraan/merek", { timeout: 20000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    const detailLink = page.locator(`a[href^="/kendaraan/merek/"]`).filter({ hasText: name }).first()
    await expect(detailLink).toBeVisible()
    const href = await detailLink.getAttribute("href")
    const idMatch = href?.match(/\/kendaraan\/merek\/(\d+)/)
    if (!idMatch) throw new Error("Could not parse brand ID from detail link")
    const id = idMatch[1]

    await page.goto(`/kendaraan/merek/${id}/ubah`, { waitUntil: "domcontentloaded" })
    await page.locator("input[name='name']").first().fill(updated)
    await page.getByRole("button", { name: /^Update$/ }).first().click()

    await page.waitForURL("**/kendaraan/merek", { timeout: 20000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    const updatedRow = page.locator("tr").filter({ hasText: updated })
    await expect(updatedRow).toBeVisible()
    await updatedRow.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
    await page.locator("button").filter({ hasText: "Hapus" }).last().click()

    await expect(updatedRow).toHaveCount(0, { timeout: 10000 })
    await page.goto("/kendaraan/merek", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(updated)
  })
})
