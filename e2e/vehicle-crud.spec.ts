import { test, expect, type Page } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"


test.beforeEach(async ({}, testInfo) => {
  skipOnMobile(testInfo.project.name)
})


async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(2000)
}


test.describe("Kendaraan CRUD", () => {
  test("create → update → delete", async ({ page }, testInfo) => {
    // Unique per run: `plate` must not collide with rows left by earlier runs
    // (the previous `${ts}`-slice trick yielded a constant "-0-0" suffix, so
    // every run reused "D-0-0E2E" and the delete assertion found an old row).
    const run = String(Date.now()).slice(-6) + String(testInfo.parallelIndex)
    const plate = `B${run}E2E`
    const updatedPlate = `D${run}E2E`
    const color = `Hitam E2E ${run}`
    const updatedColor = `Putih E2E ${run}`

    await page.goto("/kendaraan/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await page.locator("#plateNo").first().fill(plate)
    await page.locator("#year").first().fill("2024")
    await page.locator("#color").first().fill(color)
    await page.locator("#submit-vehicle").first().click()

    await page.waitForURL("**/kendaraan", { timeout: 20000 })
    await page.goto(`/kendaraan?cari=${encodeURIComponent(plate)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(plate)

    const detailLink = page.locator(`a[href^="/kendaraan/"]`).filter({ hasText: plate }).first()
    await expect(detailLink).toBeVisible({ timeout: 30000 })
    const href = await detailLink.getAttribute("href")
    const idMatch = href?.match(/\/kendaraan\/(\d+)/)
    if (!idMatch) throw new Error("Could not parse vehicle ID from detail link")
    const id = idMatch[1]

    await page.goto(`/kendaraan/${id}/ubah`, { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await page.locator("#plateNo").first().fill(updatedPlate)
    await page.locator("#year").first().fill("2025")
    await page.locator("#color").first().fill(updatedColor)
    await page.locator("#submit-vehicle").first().click()

    await page.waitForURL("**/kendaraan", { timeout: 20000 })
    await page.goto(`/kendaraan?cari=${encodeURIComponent(updatedPlate)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updatedPlate)
    await expect(page.locator("body")).toContainText(updatedColor)

    const updatedRow = page.locator("tr").filter({ hasText: updatedPlate }).first()
    await expect(updatedRow).toBeVisible({ timeout: 30000 })

    const updatedDetailLink = page.locator(`a[href^="/kendaraan/"]`).filter({ hasText: updatedPlate }).first()
    await expect(updatedDetailLink).toBeVisible({ timeout: 30000 })
    await updatedDetailLink.click()
    await page.waitForLoadState("networkidle")

    // The delete affordance is DeleteButton, which renders a Trash2 icon. Select
    // by its accessible name instead of the icon's CSS class: lucide-react >= 1.53
    // emits `lucide-<kebab-name>` (so `lucide-trash-2`, aliased `lucide-trash`),
    // not the old `lucide-trash2` - a class selector silently matched nothing.
    const deleteBtn = page.getByRole("button", { name: "Hapus" }).first()
    await expect(deleteBtn).toBeVisible({ timeout: 30000 })
    await deleteBtn.click()

    // Confirm dialog: wait for it to mount (Radix portals the content) before
    // clicking the action button, which is the only "Hapus" with visible text.
    const confirmDialog = page.getByRole("alertdialog")
    await expect(confirmDialog).toBeVisible({ timeout: 10000 })
    await confirmDialog.getByRole("button", { name: "Hapus" }).click()

    // deleteVehicle action hanya revalidatePath tanpa redirect; tunggu transition lalu cek list terfilter
    await page.waitForTimeout(2000)
    await page.goto(`/kendaraan?cari=${encodeURIComponent(updatedPlate)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(updatedPlate)
  })
})
