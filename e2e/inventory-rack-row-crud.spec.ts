import { test, expect, type Page } from "@playwright/test"

const ts = Date.now()

async function closeMobileSidebarIfOpen(page: Page) {
  const overlay = page.locator(".sidebar-overlay")
  if (!(await overlay.isVisible().catch(() => false))) return

  const closeBtn = page.locator(".sidebar-close-btn")
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click({ force: true })
  } else {
    await page.keyboard.press("Escape")
  }

  await expect(overlay).toBeHidden()
}

async function submitAndWaitForListPage(page: Page, buttonName: RegExp) {
  await Promise.all([
    page.waitForURL(/\/inventaris\/baris-rak$/, { timeout: 15000 }),
    page.getByRole("button", { name: buttonName }).first().click(),
  ])
}

test.describe("Inventaris Baris Rak CRUD", () => {
  test("create → detail → update → delete", async ({ page }) => {
    const name = `Baris Rak E2E ${ts}`
    const updated = `Baris Rak E2E Updated ${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/inventaris/baris-rak/tambah", { waitUntil: "domcontentloaded" })
    await closeMobileSidebarIfOpen(page)
    await expect(page.getByRole("heading", { name: "Tambah Baris Rak" })).toBeVisible()

    const warehouseInput = page.locator("input[placeholder='Cari gudang...']").first()
    await warehouseInput.click()
    await warehouseInput.fill("Gudang Utama")
    const warehouseOption = page.getByRole("option", { name: /Gudang Utama/i }).first()
    await expect(warehouseOption).toBeVisible({ timeout: 10000 })
    await warehouseOption.click()

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
    await expect(detailLink).toBeVisible()
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
    await submitAndWaitForListPage(page, /^Update$/)

    await page.goto("/inventaris/baris-rak", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ───────────────────────────────────────────────
    await closeMobileSidebarIfOpen(page)
    const updatedRow = page.locator("tr").filter({ hasText: updated })
    await expect(updatedRow).toBeVisible()
    await updatedRow.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
    await page.locator("button").filter({ hasText: "Hapus" }).last().click()

    await expect(page.locator("[role='dialog']")).toBeHidden({ timeout: 10000 })
    await page.goto("/inventaris/baris-rak", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(updated)
  })
})
