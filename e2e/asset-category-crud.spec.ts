import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"

test.describe("Aset Kategori CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Kategori Aset CRUD khusus desktop")
  })

  test("create → detail → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `kat-e2e-${ts}`
    const updated = `kat-e2e-upd-${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/aset/kategori/tambah", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Tambah Kategori Aset" })).toBeVisible({ timeout: 30000 })
    await expect(page.locator("form").first()).toBeVisible({ timeout: 30_000 })

    // The per-category GL mapping section must render (it is what makes the
    // depreciation/acquisition cron honour a category-specific account).
    await expect(page.getByText("Mapping Akun (opsional)")).toBeVisible({ timeout: 10000 })
    await expect(page.locator("#depreciationExpenseAccountId")).toBeAttached()
    await expect(page.locator("#accumulatedDepreciationAccountId")).toBeAttached()

    const nameInput = page.locator("#name")
    await expect(nameInput).toBeVisible({ timeout: 10000 })
    await nameInput.fill(name)
    await expect(nameInput).toHaveValue(name)
    await page.locator("#code").fill(`KAT-${ts}`)
    await page.locator("#depreciationRate").fill("10")
    await page.locator("#usefulLife").fill("5")
    await page.getByRole("button", { name: /(Simpan|Perbarui|Update)/ }).click()
    await page.waitForURL("**/aset/kategori", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    // Search-first: list paginates client-side (20/page), so filter by name to
    // keep the freshly created row on page 1 regardless of accumulated data.
    await page.goto(`/aset/kategori?cari=${encodeURIComponent(name)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // ─── DETAIL ───────────────────────────────────────────────
    const detailLink = page.getByRole("link", { name }).first()
    await expect(detailLink).toBeVisible({ timeout: 30000 })
    const detailHref = await detailLink.getAttribute("href")
    if (!detailHref) throw new Error("Could not find href on detail link")
    await page.goto(new URL(detailHref, page.url()).toString(), { waitUntil: "domcontentloaded" })

    await page.waitForURL(/\/aset\/kategori\/[^/]+$/, { timeout: 30000 })
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ───────────────────────────────────────────────
    await page.goto(`/aset/kategori?cari=${encodeURIComponent(name)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("table").first()).toBeVisible({ timeout: 30_000 })

    const row = page.getByRole("row", { name: new RegExp(name) }).first()
    await expect(row).toBeVisible({ timeout: 30000 })
    await row.getByRole("button", { name: "Buka menu aksi" }).click()
    await page.getByRole("menuitem", { name: /Edit|Ubah/ }).first().click()

    await page.waitForURL(/\/aset\/kategori\/[^/]+\/ubah$/, { timeout: 30000 })
    await page.locator("#name").fill(updated)
    await expect(page.getByRole("button", { name: /(Simpan|Perbarui|Update)/ })).toBeEnabled({ timeout: 15_000 })
    await page.getByRole("button", { name: /(Simpan|Perbarui|Update)/ }).click()
    await page.waitForURL("**/aset/kategori", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await page.goto(`/aset/kategori?cari=${encodeURIComponent(updated)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ───────────────────────────────────────────────
    const updatedRow = page.getByRole("row", { name: new RegExp(updated) }).first()
    await expect(updatedRow).toBeVisible({ timeout: 30000 })

    await updatedRow.getByRole("button", { name: "Buka menu aksi" }).click()
    await page.getByRole("menuitem", { name: "Hapus" }).first().click()

    await page.getByRole("button", { name: "Hapus" }).last().click()
    await page.waitForLoadState("networkidle")

    await expect(page.getByRole("row", { name: new RegExp(updated) })).toHaveCount(0, { timeout: 30000 })
  })
})
