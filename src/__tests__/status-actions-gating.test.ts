import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Gerbang tombol status generik (Setujui/Tolak via /api/workflow).
 *
 * Dua penyakit yang dijaga di sini:
 * 1. Tagihan vendor pernah merender Setujui generik di samping Konfirmasi
 *    domain. Setujui hanya membalik status ke approved tanpa jurnal dan
 *    tanpa balanceDue — sesudahnya Konfirmasi hilang (draft-only) dan Bayar
 *    terkunci (balanceDue 0): tagihan terkunci permanen (C-01 scan
 *    2026-10-21). Faktur penjualan sudah lebih dulu dicabut dengan alasan
 *    yang sama.
 * 2. StatusActions menampilkan Setujui/Tolak murni dari status, tanpa izin
 *    approve — pengaju melihat tombol Setujui atas pengajuannya sendiri dan
 *    hanya menerima FORBIDDEN. Halaman pemanggil wajib meneruskan `canAct`
 *    dari izin approve_* modulnya.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8")

describe("StatusActions tidak menumpuk aksi domain", () => {
  it("detail tagihan vendor tanpa Setujui generik, Konfirmasi tetap ada", () => {
    const source = read("src/app/(dashboard)/pembelian/tagihan/[slug]/page.tsx")

    expect(source).not.toMatch(/<StatusActions\s+status=/)
    expect(source).not.toMatch(/from "@\/components\/ui\/status-actions"/)
    expect(source).toMatch(/action=\{confirmVendorBill\}/)
  })

  it("detail faktur penjualan tetap tanpa Setujui generik", () => {
    const source = read("src/app/(dashboard)/penjualan/faktur/[slug]/page.tsx")

    expect(source).not.toMatch(/<StatusActions\s+status=/)
    expect(source).toMatch(/action=\{postInvoice\}/)
  })
})

describe("StatusActions digerbangi izin approve", () => {
  it("komponen hanya menawarkan tombol bila canAct", () => {
    const source = read("src/components/ui/status-actions.tsx")

    expect(source).toMatch(/canAct = true/)
    expect(source).toMatch(/canAct && \["draft", "pending", "sent"\]\.includes\(status\)/)
  })

  it.each([
    ["src/app/(dashboard)/penjualan/pesanan/[slug]/page.tsx", "approve_sales_orders"],
    ["src/app/(dashboard)/penjualan/penawaran/[slug]/page.tsx", "approve_quotations"],
    ["src/app/(dashboard)/pembelian/permintaan/[slug]/page.tsx", "approve_purchase_requests"],
    ["src/app/(dashboard)/pembelian/pesanan/[slug]/page.tsx", "approve_purchase_orders"],
    ["src/app/(dashboard)/sdm/cuti/[slug]/page.tsx", "approve_leave_requests"],
    ["src/app/(dashboard)/sdm/lembur/[slug]/page.tsx", "approve_overtime_requests"],
  ])("%s meneruskan canAct dari %s", (file, permission) => {
    const source = read(file)

    expect(source).toMatch(new RegExp(`hasPermission\\("${permission}"\\)`))
    expect(source).toMatch(/canAct=\{canApprove\}/)
  })
})
