import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"
import { openCombobox } from "./utils/combobox"

test.beforeEach(async ({}, testInfo) => {
  skipOnMobile(testInfo.project.name)
})

test.describe("Kendaraan Model CRUD", () => {
  test("create → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `Vehicle Model E2E ${ts}`
    const updated = `Vehicle Model E2E Updated ${ts}`

    const brandName = `Brand-E2E-${ts}`

    // ─── CREATE BRAND ──────────────────────────────────────────
    await page.goto("/kendaraan/merek/tambah", { waitUntil: "domcontentloaded" })
    await expect(page.locator("input[name='name']").first()).toBeVisible({ timeout: 30_000 })
    await page.locator("input[name='name']").first().fill(brandName)
    await page.getByRole("button", { name: /^Simpan$/ }).first().click()
    await page.waitForURL("**/kendaraan/merek", { timeout: 20000 })
    await page.waitForLoadState("networkidle")

    // ─── CREATE MODEL ──────────────────────────────────────────
    await page.goto("/kendaraan/model/tambah", { waitUntil: "domcontentloaded" })
    await expect(page.locator("form").first()).toBeVisible({ timeout: 30_000 })

    // Choose brand via the ComboBox input — type brandName, wait for filtered option, then pick
    const brandInput = await openCombobox(page, { placeholder: "Cari merek..." })
    await brandInput.fill(brandName)
    await page.waitForTimeout(1000)
    await brandInput.press("ArrowDown")
    await brandInput.press("Enter")

    await page.locator("#name").fill(name)
    await page.getByRole("button", { name: /^Simpan$/ }).first().click()

    // After a successful save the form redirects (to the new model's edit page
    // when a default brand was supplied, otherwise back to the catalog). Wait
    // for ANY navigation off the "tambah" page, then verify via the catalog.
    await page.waitForURL((url) => !url.pathname.endsWith("/kendaraan/model/tambah"), {
      timeout: 20000,
    })

    // Verify by searching the model name: the catalog matches brands whose
    // MODELS contain the term (see merek/page.tsx), so the owning brand row
    // appears even though only brand names are displayed.
    await page.goto(`/kendaraan/merek?cari=${encodeURIComponent(name)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(brandName)

    // ─── UPDATE via model detail → edit ────────────────────────
    // Resolve the model id from its detail link (reachable from the brand detail).
    await page.goto(`/kendaraan/merek?cari=${encodeURIComponent(brandName)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    const brandLink = page.locator(`a[href^="/kendaraan/merek/"]`).filter({ hasText: brandName }).first()
    await expect(brandLink).toBeVisible({ timeout: 30000 })
    const brandHref = await brandLink.getAttribute("href")
    if (!brandHref) throw new Error("Could not resolve brand detail href")

    await page.goto(brandHref, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    const modelLink = page.locator(`a[href^="/kendaraan/model/"]`).filter({ hasText: name }).first()
    await expect(modelLink).toBeVisible({ timeout: 30000 })
    const href = await modelLink.getAttribute("href")
    if (!href) throw new Error("Could not resolve model detail href")

    await page.goto(`${href}/ubah`, { waitUntil: "domcontentloaded" })
    await expect(page.locator("form").first()).toBeVisible({ timeout: 30_000 })
    const nameInput = page.getByPlaceholder('Contoh: Avanza').first()
    await expect(nameInput).toBeVisible({ timeout: 30000 })

    await nameInput.fill(updated)
    await expect(nameInput).toHaveValue(updated)
    // On the edit page a brand is already selected, so the trigger shows its
    // name instead of the placeholder: identify it by the bound Label instead.
    const editBrandInput = await openCombobox(page, { name: /merek kendaraan/i })
    await editBrandInput.fill(brandName)
    await page.waitForTimeout(1000)
    await editBrandInput.press("ArrowDown")
    await editBrandInput.press("Enter")
    await page.getByRole("button", { name: /^Update$|^Perbarui$/ }).first().click()

    await page.waitForURL("**/kendaraan/merek", { timeout: 20000 })
    await page.goto(brandHref, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE MODEL via the brand detail's model table → detail page ──
    const updatedModelLink = page.locator(`a[href^="/kendaraan/model/"]`).filter({ hasText: updated }).first()
    await expect(updatedModelLink).toBeVisible({ timeout: 30000 })
    const updatedHref = await updatedModelLink.getAttribute("href")
    if (!updatedHref) throw new Error("Could not resolve updated model href")
    await page.goto(updatedHref, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await page.getByRole("button", { name: "Hapus" }).first().click()
    const dialog = page.getByRole("alertdialog")
    await expect(dialog).toBeVisible({ timeout: 10000 })
    await dialog.getByRole("button", { name: "Hapus" }).click()
    await expect(dialog).toBeHidden({ timeout: 15_000 })

    await page.goto(brandHref, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(updated)

    // ─── DELETE BRAND ──────────────────────────────────────────
    await page.goto(`/kendaraan/merek?cari=${encodeURIComponent(brandName)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    const brandRow = page.locator("tr").filter({ hasText: brandName })
    await expect(brandRow).toBeVisible({ timeout: 30000 })
    await brandRow.locator("button[aria-label='Buka menu aksi']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
    await page.locator("button").filter({ hasText: "Hapus" }).last().click()
    await expect(brandRow).toHaveCount(0, { timeout: 10000 })
  })
})
