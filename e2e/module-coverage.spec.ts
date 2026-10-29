import { test, expect, type Page } from "@playwright/test"

// Assertion wajib heading spesifik halaman (getByRole heading), BUKAN
// `body.toContainText(label)`: label menu sidebar selalu ada di body,
// jadi pola lama hijau walau halaman isinya salah/blank.
import { selectFirstComboboxOption } from "./utils/combobox"


async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  // Tanpa sleep: assertion web-first sesudah ini (toContainText/toBeVisible)
  // yang menunggu hydration selesai.
}

test.describe("Produksi - Products CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/produksi/products", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Produk" })).toBeVisible({ timeout: 30000 })

    await page.goto("/produksi/products/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Tambah Produk (BOM)" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Produksi - Production Order CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/produksi/production-orders", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Perintah Produksi" })).toBeVisible({ timeout: 30000 })

    await page.goto("/produksi/production-orders/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Buat Perintah Produksi" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Produksi - Work Order CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/produksi/perintah-kerja", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Perintah Kerja" })).toBeVisible({ timeout: 30000 })

    await page.goto("/produksi/perintah-kerja/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Buat Perintah Kerja" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Inventaris - Rak CRUD", () => {
  test("create → detail → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `Rak E2E ${ts}`
    const code = `RE2E${String(ts).slice(-4)}`

    await page.goto("/inventaris/rak/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)

    const codeInput = page.locator("#code").first()
    await expect(codeInput).toBeVisible({ timeout: 10000 })
    // Code is auto-generated (read-only) when auto-code is enabled; only fill if editable.
    if (await codeInput.isEditable()) {
      await codeInput.fill(code)
    }
    await page.locator("#name").first().fill(name)

    // Warehouse is a searchable combobox; pick the first available warehouse.
    await selectFirstComboboxOption(page, { placeholder: "Cari gudang..." })

    await page.locator("#submit-rack, button[type='submit']").first().click()

    // Wait for the redirect to the rack list. A visible form error means the
    // create path is broken (validation, a permission redirect such as
    // requirePermission -> "/", or a 500). This used to be `test.skip(...)`,
    // which converted every broken create into a green "skipped" run and hid
    // the defect from CI - the whole point of this suite is to catch it.
    try {
      await page.waitForURL("**/inventaris/rak", { timeout: 30000 })
    } catch {
      const errorText = (await page
        .locator(".text-danger, [role='alert']")
        .first()
        .textContent()
        .catch(() => "")) || ""
      throw new Error(
        "Tambah rak tidak mengarah ke /inventaris/rak" +
          (errorText.trim() ? ` - pesan form: ${errorText.trim()}` : " (tanpa pesan error yang terlihat)"),
      )
    }

    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name, { timeout: 10000 })

    // Delete via menu
    const row = page.locator("tr:visible, ul[role='list'] > li:visible").filter({ hasText: name }).first()
    await expect(row).toBeVisible({ timeout: 10000 })
    await row.locator("button[aria-label='Buka menu aksi']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
    await expect(page.getByText("Hapus data ini?")).toBeVisible({ timeout: 5000 })
    await page.locator("button").filter({ hasText: "Hapus" }).last().click()
    await expect(page.locator("body")).not.toContainText(name, { timeout: 10000 })
  })
})

test.describe("Inventaris - Penyesuaian (Adjustment) CRUD", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/inventaris/penyesuaian", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Penyesuaian Stok" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Inventaris - Transfer CRUD", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/inventaris/transfer", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Transfer Inventaris" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Penjualan - Uang Muka (Advance) CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/penjualan/uang-muka", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Uang Muka" })).toBeVisible({ timeout: 30000 })

    await page.goto("/penjualan/uang-muka/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Buat Uang Muka" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Penjualan - Retur CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/penjualan/retur", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Retur Penjualan" })).toBeVisible({ timeout: 30000 })

    await page.goto("/penjualan/retur/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Buat Retur Penjualan" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Penjualan - Surat Jalan CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/penjualan/surat-jalan", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Surat Jalan" })).toBeVisible({ timeout: 30000 })

    await page.goto("/penjualan/surat-jalan/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Buat Surat Jalan" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Pembelian - Retur CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/pembelian/retur", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Retur Pembelian" })).toBeVisible({ timeout: 30000 })

    await page.goto("/pembelian/retur/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Buat Retur Pembelian" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Pembelian - Pembayaran Vendor CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/pembelian/pembayaran-vendor", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Pembayaran Pemasok" })).toBeVisible({ timeout: 30000 })

    await page.goto("/pembelian/pembayaran-vendor/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Buat Pembayaran Pemasok" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Penjualan - Pembayaran CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/penjualan/pembayaran", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Pembayaran Penjualan" })).toBeVisible({ timeout: 30000 })

    await page.goto("/penjualan/pembayaran/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Terima Pembayaran" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Keuangan - Jurnal CRUD", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/keuangan/jurnal", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Jurnal" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Keuangan - Kas Kecil CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/keuangan/kas-kecil", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Transaksi Kas Kecil" })).toBeVisible({ timeout: 30000 })

    await page.goto("/keuangan/kas-kecil/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Buat Transaksi Kas Kecil" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Keuangan - Pengeluaran CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/keuangan/pengeluaran", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Pengeluaran" })).toBeVisible({ timeout: 30000 })

    await page.goto("/keuangan/pengeluaran/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Buat Pengeluaran" })).toBeVisible({ timeout: 30000 })
  })
})


test.describe("SDM - Cuti CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/sdm/cuti", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Permintaan Cuti" })).toBeVisible({ timeout: 30000 })

    await page.goto("/sdm/cuti/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Ajukan Cuti" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("SDM - Lembur CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/sdm/lembur", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Permintaan Lembur" })).toBeVisible({ timeout: 30000 })

    await page.goto("/sdm/lembur/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Ajukan Lembur" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("CRM - Tickets CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/crm/tickets", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Tiket Dukungan" })).toBeVisible({ timeout: 30000 })

    await page.goto("/crm/tickets/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Buat Tiket" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Pengaturan - Pengguna CRUD", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/pengaturan/pengguna", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Pengguna & Peran" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Pengaturan - Persetujuan CRUD", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/pengaturan/persetujuan", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Alur Persetujuan" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Proyek - Tugas CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/proyek/tugas", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Tugas Proyek" })).toBeVisible({ timeout: 30000 })

    await page.goto("/proyek/tugas/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Tambah Tugas" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Aset - Transfer CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/aset/transfer", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Transfer Aset" })).toBeVisible({ timeout: 30000 })

    await page.goto("/aset/transfer/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.getByRole("heading", { name: "Buat Transfer Aset" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Laporan - Laba Rugi", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/laporan/laba-rugi", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Laba Rugi" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Laporan - Neraca", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/laporan/neraca", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Neraca" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Laporan - Arus Kas", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/laporan/arus-kas", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Arus Kas" })).toBeVisible({ timeout: 30000 })
  })
})

test.describe("Laporan - Stok", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/laporan/ringkasan-stok", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "Ringkasan Persediaan" })).toBeVisible({ timeout: 30000 })
  })
})
