import { test, expect, type Page } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"
import { openCombobox } from "./utils/combobox"

async function selectOptionBySearch(page: Page, placeholder: string, query: string, optionPattern: RegExp) {
  const search = await openCombobox(page, { placeholder })
  await search.fill(query)

  const option = page.getByRole("option", { name: optionPattern }).first()
  const count = await option.count()
  test.skip(count === 0, `Opsi ${query} tidak tersedia`)
  await expect(option).toBeVisible({ timeout: 10000 })
  await option.click()
}

async function submitAndWaitForListPage(page: Page, buttonName: RegExp) {
  await Promise.all([
    page.waitForURL(/\/inventaris\/baris-rak$/, { timeout: 30000 }),
    page.getByRole("button", { name: buttonName }).first().click(),
  ])
}



test.describe("Inventaris Baris Rak CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Baris rak CRUD belum stabil di mobile (overlay sidebar)")
  })

  test("create → detail → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `Baris Rak E2E ${ts}`
    const updated = `Baris Rak E2E Updated ${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/inventaris/baris-rak/tambah", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Tambah Baris Rak" })).toBeVisible({ timeout: 30000 })
    await expect(page.locator("form").first()).toBeVisible({ timeout: 30_000 })

    await selectOptionBySearch(page, "Cari gudang...", "Gudang", /Gudang/i)

    const rackInput = await openCombobox(page, { placeholder: "Cari rak..." })
    await expect(rackInput).toBeEnabled({ timeout: 10000 })

    const rackOptions = page.getByRole("option")
    await expect(rackOptions.first()).toBeVisible({ timeout: 10000 })
    const rackCount = await rackOptions.count()
    test.skip(rackCount === 0, "Tidak ada data rak pada gudang terpilih untuk skenario CRUD baris rak")

    await rackOptions.first().click()
    await expect(page.locator("input[name='rackId']")).toHaveValue(/\d+/, { timeout: 10000 })

    await page.locator("#name").fill(name)
    await submitAndWaitForListPage(page, /^Simpan$/)

    await page.goto("/inventaris/baris-rak", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // ─── DETAIL ───────────────────────────────────────────────
    const detailLink = page.locator(`a[href^="/inventaris/baris-rak/"]`).filter({ hasText: name }).first()
    await expect(detailLink).toBeVisible({ timeout: 30000 })
    const href = await detailLink.getAttribute("href")
    if (!href) throw new Error("Could not resolve rack row detail href")
    // The route now uses a human-readable slug; reuse it directly.
    const key = href.split("/").pop()
    if (!key) throw new Error("Could not parse rack row key from detail link")

    await page.goto(`/inventaris/baris-rak/${key}`, { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ───────────────────────────────────────────────
    await page.goto(`/inventaris/baris-rak/${key}/ubah`, { waitUntil: "domcontentloaded" })

    await page.locator("#name").first().fill(updated)
    await submitAndWaitForListPage(page, /^Update$|^Perbarui$/)

    await page.goto("/inventaris/baris-rak", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ───────────────────────────────────────────────
    // Re-derive the row's link from the DOM by its (updated) name — the slug
    // may have changed when the row was edited, so a captured key is stale.
    const updatedRow = page.locator("tr").filter({ hasText: updated }).first()
    await expect(updatedRow).toBeVisible({ timeout: 30000 })
    await updatedRow.locator("button[aria-label='Buka menu aksi']").click()
    
    // Perbaikan: gunakan page.getByRole() untuk mencari menuitem
    await page.getByRole("menuitem", { name: "Hapus" }).click()

    const confirmDialog = page.locator("[role='alertdialog'], [role='dialog']").filter({ hasText: "Hapus data ini?" }).first()
    await expect(confirmDialog).toBeVisible({ timeout: 10000 })
    await confirmDialog.getByRole("button", { name: /^Hapus$/ }).click()
    await expect(confirmDialog).toBeHidden({ timeout: 10000 })


    await page.goto("/inventaris/baris-rak", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(updated)
  })
})
