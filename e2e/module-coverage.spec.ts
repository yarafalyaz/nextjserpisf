import { test, expect, type Page } from "@playwright/test"


async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(5000)
}

test.describe("Produksi - Products CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/produksi/products", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Product")

    await page.goto("/produksi/products/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Tambah Produk")
  })
})

test.describe("Produksi - Production Order CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/produksi/production-orders", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Production")

    await page.goto("/produksi/production-orders/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Buat")
  })
})

test.describe("Produksi - Work Order CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/produksi/perintah-kerja", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Perintah Kerja")

    await page.goto("/produksi/perintah-kerja/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Buat")
  })
})

test.describe("Inventaris - Rak CRUD", () => {
  test("create → detail → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `Rak E2E ${ts}`
    const code = `RE2E${String(ts).slice(-4)}`

    await page.goto("/inventaris/rak/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await page.locator("#code").first().fill(code)
    await page.locator("#name").first().fill(name)
    await page.locator("#warehouseId").first().fill("1")
    await page.locator("#submit-rack, button[type='submit']").first().click()
    await page.waitForURL("**/inventaris/rak**", { timeout: 20000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // Delete via menu
    const row = page.locator("tr").filter({ hasText: name }).first()
    await expect(row).toBeVisible({ timeout: 10000 })
    await row.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
    await expect(page.getByText("Hapus data ini?")).toBeVisible({ timeout: 5000 })
    await page.locator("button").filter({ hasText: "Hapus" }).last().click()
    await expect(page.locator("body")).not.toContainText(name, { timeout: 10000 })
  })
})

test.describe("Inventaris - Penyesuaian (Adjustment) CRUD", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/inventaris/penyesuaian", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Penyesuaian")
  })
})

test.describe("Inventaris - Transfer CRUD", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/inventaris/transfer", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Transfer")
  })
})

test.describe("Penjualan - Uang Muka (Advance) CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/penjualan/uang-muka", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Uang Muka")

    await page.goto("/penjualan/uang-muka/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Down Payment")
  })
})

test.describe("Penjualan - Retur CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/penjualan/retur", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Retur")

    await page.goto("/penjualan/retur/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Retur")
  })
})

test.describe("Penjualan - Surat Jalan CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/penjualan/surat-jalan", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Surat Jalan")

    await page.goto("/penjualan/surat-jalan/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Surat Jalan")
  })
})

test.describe("Pembelian - Retur CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/pembelian/retur", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Retur")

    await page.goto("/pembelian/retur/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Retur")
  })
})

test.describe("Pembelian - Pembayaran Vendor CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/pembelian/pembayaran-vendor", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Pembayaran")

    await page.goto("/pembelian/pembayaran-vendor/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Pembayaran")
  })
})

test.describe("Penjualan - Pembayaran CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/penjualan/pembayaran", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Pembayaran")

    await page.goto("/penjualan/pembayaran/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Pembayaran")
  })
})

test.describe("Keuangan - Jurnal CRUD", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/keuangan/jurnal", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Jurnal")
  })
})

test.describe("Keuangan - Kas Kecil CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/keuangan/kas-kecil", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Kas Kecil")

    await page.goto("/keuangan/kas-kecil/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Kas Kecil")
  })
})

test.describe("Keuangan - Pengeluaran CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/keuangan/pengeluaran", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Expenses")

    await page.goto("/keuangan/pengeluaran/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Expense")
  })
})

test.describe("Keuangan - Anggaran CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/keuangan/anggaran", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Anggaran")

    await page.goto("/keuangan/anggaran/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Budget")
  })
})

test.describe("SDM - Cuti CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/sdm/cuti", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Cuti")

    await page.goto("/sdm/cuti/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Cuti")
  })
})

test.describe("SDM - Lembur CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/sdm/lembur", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Lembur")

    await page.goto("/sdm/lembur/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Lembur")
  })
})

test.describe("SDM - Jadwal Kerja CRUD", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/sdm/jadwal-kerja", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Jadwal Kerja")
  })
})

test.describe("CRM - Tickets CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/crm/tickets", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Ticket")

    await page.goto("/crm/tickets/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Ticket")
  })
})

test.describe("Pengaturan - Pengguna CRUD", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/pengaturan/pengguna", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Pengguna")
  })
})

test.describe("Pengaturan - Persetujuan CRUD", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/pengaturan/persetujuan", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Persetujuan")
  })
})

test.describe("Proyek - Tugas CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/proyek/tugas", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Tugas")

    await page.goto("/proyek/tugas/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Tugas")
  })
})

test.describe("Aset - Transfer CRUD", () => {
  test("list loads + create form loads", async ({ page }) => {
    await page.goto("/aset/transfer", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Transfer")

    await page.goto("/aset/transfer/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await expect(page.locator("body")).toContainText("Transfer")
  })
})

test.describe("Laporan - Laba Rugi", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/laporan/laba-rugi", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Laba Rugi")
  })
})

test.describe("Laporan - Neraca", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/laporan/neraca", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Neraca")
  })
})

test.describe("Laporan - Arus Kas", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/laporan/arus-kas", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Arus Kas")
  })
})

test.describe("Laporan - Stok", () => {
  test("list loads", async ({ page }) => {
    await page.goto("/laporan/ringkasan-stok", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Persediaan")
  })
})
