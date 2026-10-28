import "dotenv/config"
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "../../db/prisma"
import { toBaseFactor, toBaseQty } from "../uom.service"
import { consumeFifoLayers, createInLayer, availableQty } from "../inventory-fifo"
import {
  assertMaterialIssueStockOutOnce,
  assertSalesInvoiceStockOutOnce,
} from "../stock-out-once.service"

/**
 * DB integration tests for the per-warehouse FIFO + Multi-UoM + Batch/Serial
 * engine. This is intentionally opt-in: CI unit jobs and local no-DB runs must
 * not spend 10s waiting for an unreachable database. Run with
 * RUN_DB_INTEGRATION=1 when a test database is available.
 */
let dbUp = false
beforeAll(async () => {
  if (process.env.RUN_DB_INTEGRATION !== "1") return
  try {
    await prisma.$queryRaw`SELECT 1`
    dbUp = true
  } catch {
    dbUp = false
  }
})
afterAll(async () => {
  try { await prisma.$disconnect() } catch { /* ignore */ }
})

describe("Inventory engine (DB integration)", () => {
  it("enforces per-warehouse FIFO isolation, multi-UoM, batch & serial", async () => {
    if (process.env.RUN_DB_INTEGRATION !== "1") { console.warn("RUN_DB_INTEGRATION not enabled — skipping DB integration test"); return }
    if (!dbUp) { console.warn("DB not reachable — skipping integration test"); return }

    const stamp = Date.now()
    const whA = await prisma.warehouse.create({ data: { code: `ITA${stamp}`, name: `ITA ${stamp}` } })
    const whB = await prisma.warehouse.create({ data: { code: `ITB${stamp}`, name: `ITB ${stamp}` } })
    const item = await prisma.item.create({
      data: { sku: `IT${stamp}`, name: `IT ${stamp}`, unitOfMeasure: "PCS", trackBatch: true, trackSerial: true, isProduct: true, qtyOnHand: 0 },
    })
    await prisma.uomConversion.create({ data: { itemId: item.id, code: "BOX", factorToBase: 12 } })

    const moveIds: number[] = []
    try {
      // Multi-UoM conversion
      await prisma.$transaction(async (tx) => {
        expect(await toBaseFactor(tx, item.id, "BOX")).toBe(12)
        expect(await toBaseFactor(tx, item.id, "PCS")).toBe(1)
        expect(await toBaseQty(tx, item.id, "BOX", 2)).toBe(24)
      })

      // Inbound: 10 in A (BATCH-A), 5 in B (BATCH-B)
      const mvA = await prisma.stockMove.create({ data: { documentNo: `ITSMA${stamp}`, itemId: item.id, warehouseId: whA.id, qty: 10, cost: 100, impact: "IN", status: "posted" } })
      const mvB = await prisma.stockMove.create({ data: { documentNo: `ITSMB${stamp}`, itemId: item.id, warehouseId: whB.id, qty: 5, cost: 120, impact: "IN", status: "posted" } })
      moveIds.push(mvA.id, mvB.id)
      await prisma.$transaction(async (tx) => {
        await createInLayer(tx, { itemId: item.id, warehouseId: whA.id, batchNumber: "BATCH-A", stockMoveId: mvA.id, qty: 10, unitCost: 100 })
        await createInLayer(tx, { itemId: item.id, warehouseId: whB.id, batchNumber: "BATCH-B", stockMoveId: mvB.id, qty: 5, unitCost: 120 })
      })
      await prisma.itemBatch.create({ data: { itemId: item.id, batchNumber: "BATCH-A", warehouseId: whA.id, qty: 10 } })
      for (let i = 1; i <= 10; i++) {
        await prisma.itemSerial.create({ data: { itemId: item.id, serialNumber: `ISN-${stamp}-${i}`, warehouseId: whA.id, status: "available" } })
      }

      // Per-warehouse availability
      await prisma.$transaction(async (tx) => {
        expect(await availableQty(tx, item.id, whA.id)).toBe(10)
        expect(await availableQty(tx, item.id, whB.id)).toBe(5)
        expect(await availableQty(tx, item.id, null)).toBe(15)
      })

      // Consuming 8 from B must fail (only 5 there) even though global has 15
      let threw = false
      try {
        await prisma.$transaction((tx) => consumeFifoLayers(tx, { itemId: item.id, warehouseId: whB.id, qty: 8 }))
      } catch { threw = true }
      expect(threw).toBe(true)

      // Consuming 6 from A: succeeds, batch A -> 4, 6 serials used
      const res = await prisma.$transaction((tx) => consumeFifoLayers(tx, { itemId: item.id, warehouseId: whA.id, qty: 6 }))
      expect(Number(res.consumedCost)).toBe(600)
      const batchA = await prisma.itemBatch.findFirst({ where: { itemId: item.id, batchNumber: "BATCH-A" } })
      expect(Number(batchA?.qty)).toBe(4)
      const used = await prisma.itemSerial.count({ where: { itemId: item.id, status: "used" } })
      expect(used).toBe(6)
      const remainingA = await prisma.$transaction((tx) => availableQty(tx, item.id, whA.id))
      expect(remainingA).toBe(4)
    } finally {
      await prisma.itemSerial.deleteMany({ where: { itemId: item.id } })
      await prisma.itemBatch.deleteMany({ where: { itemId: item.id } })
      await prisma.inventoryLayer.deleteMany({ where: { itemId: item.id } })
      await prisma.stockMove.deleteMany({ where: { id: { in: moveIds } } })
      await prisma.uomConversion.deleteMany({ where: { itemId: item.id } })
      await prisma.item.delete({ where: { id: item.id } })
      await prisma.warehouse.deleteMany({ where: { id: { in: [whA.id, whB.id] } } })
    }
  })
})

