import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"
import { selectComboboxOptionBySearch } from "./utils/combobox"

test.beforeEach(async ({}, testInfo) => {
  skipOnMobile(testInfo.project.name)
})

test.describe("Kendaraan CRUD", () => {
  test("create → update → delete", async ({ page }, testInfo) => {
    // The master `Kendaraan` is now a CATALOG TYPE (variant + name + year), not a
    // physical unit. Plate/color live on the customer-owned unit, so this spec
    // exercises the catalog form: pick Merek → Model → Varian, then a unique
    // Nama Tipe to locate the row (search filters on name too).
    const run = String(Date.now()).slice(-6) + String(testInfo.parallelIndex)
    const typeName = `Tipe E2E ${run}`
    const updatedTypeName = `Tipe E2E U${run}`

    await page.goto("/kendaraan/tambah", { waitUntil: "domcontentloaded" })
    await expect(page.locator("#name").first()).toBeVisible({ timeout: 30_000 })

    // Cascading comboboxes: brand enables model, model enables variant.
    // Sengaja memilih merek/model/varian SEED milik E2E lewat pencarian, bukan opsi pertama:
    // opsi pertama bisa milik spec merek/model yang berjalan paralel, dan kendaraan yang
    // kita buat akan mengunci merek itu sehingga spec itu gagal menghapusnya.
    const brandPicked = await selectComboboxOptionBySearch(
      page,
      { placeholder: "Cari merek..." },
      "E2E Kendaraan",
      /E2E Kendaraan/i,
    )
    if (!brandPicked) test.skip(true, "merek E2E tidak ada di seed")

    const modelPicked = await selectComboboxOptionBySearch(
      page,
      { placeholder: "Cari model..." },
      "E2E Model",
      /E2E Model/i,
    )
    if (!modelPicked) test.skip(true, "model E2E tidak ada di seed")

    const variantPicked = await selectComboboxOptionBySearch(
      page,
      { placeholder: "Cari tipe/varian..." },
      "E2E Varian",
      /E2E Varian/i,
    )
    if (!variantPicked) test.skip(true, "varian E2E tidak ada di seed")

    await page.locator("#name").first().fill(typeName)
    await page.locator("#year").first().fill("2024")
    await page.locator("#submit-vehicle").first().click()

    await page.waitForURL("**/kendaraan", { timeout: 20000 })
    await page.goto(`/kendaraan?cari=${encodeURIComponent(typeName)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(typeName)

    const detailLink = page.locator(`a[href^="/kendaraan/"]`).filter({ hasText: typeName }).first()
    await expect(detailLink).toBeVisible({ timeout: 30000 })
    const href = await detailLink.getAttribute("href")
    if (!href) throw new Error("Could not resolve vehicle detail href")

    await page.goto(`${href}/ubah`, { waitUntil: "domcontentloaded" })
    await expect(page.locator("#name").first()).toBeVisible({ timeout: 30_000 })
    // On edit the cascades are pre-filled; only the label changes.
    await page.locator("#name").first().fill(updatedTypeName)
    await page.locator("#year").first().fill("2025")
    await page.locator("#submit-vehicle").first().click()

    await page.waitForURL("**/kendaraan", { timeout: 20000 })
    await page.goto(`/kendaraan?cari=${encodeURIComponent(updatedTypeName)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updatedTypeName)

    const updatedRow = page.locator("tr").filter({ hasText: updatedTypeName }).first()
    await expect(updatedRow).toBeVisible({ timeout: 30000 })

    const updatedDetailLink = page.locator(`a[href^="/kendaraan/"]`).filter({ hasText: updatedTypeName }).first()
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

    // deleteVehicle action hanya revalidatePath tanpa redirect; tunggu dialog tertutup (= action selesai) lalu cek list terfilter
    await expect(confirmDialog).toBeHidden({ timeout: 15_000 })
    await page.goto(`/kendaraan?cari=${encodeURIComponent(updatedTypeName)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(updatedTypeName)
  })
})
