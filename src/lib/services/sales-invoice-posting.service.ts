import type { TxClient } from "@/lib/db/prisma"
import { deleteJournalByReferenceTx } from "@/lib/hooks/accounting.hook"

/**
 * Reverse all GL + stock side effects of a (possibly posted) sales invoice.
 *
 * Extracted from `sales.actions.ts` so it can be reused both by the
 * delete/void flows and by the item-edit flow (editing a posted-but-unpaid
 * invoice must reverse the old stock-out + AR/revenue + COGS before re-posting
 * the new lines).
 *
 * Reverses, atomically within the caller's transaction:
 *  - Physical stock-out: for each StockMove OUT posted by onSalesInvoicePosted,
 *    the global qtyOnHand is restored and a reversing inbound FIFO layer is
 *    created at the same cost basis so per-warehouse availability stays
 *    consistent. The OUT moves are then deleted.
 *  - Revenue journal (referenceType "SalesInvoice") and COGS journal
 *    ("SalesInvoiceCOGS").
 *  - Optionally the cash-receipt journals of every linked payment
 *    (referenceType "SalesPayment"). Callers that only want to re-price the
 *    invoice (item edit) must keep the payment journals, so they pass
 *    `{ reversePaymentJournals: false }`.
 *
 * No-op for draft invoices (no journals / no stock moves exist yet).
 * Note: serial-tracked items previously marked "used" are not restored to
 * "available" here; manual correction is required for serialized stock.
 */
export async function reverseSalesInvoicePostingTx(
  tx: TxClient,
  invoiceId: number,
  options: { reversePaymentJournals?: boolean } = {},
): Promise<void> {
  const { reversePaymentJournals = true } = options

  // 1. Restore stock for every OUT move created at posting time.
  const outMoves = await tx.stockMove.findMany({
    where: { referenceType: "SalesInvoice", referenceId: invoiceId, impact: "OUT" },
    select: { id: true, itemId: true, warehouseId: true, qty: true, cost: true },
  })
  const qtyUpdates: Promise<unknown>[] = []
  const moveInserts: Array<{
    documentNo: string
    itemId: number
    warehouseId: number | null
    qty: number
    cost: unknown
    impact: string
    status: string
    referenceType: string
    referenceId: number
    notes: string
  }> = []

  for (const m of outMoves) {
    const qty = Number(m.qty)
    if (qty <= 0) continue
    qtyUpdates.push(tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand + ${qty} WHERE id = ${m.itemId}`)
    moveInserts.push({
      documentNo: `SM-REV-INV-${invoiceId}-${m.id}`,
      itemId: m.itemId,
      warehouseId: m.warehouseId,
      qty,
      cost: m.cost,
      impact: "IN",
      status: "posted",
      referenceType: "SalesInvoiceReversal",
      referenceId: invoiceId,
      notes: `Pembalikan stok penghapusan faktur #${invoiceId}`,
    })
  }

  if (qtyUpdates.length > 0) {
    await Promise.all(qtyUpdates)
    const revMoves = await Promise.all(
      moveInserts.map((m) => tx.stockMove.create({ data: m as never })),
    )
    await tx.inventoryLayer.createMany({
      data: revMoves.map((m) => ({
        itemId: m.itemId,
        warehouseId: m.warehouseId!,
        stockMoveId: m.id,
        qtyIn: Number(m.qty),
        qtyOut: 0,
        remaining: Number(m.qty),
        unitCost: m.cost as never,
      })),
    })
  }
  if (outMoves.length > 0) {
    await tx.stockMove.deleteMany({ where: { id: { in: outMoves.map((m) => m.id) } } })
  }

  // 2. Reverse the revenue + COGS journals.
  await deleteJournalByReferenceTx(tx, ["SalesInvoice", "SalesInvoiceCOGS"], invoiceId)

  // 3. Reverse the cash-receipt journal of every linked payment (optional).
  if (reversePaymentJournals) {
    const payments = await tx.salesPayment.findMany({
      where: { salesInvoiceId: invoiceId },
      select: { id: true },
    })
    if (payments.length > 0) {
      await deleteJournalByReferenceTx(tx, "SalesPayment", payments.map((p) => p.id))
    }
  }
}
