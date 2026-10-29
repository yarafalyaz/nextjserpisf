import { test, expect } from "@playwright/test"

// Assertion wajib heading spesifik halaman (getByRole heading) PLUS satu
// penanda konten spesifik halaman (CTA khas / label form), BUKAN
// `body.toContainText(label)`: label menu sidebar selalu ada di body,
// jadi pola lama hijau walau halaman isinya salah/blank.
test.describe("Payroll module flows", () => {
  test("Payroll list loads", async ({ page }) => {
    await page.goto("/sdm/penggajian")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading", { name: "Penggajian" })).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole("link", { name: "+ Proses Manual" })).toBeVisible({ timeout: 30000 })
  })

  test("Payroll create form loads", async ({ page }) => {
    await page.goto("/sdm/penggajian/tambah")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading", { name: "Proses Penggajian Karyawan" })).toBeVisible({ timeout: 30000 })
    await expect(page.locator("form").first()).toBeVisible({ timeout: 30000 })
    await expect(page.getByText("Pusat Biaya")).toBeVisible({ timeout: 30000 })
  })

  test("Employee loan list loads", async ({ page }) => {
    await page.goto("/sdm/pinjaman")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading", { name: "Pinjaman Karyawan" })).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole("link", { name: "Tambah Pinjaman" })).toBeVisible({ timeout: 30000 })
  })

  test("Leave request list loads", async ({ page }) => {
    await page.goto("/sdm/cuti")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading", { name: "Permintaan Cuti" })).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole("link", { name: "+ Ajukan Cuti" })).toBeVisible({ timeout: 30000 })
  })
})
