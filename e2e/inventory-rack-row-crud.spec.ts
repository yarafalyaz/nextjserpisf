import { test, expect, type Page } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"

async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(2000)
}

async function closeMobileSidebarIfOpen(page: Page) {
  const overlay = page.locator(".sidebar-overlay")
  if (!(await overlay.isVisible().catch(() => false))) return

  const closeBtn = page.locator(".sidebar-close-btn")
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click({ force: true })
  } else {
    await page.keyboard.press("Escape")
  }

  await expect(overlay).toBeHidden({ timeout: 10000 })
}

async function selectOptionBySearch(page: Page, input: string, query: string, optionPattern: RegExp) {
  const search = page.locator(input).first()
  await search.click()
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
    await closeMobileSidebarIfOpen(page)
    await expect(page.getByRole("heading", { name: "Tambah Baris Rak" })).toBeVisible({ timeout: 30000 })
    await waitForHydration(page)

    await selectOptionBySearch(page, "input[placeholder='Cari gudang...']", "Gudang", /Gudang/i)

    const rackInput = page.locator("input[placeholder='Cari rak...']").first()
    await expect(rackInput).toBeEnabled({ timeout: 10000 })
    await rackInput.click()

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
    const idMatch = href?.match(/\/inventaris\/baris-rak\/(\d+)/)
    if (!idMatch) throw new Error("Could not parse rack row ID from detail link")
    const id = idMatch[1]

    await page.goto(`/inventaris/baris-rak/${id}`, { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ───────────────────────────────────────────────
    await page.goto(`/inventaris/baris-rak/${id}/ubah`, { waitUntil: "domcontentloaded" })
    await closeMobileSidebarIfOpen(page)

    await page.locator("#name").first().fill(updated)
    await submitAndWaitForListPage(page, /^Update$|^Perbarui$/)

    await page.goto("/inventaris/baris-rak", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ───────────────────────────────────────────────
    await closeMobileSidebarIfOpen(page)
    const updatedRow = page.locator("tr").filter({ has: page.locator(`a[href='/inventaris/baris-rak/${id}']`) })
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
    await expect(page.locator(`a[href='/inventaris/baris-rak/${id}']`)).toHaveCount(0)
  })
})