/**
 * SAL-BR-014 (F-2026-10-28-122-S): bukti konkurensi pada DB NYATA.
 *
 * Temuan HIGH QA: guard tepat-satu-kali membaca StockMove lawan lewat
 * konsisten-read (snapshot REPEATABLE READ) dan berjalan SEBELUM kunci
 * baris items FOR UPDATE, sehingga dua posting konkuren atas dokumen
 * BERBEDA pada pohon quotation yang SAMA dengan stok yang CUKUP untuk
 * keduanya sama-sama lolos dan mengurangi stok dua kali.
 *
 * Perbaikan yang diuji di sini: kedua jalur mengunci baris `quotations`
 * pohon (FOR UPDATE) sebelum guard, lalu guard membaca move lawan sebagai
 * locking read. Posting kedua menunggu commit posting pertama dan ditolak.
 *
 * Uji ini juga mengunci perilaku konkurensi stok terakhir (INV-BR-007)
 * pada DB nyata: dua konsumen berbeda berebut unit terakhir — satu menang,
 * satu ditolak "Stok tidak mencukupi", lapisan tidak pernah negatif.
 */
describe("SAL-BR-014 serialisasi bersama (DB integration)", () => {
  const enabled = () => process.env.RUN_DB_INTEGRATION === "1" && dbUp

  it("dua posting konkuren dokumen berbeda pada pohon quotation sama: tepat satu pengeluaran (stok cukup)", async () => {
    if (!enabled()) {
      console.warn("RUN_DB_INTEGRATION/db tidak siap — skipping konkurensi SAL-BR-014")
      return
    }
    const stamp = `SAL014-${Date.now()}`
    const customer = await prisma.customer.create({ data: { name: `Cust ${stamp}` } })
    const warehouse = await prisma.warehouse.create({
      data: { code: `W${stamp}`, name: `WH ${stamp}` },
    })
    const item = await prisma.item.create({
      data: { sku: `SKU-${stamp}`, name: `Item ${stamp}`, unitOfMeasure: "PCS", isProduct: true, qtyOnHand: 0 },
    })
    const quotation = await prisma.quotation.create({
      data: { documentNo: `Q-${stamp}`, customerId: customer.id, date: new Date() },
    })
    const workOrder = await prisma.workOrder.create({
      data: {
        documentNo: `WO-${stamp}`,
        customerId: customer.id,
        quotationId: quotation.id,
        date: new Date(),
      },
    })
    const invoice = await prisma.salesInvoice.create({
      data: {
        documentNo: `INV-${stamp}`,
        customerId: customer.id,
        quotationId: quotation.id,
        date: new Date(),
      },
    })
    const issue = await prisma.materialIssue.create({
      data: {
        documentNo: `MI-${stamp}`,
        warehouseId: warehouse.id,
        workOrderId: workOrder.id,
        date: new Date(),
      },
    })

    const HOLD_MS = 900
    let signalLocked!: () => void
    const lockHeld = new Promise<void>((resolve) => {
      signalLocked = resolve
    })
    let salesError: unknown = null
    let issueError: unknown = null

    try {
      const salesTx = prisma
        .$transaction(
          async (tx) => {
            await assertSalesInvoiceStockOutOnce(tx, invoice.id, [{ itemId: item.id, qty: 3 }])
            // Kunci quotation sudah dipegang di titik ini (assert = lock dulu).
            signalLocked()
            await tx.stockMove.create({
              data: {
                documentNo: `SM-S-${stamp}`,
                itemId: item.id,
                warehouseId: warehouse.id,
                qty: 3,
                impact: "OUT",
                status: "posted",
                referenceType: "SalesInvoice",
                referenceId: invoice.id,
              },
            })
            // Tahan transaksi tetap terbuka: penantang WAJIB berbaris di
            // kunci bersama, bukan membaca snapshot sebelum commit.
            await new Promise((r) => setTimeout(r, HOLD_MS))
            return "sales"
          },
          { timeout: 30_000, maxWait: 10_000 },
        )
        .catch((e: unknown) => {
          salesError = e
          return null
        })

      await lockHeld

      const issueTx = prisma
        .$transaction(
          async (tx) => {
            await assertMaterialIssueStockOutOnce(tx, issue.id, [{ itemId: item.id, qty: 3 }])
            await tx.stockMove.create({
              data: {
                documentNo: `SM-M-${stamp}`,
                itemId: item.id,
                warehouseId: warehouse.id,
                qty: 3,
                impact: "OUT",
                status: "posted",
                referenceType: "MaterialIssue",
                referenceId: issue.id,
              },
            })
            return "material"
          },
          { timeout: 30_000, maxWait: 10_000 },
        )
        .catch((e: unknown) => {
          issueError = e
          return null
        })

      const [salesResult, issueResult] = await Promise.all([salesTx, issueTx])

      // Pemenang: faktur penjualan (memegang kunci lebih dulu).
      expect(salesError).toBeNull()
      expect(salesResult).toBe("sales")
      // Penantang: ditolak guard SETELAH melihat move lawan yang commit.
      expect(issueResult).toBeNull()
      expect(String((issueError as Error | null)?.message ?? "")).toMatch(/SAL-BR-014/)

      const outMoves = await prisma.stockMove.count({
        where: { itemId: item.id, impact: "OUT", status: "posted" },
      })
      expect(outMoves).toBe(1)
    } finally {
      await prisma.stockMove.deleteMany({ where: { itemId: item.id } })
      await prisma.materialIssue.delete({ where: { id: issue.id } }).catch(() => undefined)
      await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined)
      await prisma.salesInvoice.delete({ where: { id: invoice.id } }).catch(() => undefined)
      await prisma.quotation.delete({ where: { id: quotation.id } }).catch(() => undefined)
      await prisma.item.delete({ where: { id: item.id } }).catch(() => undefined)
      await prisma.warehouse.delete({ where: { id: warehouse.id } }).catch(() => undefined)
      await prisma.customer.delete({ where: { id: customer.id } }).catch(() => undefined)
    }
  })

  it("varian isolasi kunci bersama: penantang masuk guard SEBELUM move pemenang disisipkan (cabut kunci = MERAH)", async () => {
    // LOW-1 t_25a66a5d: varian ini mengisolasi kunci bersama `quotations`.
    // Beda dengan tes di atas: pemenang menunda `stockMove.create` 300 ms
    // SESUDAH `signalLocked()`, sehingga penantang dijamin sudah masuk
    // guard (berbaris di kunci quotations) sebelum baris `stock_moves`
    // pemenang ada. Tanpa `lockStockOutQuotationsTx` (locking read
    // dibiarkan) kedua guard sama-sama lolos snapshot -> 2 OUT atau
    // deadlock P2034; dengan kunci, penantang menunggu commit lalu
    // ditolak bersih SAL-BR-014.
    if (!enabled()) {
      console.warn("RUN_DB_INTEGRATION/db tidak siap — skipping varian isolasi kunci SAL-BR-014")
      return
    }
    const stamp = `SAL014K-${Date.now()}`
    const customer = await prisma.customer.create({ data: { name: `Cust ${stamp}` } })
    const warehouse = await prisma.warehouse.create({
      data: { code: `W${stamp}`, name: `WH ${stamp}` },
    })
    const item = await prisma.item.create({
      data: { sku: `SKU-${stamp}`, name: `Item ${stamp}`, unitOfMeasure: "PCS", isProduct: true, qtyOnHand: 0 },
    })
    const quotation = await prisma.quotation.create({
      data: { documentNo: `Q-${stamp}`, customerId: customer.id, date: new Date() },
    })
    const workOrder = await prisma.workOrder.create({
      data: {
        documentNo: `WO-${stamp}`,
        customerId: customer.id,
        quotationId: quotation.id,
        date: new Date(),
      },
    })
    const invoice = await prisma.salesInvoice.create({
      data: {
        documentNo: `INV-${stamp}`,
        customerId: customer.id,
        quotationId: quotation.id,
        date: new Date(),
      },
    })
    const issue = await prisma.materialIssue.create({
      data: {
        documentNo: `MI-${stamp}`,
        warehouseId: warehouse.id,
        workOrderId: workOrder.id,
        date: new Date(),
      },
    })

    const HOLD_MS = 900
    const WINNER_INSERT_DELAY_MS = 300
    let signalLocked!: () => void
    const lockHeld = new Promise<void>((resolve) => {
      signalLocked = resolve
    })
    let salesError: unknown = null
    let issueError: unknown = null

    try {
      const salesTx = prisma
        .$transaction(
          async (tx) => {
            await assertSalesInvoiceStockOutOnce(tx, invoice.id, [{ itemId: item.id, qty: 3 }])
            // Kunci quotation sudah dipegang di titik ini (assert = lock dulu).
            signalLocked()
            // Jeda kunci: penantang WAJIB sudah masuk guard sebelum baris
            // move pemenang disisipkan. Tanpa kunci bersama, guard
            // penantang membaca snapshot kosong dan ikut lolos.
            await new Promise((r) => setTimeout(r, WINNER_INSERT_DELAY_MS))
            await tx.stockMove.create({
              data: {
                documentNo: `SM-S-${stamp}`,
                itemId: item.id,
                warehouseId: warehouse.id,
                qty: 3,
                impact: "OUT",
                status: "posted",
                referenceType: "SalesInvoice",
                referenceId: invoice.id,
              },
            })
            // Tahan transaksi tetap terbuka: penantang WAJIB berbaris di
            // kunci bersama, bukan membaca snapshot sebelum commit.
            await new Promise((r) => setTimeout(r, HOLD_MS))
            return "sales"
          },
          { timeout: 30_000, maxWait: 10_000 },
        )
        .catch((e: unknown) => {
          salesError = e
          return null
        })

      await lockHeld

      const issueTx = prisma
        .$transaction(
          async (tx) => {
            await assertMaterialIssueStockOutOnce(tx, issue.id, [{ itemId: item.id, qty: 3 }])
            await tx.stockMove.create({
              data: {
                documentNo: `SM-M-${stamp}`,
                itemId: item.id,
                warehouseId: warehouse.id,
                qty: 3,
                impact: "OUT",
                status: "posted",
                referenceType: "MaterialIssue",
                referenceId: issue.id,
              },
            })
            return "material"
          },
          { timeout: 30_000, maxWait: 10_000 },
        )
        .catch((e: unknown) => {
          issueError = e
          return null
        })

      const [salesResult, issueResult] = await Promise.all([salesTx, issueTx])

      // Pemenang: faktur penjualan (memegang kunci lebih dulu).
      expect(salesError).toBeNull()
      expect(salesResult).toBe("sales")
      // Penantang: ditolak guard SETELAH melihat move lawan yang commit.
      expect(issueResult).toBeNull()
      expect(String((issueError as Error | null)?.message ?? "")).toMatch(/SAL-BR-014/)

      const outMoves = await prisma.stockMove.count({
        where: { itemId: item.id, impact: "OUT", status: "posted" },
      })
      expect(outMoves).toBe(1)
    } finally {
      await prisma.stockMove.deleteMany({ where: { itemId: item.id } })
      await prisma.materialIssue.delete({ where: { id: issue.id } }).catch(() => undefined)
      await prisma.workOrder.delete({ where: { id: workOrder.id } }).catch(() => undefined)
      await prisma.salesInvoice.delete({ where: { id: invoice.id } }).catch(() => undefined)
      await prisma.quotation.delete({ where: { id: quotation.id } }).catch(() => undefined)
      await prisma.item.delete({ where: { id: item.id } }).catch(() => undefined)
      await prisma.warehouse.delete({ where: { id: warehouse.id } }).catch(() => undefined)
      await prisma.customer.delete({ where: { id: customer.id } }).catch(() => undefined)
    }
  })

  it("dua konsumen konkuren berebut unit terakhir: satu menang, satu 'Stok tidak mencukupi', lapisan tidak negatif", async () => {
    if (!enabled()) {
      console.warn("RUN_DB_INTEGRATION/db tidak siap — skipping konkurensi stok terakhir")
      return
    }
    const stamp = `LAST-${Date.now()}`
    const warehouse = await prisma.warehouse.create({
      data: { code: `LW${stamp}`, name: `WH ${stamp}` },
    })
    const item = await prisma.item.create({
      data: { sku: `LSKU-${stamp}`, name: `Item ${stamp}`, unitOfMeasure: "PCS", isProduct: true, qtyOnHand: 0 },
    })
    const inbound = await prisma.stockMove.create({
      data: {
        documentNo: `SM-IN-${stamp}`,
        itemId: item.id,
        warehouseId: warehouse.id,
        qty: 5,
        cost: 100,
        impact: "IN",
        status: "posted",
      },
    })
    await prisma.$transaction(async (tx) => {
      await createInLayer(tx, {
        itemId: item.id,
        warehouseId: warehouse.id,
        stockMoveId: inbound.id,
        qty: 5,
        unitCost: 100,
      })
    })

    const HOLD_MS = 700
    let signalLocked!: () => void
    const lockHeld = new Promise<void>((resolve) => {
      signalLocked = resolve
    })
    let firstError: unknown = null
    let secondError: unknown = null

    const postLikeProduction = (documentNo: string, onLocked?: () => void) =>
      prisma.$transaction(
        async (tx) => {
          // Urutan produksi: kunci baris item dulu (serialisasi global),
          // lalu konsumsi FIFO dari baris lapisan terkunci.
          await tx.$queryRaw`SELECT id FROM items WHERE id = ${item.id} FOR UPDATE`
          const consumed = await consumeFifoLayers(tx, {
            itemId: item.id,
            warehouseId: warehouse.id,
            qty: 5,
            label: `uji konkuren ${documentNo}`,
            allowShortfall: false,
          })
          await tx.stockMove.create({
            data: {
              documentNo,
              itemId: item.id,
              warehouseId: warehouse.id,
              qty: 5,
              cost: consumed.consumedCost,
              impact: "OUT",
              status: "posted",
            },
          })
          // Sinyal: lawan boleh mulai sekarang; transaksi ini SENGAJA
          // ditahan terbuka supaya keduanya benar-benar bertumpuk.
          onLocked?.()
          await new Promise((r) => setTimeout(r, HOLD_MS))
          return consumed.consumedCost
        },
        { timeout: 30_000, maxWait: 10_000 },
      )

    try {
      const first = postLikeProduction(`SM-OUT-A-${stamp}`, signalLocked).catch(
        (e: unknown) => {
          firstError = e
          signalLocked()
          return null
        },
      )
      await lockHeld
      const second = postLikeProduction(`SM-OUT-B-${stamp}`).catch((e: unknown) => {
        secondError = e
        return null
      })

      const [, secondResult] = await Promise.all([first, second])
      // Pemenang mengonsumsi 5@100; penantang ditolak setelah commit.
      expect(firstError).toBeNull()
      expect(secondResult).toBeNull()
      expect(String((secondError as Error | null)?.message ?? "")).toMatch(/Stok tidak mencukupi/)

      const layer = await prisma.inventoryLayer.findFirst({ where: { itemId: item.id } })
      expect(Number(layer?.remaining)).toBe(0)
      const outMoves = await prisma.stockMove.count({
        where: { itemId: item.id, impact: "OUT", status: "posted" },
      })
      expect(outMoves).toBe(1)
    } finally {
      await prisma.inventoryLayer.deleteMany({ where: { itemId: item.id } })
      await prisma.stockMove.deleteMany({ where: { itemId: item.id } })
      await prisma.item.delete({ where: { id: item.id } }).catch(() => undefined)
      await prisma.warehouse.delete({ where: { id: warehouse.id } }).catch(() => undefined)
    }
  })
})
