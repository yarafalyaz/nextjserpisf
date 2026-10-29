import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"

test.describe("Pindai Barang + Barcode wiring", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Scan/barcode wiring khusus desktop")
  })

  test("halaman scan tampil + kode tak dikenal ditolak berisik", async ({ page }) => {
    await page.goto("/inventaris/scan", { waitUntil: "domcontentloaded" })

    await expect(page.getByRole("heading", { name: "Pindai Barang" })).toBeVisible({ timeout: 30000 })
    await expect(page.locator("#scan-code")).toBeVisible()

    await page.locator("#scan-code").fill("KODE-TIDAK-ADA-E2E")
    await page.getByRole("button", { name: "Buka Detail Barang" }).click()

    await expect(page.locator("body")).toContainText("tidak ditemukan", { timeout: 30000 })
    await expect(page).toHaveURL(/\/inventaris\/scan/)
  })

  test("daftar barcode punya aksi Lihat Detail + Ubah ke rute slug/id", async ({ page }) => {
    await page.goto("/master/barcode", { waitUntil: "domcontentloaded" })

    await expect(page.getByRole("heading", { name: "Barcode" })).toBeVisible({ timeout: 30000 })

    const firstRow = page.getByRole("row").nth(1)
    // DB seed kosong wajar: tanpa baris, wiring tidak bisa dibuktikan dari UI.
    if ((await page.getByRole("row").count()) < 2) {
      test.skip(true, "Tidak ada baris barcode di DB uji")
    }
    await expect(firstRow).toBeVisible({ timeout: 30000 })
    // Tunggu tombol benar-benar ter-render (hidrasi selesai) sebelum klik —
    // klik langsung balapan dengan hidrasi saat server sibuk oleh worker lain.
    const actionButton = firstRow.getByRole("button", { name: "Buka menu aksi" })
    await expect(actionButton).toBeVisible({ timeout: 30_000 })
    await actionButton.click()

    await expect(page.getByRole("menuitem", { name: "Lihat Detail" })).toBeVisible()
    await expect(page.getByRole("menuitem", { name: "Ubah" })).toBeVisible()

    await page.getByRole("menuitem", { name: "Lihat Detail" }).click()
    await page.waitForURL(/\/master\/barcode\/[^/]+$/, { timeout: 30000 })
    await expect(page.getByRole("heading", { name: "Detail Barcode" })).toBeVisible({ timeout: 30000 })
  })
})
