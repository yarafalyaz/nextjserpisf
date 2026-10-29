import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"

test.describe("Master Syarat Pembayaran CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Syarat Pembayaran CRUD khusus desktop")
  })

  test("create → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `Termin E2E ${ts}`
    const code = `E2E${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/master/syarat-pembayaran/tambah", {
      waitUntil: "domcontentloaded",
    })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("form").first()).toBeVisible({ timeout: 30_000 })

    await expect(
      page.getByRole("heading", { name: "Tambah Termin Pembayaran" })
    ).toBeVisible({ timeout: 30000 })

    await page.locator("#name").fill(name)
    await page.locator("#code").fill(code)
    await page.locator("#days").fill("14")
    await expect(page.getByRole("button", { name: "Simpan" }).first()).toBeEnabled({ timeout: 15_000 })
    // `.first()`: nama "Simpan" dicocokkan sebagai substring oleh getByRole,
    // jadi locator dipersempit ke tombol submit pertama agar tahan terhadap
    // tombol lain ber-label serupa.
    await page.getByRole("button", { name: "Simpan" }).first().click()

    await page.waitForURL("**/master/syarat-pembayaran", { timeout: 30000 })
    await page.waitForLoadState("networkidle")

    // Verify row exists in table — try getByRole first, fallback to getByText
    let row = page.getByRole("row", { name: new RegExp(name) })
    if (!(await row.isVisible().catch(() => false))) {
      // Fallback: find via text then navigate to parent row
      row = page.getByText(name).locator("xpath=ancestor::tr")
    }
    await expect(row).toBeVisible({ timeout: 10000 })

    // ─── DELETE ───────────────────────────────────────────────
    // Open action dropdown menu
    await row.getByRole("button", { name: "Buka menu aksi" }).click()
    await page.getByRole("menuitem", { name: "Hapus" }).first().click()

    // Confirm dialog (`.first()` — judul ini juga dipakai ConfirmDialog di
    // delete-button.tsx / action-dropdown.tsx).
    await expect(page.getByText("Hapus data ini?").first()).toBeVisible({ timeout: 5000 })
    await page.getByRole("button", { name: "Hapus" }).click({ timeout: 10000 })

    await page.waitForLoadState("networkidle")

    // Reload and verify gone — retry up to 3x for resilience
    let gone = false
    for (let i = 0; i < 3; i++) {
      await page.goto("/master/syarat-pembayaran", {
        waitUntil: "domcontentloaded",
      })
      await expect(page.locator("table").first()).toBeVisible({ timeout: 30_000 })
      await page.waitForLoadState("networkidle")
      gone = !(await page.locator("body").innerText()).includes(name)
      if (gone) break
      // Still exists — retry delete
      const retryText = page.getByText(name)
      if (await retryText.isVisible().catch(() => false)) {
        const retryRow = retryText.locator("xpath=ancestor::tr")
        await retryRow.getByRole("button", { name: "Buka menu aksi" }).click()
        await page.getByRole("menuitem", { name: "Hapus" }).first().click()
        await page.getByRole("button", { name: "Hapus" }).click({ timeout: 10000 })
        await page.waitForLoadState("networkidle")
      }
    }
    expect(gone).toBe(true)
  })
})
