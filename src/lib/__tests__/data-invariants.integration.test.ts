/**
 * Invariant DATA lintas-tabel, dijalankan terhadap DB nyata.
 *
 * Ini kelas bug yang tidak bisa ditangkap unit test (mock tidak punya data)
 * dan tidak tertangkap membaca kode (kode benar per-jalur, tetapi kombinasi
 * jalur meninggalkan data tak konsisten). Audit 2026-11-17 menemukan
 * pelanggaran seperti ini di kode sebelum ketahuan lewat query DB.
 *
 * READ-ONLY: tidak ada INSERT/UPDATE/DELETE. Aman dijalankan terhadap DB
 * mana pun, tetapi tetap opt-in seperti suite integrasi lain:
 *
 *   DATABASE_URL="mysql://user:pass@host:3306/db" \
 *     RUN_DB_INTEGRATION=1 \
 *     npx vitest run src/lib/__tests__/data-invariants.integration.test.ts
 *
 * Setiap invariant yang gagal MENYEBUT barisnya (id) supaya bisa langsung
 * diselidiki; jumlah saja tidak cukup untuk bertindak.
 */
import { describe, it, expect, beforeAll } from "vitest"

import { prisma } from "@/lib/db/prisma"

const RUN = process.env.RUN_DB_INTEGRATION === "1"

beforeAll(async () => {
  if (!RUN) return
  // Gagal konek = suite gagal keras saat opt-in; jangan lulus hampa.
  await prisma.$queryRaw`SELECT 1`
})

describe.skipIf(!RUN)("invariant data lintas-tabel", () => {
  it("setiap jurnal POSTED/REVERSED punya header yang sama dengan Σ entri", async () => {
    const rows = await prisma.$queryRaw<Array<{ id: number; total_debit: unknown; jumlah: unknown }>>`
      SELECT j.id, j.total_debit,
             (SELECT COALESCE(SUM(e.debit), 0) FROM journal_entries e WHERE e.journal_id = j.id) AS jumlah
      FROM journals j
      WHERE j.status IN ('POSTED', 'REVERSED')
        AND ABS(j.total_debit - (SELECT COALESCE(SUM(e.debit), 0) FROM journal_entries e WHERE e.journal_id = j.id)) > 0.01
      LIMIT 20
    `
    expect(rows.map((r) => r.id)).toEqual([])
  })

  it("tidak ada entri jurnal yatim", async () => {
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT je.id FROM journal_entries je
      LEFT JOIN journals j ON j.id = je.journal_id
      WHERE j.id IS NULL LIMIT 20
    `
    expect(rows.map((r) => r.id)).toEqual([])
  })

  it("tidak ada saldo FIFO negatif maupun qty_on_hand negatif", async () => {
    const layer = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM inventory_layers WHERE remaining < 0 LIMIT 20
    `
    expect(layer.map((r) => r.id)).toEqual([])
    const item = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM items WHERE qty_on_hand < 0 LIMIT 20
    `
    expect(item.map((r) => r.id)).toEqual([])
  })

  it("baris line-item tidak menunjuk item yang hilang", async () => {
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT i.id FROM work_order_items i
      LEFT JOIN items t ON t.id = i.item_id
      WHERE i.item_id IS NOT NULL AND t.id IS NULL
      UNION ALL
      SELECT i.id FROM sales_return_items i LEFT JOIN items t ON t.id = i.item_id WHERE t.id IS NULL
      UNION ALL
      SELECT i.id FROM purchase_order_items i LEFT JOIN items t ON t.id = i.item_id WHERE t.id IS NULL
      LIMIT 20
    `
    expect(rows.map((r) => r.id)).toEqual([])
  })

  it("faktur berstatus paid tidak menyisakan sisa tagihan", async () => {
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM sales_invoices
      WHERE payment_status = 'paid' AND grand_total - paid_amount > 0.01
      LIMIT 20
    `
    expect(rows.map((r) => r.id)).toEqual([])
  })

  it("komisi tidak pernah dibayar melebihi saldo akrual", async () => {
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM commission_payables
      WHERE paid_amount > accrued_amount - reversal_amount + 0.01
      LIMIT 20
    `
    expect(rows.map((r) => r.id)).toEqual([])
  })
  it("faktur pajak tidak punya nomor ganda pada arah yang sama", async () => {
    const rows = await prisma.$queryRaw<Array<{ direction: string; nomor: string }>>`
      SELECT direction, tax_invoice_number AS nomor
      FROM tax_invoices
      WHERE tax_invoice_number IS NOT NULL
      GROUP BY direction, tax_invoice_number
      HAVING COUNT(*) > 1
      LIMIT 20
    `
    expect(rows.map((r) => `${r.direction}:${r.nomor}`)).toEqual([])
  })

  it("kewajiban pajak tidak pernah dibayar melebihi kuantitas kas yang diatribusikan", async () => {
    // Pajak mustahil dipotong lebih besar dari DPP-nya.
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM withholding_certificates
      WHERE dpp > 0 AND withheld_amount > dpp + 0.01
      LIMIT 20
    `
    expect(rows.map((r) => r.id)).toEqual([])
  })

  it("slip gaji tidak pernah bernilai negatif atau melebihi bruto", async () => {
    const negatif = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM payrolls WHERE net_salary < 0 LIMIT 20
    `
    expect(negatif.map((r) => r.id)).toEqual([])
    const lebih = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM payrolls WHERE net_salary > gross_salary + 0.01 LIMIT 20
    `
    expect(lebih.map((r) => r.id)).toEqual([])
  })

  it("potongan statutori payroll tidak negatif", async () => {
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM payrolls
      WHERE pph21 < 0 OR bpjs_health_employee < 0 OR bpjs_employment_employee < 0
      LIMIT 20
    `
    expect(rows.map((r) => r.id)).toEqual([])
  })

  it("penerimaan barang tidak melebihi qty pesanan", async () => {
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM purchase_order_items WHERE received_qty > qty + 0.001 LIMIT 20
    `
    expect(rows.map((r) => r.id)).toEqual([])
  })

  it("tagihan vendor tidak dibayar melebihi nilai tagihan", async () => {
    const rows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM vendor_bills WHERE paid_amount > grand_total + 0.01 LIMIT 20
    `
    expect(rows.map((r) => r.id)).toEqual([])
  })
})
