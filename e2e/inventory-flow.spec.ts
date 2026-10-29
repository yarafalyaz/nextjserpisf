import { test, expect } from "@playwright/test"

// Assertion wajib heading spesifik halaman (getByRole heading) PLUS satu
// penanda konten spesifik halaman (CTA khas / placeholder cari khas /
// header kolom khas), BUKAN `body.toContainText(label)`: label menu
// sidebar selalu ada di body, jadi pola lama hijau walau halaman isinya
// salah/blank.
test.describe("Inventory module flows", () => {
  test("Stock adjustment list loads", async ({ page }) => {
    await page.goto("/inventaris/penyesuaian")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading", { name: "Penyesuaian Stok" })).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole("link", { name: "+ Buat Penyesuaian" })).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole("columnheader", { name: "Alasan" })).toBeVisible({ timeout: 30000 })
  })

  test("Stock adjustment create form loads", async ({ page }) => {
    await page.goto("/inventaris/penyesuaian/tambah")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("form").first()).toBeVisible({ timeout: 30000 })
  })

  test("Material issue list loads", async ({ page }) => {
    await page.goto("/inventaris/pengeluaran-material")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading", { name: "Pengeluaran Material" })).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole("link", { name: "+ Buat Pengeluaran Material" })).toBeVisible({ timeout: 30000 })
  })

  test("Stock transfer list loads", async ({ page }) => {
    await page.goto("/inventaris/transfer")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading", { name: "Transfer Inventaris" })).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole("link", { name: "+ Buat Transfer" })).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole("columnheader", { name: "Dari" })).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole("columnheader", { name: "Ke" })).toBeVisible({ timeout: 30000 })
  })

  test("Stock mutation list loads", async ({ page }) => {
    await page.goto("/inventaris/mutasi-stok")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading", { name: "Pergerakan Stok" })).toBeVisible({ timeout: 30000 })
    await expect(page.getByPlaceholder("Cari no. dokumen, barang, atau gudang...")).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole("columnheader", { name: "Tgl. Transaksi" })).toBeVisible({ timeout: 30000 })
  })
})
