import { afterAll, describe, expect, it } from "vitest"
import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db/prisma"

/**
 * Integritas lapisan FIFO + tautan pembayaran (putaran 250) — READ-ONLY,
 * gate `RUN_DB_INTEGRATION=1`. Aman terhadap DB dev yang dirawat tangan.
 *
 *  1. Setiap lapisan `inventory_layers` wajib matematikanya benar:
 *     `remaining = qty_in − qty_out`, `remaining >= 0`, dan
 *     `qty_out <= qty_in` — kaki kecil yang kalau bocor membuat costing
 *     FIFO meloncat.
 *  2. Sumber lapisan wajib baris stok gerakan yang ada (`stock_move_id`
 *     menunjuk `stock_moves` yang hidup).
 *  3. Agregat lapisan vs gerakan per (item, gudang) wajib setuju:
 *     Σ layers qty_in == Σ moves IN posted, dan sama untuk OUT.
 *     Kartu stok dibangun dari moves, valuasi dari layers; dua pembaca
 *     tabel berbeda wajib meluluskan angka yang sama.
 *  4. Pembayaran penjualan `posted` wajib menunjuk faktur yang ada
 *     (dan hidup); nominalnya positif.
 */

const SKIP = process.env.RUN_DB_INTEGRATION !== "1"

describe.skipIf(SKIP)("integritas lapisan FIFO + tautan pembayaran (DB, read-only)", () => {
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it("setiap lapisan korrapon: remaining = qty_in − qty_out, tak negatif, qty_out tak lebih besar", async () => {
    const layers = await prisma.inventoryLayer.findMany({
      select: { id: true, qtyIn: true, qtyOut: true, remaining: true },
    })
    const broken = layers.filter(
      (layer) =>
        Math.abs(Number(layer.qtyIn) - Number(layer.qtyOut) - Number(layer.remaining)) >= 0.005 ||
        Number(layer.qtyOut) > Number(layer.qtyIn) + 0.005 ||
        Number(layer.remaining) < -0.005,
    )
    expect(broken.map((layer) => layer.id)).toEqual([])
  })

  it("sumber lapisan wajib gerakan stok yang ada", async () => {
    const rows = await prisma.$queryRaw<Array<{ id: number; stock_move_id: number | null }>>`
      SELECT l.id, l.stock_move_id FROM inventory_layers l
      LEFT JOIN stock_moves m ON m.id = l.stock_move_id
      WHERE m.id IS NULL
    `
    expect(rows.map((row) => row.id)).toEqual([])
  })

  it("agregat lapisan (item,gudang) == agregat gerakan posted per arahan", async () => {
    const agg = await prisma.$queryRaw<
      Array<{
        item_id: number
        warehouse_id: number
        l_in: Prisma.Decimal
        l_out: Prisma.Decimal
        m_in: Prisma.Decimal
        m_out: Prisma.Decimal
      }>>
    `
      SELECT l.item_id, l.warehouse_id,
             SUM(l.qty_in) AS l_in, SUM(l.qty_out) AS l_out,
             COALESCE(SUM(CASE WHEN m.impact = 'IN' THEN m.qty END), 0) AS m_in,
             COALESCE(SUM(CASE WHEN m.impact = 'OUT' THEN m.qty END), 0) AS m_out
      FROM inventory_layers l
      LEFT JOIN stock_moves m ON m.item_id = l.item_id
                             AND m.warehouse_id <=> l.warehouse_id
                             AND m.status = 'posted'
      GROUP BY l.item_id, l.warehouse_id
    `
    const drifted = agg.filter(
      (row) =>
        Math.abs(Number(row.l_in) - Number(row.m_in)) >= 0.005 ||
        Math.abs(Number(row.l_out) - Number(row.m_out)) >= 0.005,
    )
    expect(drifted).toEqual([])
  })

  it("pembayaran penjualan posted wajib menunjuk faktur hidup dengan nominal positif", async () => {
    const rows = await prisma.$queryRaw<
      Array<{ payment_id: number; document_no: string | null; amount: Prisma.Decimal }>>(
      Prisma.sql`
        SELECT p.id AS payment_id, si.document_no AS document_no, p.amount
        FROM sales_payments p
        LEFT JOIN sales_invoices si ON si.id = p.sales_invoice_id AND si.deleted_at IS NULL
        WHERE p.status = 'posted' AND (si.id IS NULL OR p.amount <= 0)
      `,
    )
    const problems = rows.map((row) =>
      row.document_no ? `faktur ${row.document_no}` : `payment ${row.payment_id}`,
    )
    expect(problems).toEqual([])
  })
})
