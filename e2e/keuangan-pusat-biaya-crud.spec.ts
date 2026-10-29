import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"
import { awaitListContains } from "./utils/await-ready"

test.describe("Keuangan Pusat Biaya (Cost Center) CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Cost Center CRUD khusus desktop")
  })

  test("create → detail → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const code = `CC-E2E-${ts}`
    const name = `Cost Center E2E ${ts}`
    const updated = `Cost Center E2E Updated ${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/keuangan/pusat-biaya/tambah", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Buat Pusat Biaya" })).toBeVisible({ timeout: 30000 })
    await expect(page.locator("form").first()).toBeVisible({ timeout: 30_000 })

    const nameInput = page.locator("#name")
    await expect(nameInput).toBeVisible({ timeout: 30000 })
    await page.locator("#code").fill(code)
    await nameInput.fill(name)
    await expect(nameInput).toHaveValue(name)
    await page.getByRole("button", { name: "Simpan" }).click()

    await awaitListContains(page, "**/keuangan/pusat-biaya", name)
    await expect(page.locator("body")).toContainText(code)

    // ─── DETAIL ───────────────────────────────────────────────
    const detailLink = page
      .locator("a[href^='/keuangan/pusat-biaya/']")
      .filter({ hasText: name })
      .first()
    await expect(detailLink).toBeVisible({ timeout: 30000 })
    const detailHref = await detailLink.getAttribute("href")
    if (!detailHref) throw new Error("Could not get detail href")
    await page.goto(detailHref, { waitUntil: "domcontentloaded" })

    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ───────────────────────────────────────────────
    await page.goto("/keuangan/pusat-biaya", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    // Filter dulu agar item baru pasti muncul
    await page.locator("input[placeholder*='Cari kode atau nama']").fill(name)
    // Debounce search ditunggu assertion web-first di bawah, bukan sleep.
    await expect(page.locator("body")).toContainText(name)

    const row = page.locator("tr").filter({ hasText: new RegExp(name) }).first()
    await expect(row).toBeVisible({ timeout: 30000 })
    await row.getByRole("button", { name: "Buka menu aksi" }).first().click()
    await expect(page.getByRole("menuitem", { name: /Edit|Ubah/ }).first()).toBeVisible({ timeout: 10_000 })
    await page.getByRole("menuitem", { name: /Edit|Ubah/ }).first().click()

    await page.waitForURL(/\/keuangan\/pusat-biaya\/[^/]+\/ubah$/, { timeout: 30000 })

    await page.locator("#name").fill(updated)
    await page.getByRole("button", { name: /Update|Perbarui/ }).click()

    await page.waitForURL("**/keuangan/pusat-biaya", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await page.locator("input[placeholder*='Cari kode atau nama']").fill(code)
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ───────────────────────────────────────────────
    await page.goto(`/keuangan/pusat-biaya?cari=${encodeURIComponent(code)}`, {
      waitUntil: "domcontentloaded",
    })
    await page.waitForLoadState("networkidle")

    const updatedRow = page.locator("tr").filter({ hasText: new RegExp(code) }).first()
    await expect(updatedRow).toBeVisible({ timeout: 30000 })

    // 1. Open dropdown
    await updatedRow.getByRole("button", { name: "Buka menu aksi" }).first().click()
    await expect(page.getByRole("menuitem", { name: "Hapus" }).first()).toBeVisible({ timeout: 10_000 })
    // 2. Click Hapus menu item
    await page.getByRole("menuitem", { name: "Hapus" }).first().click()
    // 3. Wait for confirm dialog
    await expect(page.getByText("Hapus data ini?")).toBeVisible({ timeout: 5000 })
    // 4. Click confirm button in dialog (scope ke dialog, hindari salah klik item menu)
    const confirmDialog = page.locator('[role="alertdialog"], [role="dialog"]').filter({ hasText: "Hapus data ini?" }).first()
    await expect(confirmDialog).toBeVisible({ timeout: 5000 })
    await confirmDialog.getByRole("button", { name: /^hapus$/i }).click()
    // 5. Verify gone via unique code text on direct search page (avoid stale table rows)
    await page.goto(`/keuangan/pusat-biaya?cari=${encodeURIComponent(code)}`, {
      waitUntil: "domcontentloaded",
    })

    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(code, { timeout: 30000 })
  })
})
