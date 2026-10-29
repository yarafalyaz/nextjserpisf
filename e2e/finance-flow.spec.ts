import { test, expect } from "@playwright/test"

// Assertion wajib heading spesifik halaman (getByRole heading) PLUS satu
// penanda konten spesifik halaman (CTA khas / placeholder cari khas /
// header kolom khas), BUKAN `body.toContainText(label)`: label menu
// sidebar selalu ada di body, jadi pola lama hijau walau halaman isinya
// salah/blank.
test.describe("Finance module flows", () => {
  test("Expense list loads", async ({ page }) => {
    await page.goto("/keuangan/pengeluaran")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading", { name: "Pengeluaran" })).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole("link", { name: "+ Buat Pengeluaran" })).toBeVisible({ timeout: 30000 })
    await expect(page.getByPlaceholder("Cari pengeluaran...")).toBeVisible({ timeout: 30000 })
  })

  test("Expense create form loads", async ({ page }) => {
    await page.goto("/keuangan/pengeluaran/tambah")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("form").first()).toBeVisible({ timeout: 30000 })
  })

  test("Petty cash list loads", async ({ page }) => {
    await page.goto("/keuangan/kas-kecil")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading", { name: "Transaksi Kas Kecil" })).toBeVisible({ timeout: 30000 })
    await expect(page.getByText("Saldo Kas Kecil")).toBeVisible({ timeout: 30000 })
    await expect(page.getByPlaceholder("Cari Kas Kecil...")).toBeVisible({ timeout: 30000 })
  })

  test("Journal list loads", async ({ page }) => {
    await page.goto("/keuangan/jurnal")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading", { name: "Jurnal" })).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole("link", { name: "+ Buat Jurnal" })).toBeVisible({ timeout: 30000 })
    await expect(page.getByPlaceholder("Cari no. jurnal atau deskripsi...")).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole("columnheader", { name: "Baris" })).toBeVisible({ timeout: 30000 })
  })

  test("Journal create form loads", async ({ page }) => {
    await page.goto("/keuangan/jurnal/tambah")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("form").first()).toBeVisible({ timeout: 30000 })
  })

})
