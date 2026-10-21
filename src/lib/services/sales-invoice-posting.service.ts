import type { TxClient } from "@/lib/db/prisma"
import { reverseJournalsByReferenceTx } from "@/lib/hooks/accounting.hook"
import { slugify } from "@/lib/utils/slug"

/**
 * Reverse all GL + stock side effects of a (possibly posted) sales invoice.
 *
 * Extracted from `sales.actions.ts` so it can be reused both by the
 * delete/void flows and by the item-edit flow (editing a posted-but-unpaid
 * invoice must reverse the old stock-out + AR/revenue + COGS before re-posting
 * the new lines).
 *
 * Reverses, atomically within the caller's transaction:
 *  - Physical stock-out: for each POSTED StockMove OUT posted by onSalesInvoicePosted,
 *    the global qtyOnHand is restored and a reversing inbound FIFO layer is
 *    created at the same cost basis so per-warehouse availability stays
 *    consistent. P1-7: OUT moves TIDAK dihapus — ditandai `reversed` agar
 *    histori utuh; hanya move POSTED yang dibalik (idempoten: reversal kedua
 *    tak menggandakan).
 *  - Serial: nomor seri yang dijual (tercatat di baris faktur) dan masih
 *    `used` dikembalikan ke `available`. Tanpa ini serial hilang selamanya
 *    ("manual correction" sebelumnya).
 *  - Revenue journal (referenceType "SalesInvoice") and COGS journal
 *    ("SalesInvoiceCOGS"): P1-7 dibalik via reversal entry (asli REVERSED +
 *    jurnal lawan), bukan dihapus.
 *  - Optionally the cash-receipt journals of every linked payment
 *    (referenceType "SalesPayment"). Callers that only want to re-price the
 *    invoice (item edit) must keep the payment journals, so they pass
 *    `{ reversePaymentJournals: false }`.
 *
 * No-op for draft invoices (no journals / no stock moves exist yet).
 */
export async function reverseSalesInvoicePostingTx(
  tx: TxClient,
  invoiceId: number,
  options: { reversePaymentJournals?: boolean; userId?: number | null } = {},
): Promise<void> {
  const { reversePaymentJournals = true, userId = null } = options
  const reason = `void/edit faktur #${invoiceId}`

  // 1. Restore stock for every POSTED OUT move created at posting time.
  const outMoves = await tx.stockMove.findMany({
    where: { referenceType: "SalesInvoice", referenceId: invoiceId, impact: "OUT", status: "posted" },
    select: { id: true, itemId: true, warehouseId: true, qty: true, cost: true },
  })
  const qtyUpdates: Promise<unknown>[] = []
  const moveInserts: Array<{
    documentNo: string
    slug: string
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
      slug: slugify(`SM-REV-INV-${invoiceId}-${m.id}`),
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
    // P1-7: tandai reversed — histori tetap bisa diaudit; laporan yang
    // filter status posted (mis. profitability) otomatis mengabaikannya.
    await tx.stockMove.updateMany({
      where: { id: { in: outMoves.map((m) => m.id) } },
      data: { status: "reversed" },
    });
  }

  // 1b. Pulihkan serial yang dijual pada faktur ini (masih `used` → `available`).
  // Sumber identitas = baris faktur (serialNumbers), bukan tebakan terbaru.
  const invItems = await tx.salesInvoiceItem.findMany({
    where: { salesInvoiceId: invoiceId },
    select: { itemId: true, serialNumbers: true },
  });
  for (const line of invItems) {
    if (line.itemId == null || !Array.isArray(line.serialNumbers)) continue;
    const names = (line.serialNumbers as unknown[])
      .map((s) => String(s ?? "").trim())
      .filter((s) => s.length > 0);
    if (names.length === 0) continue;
    await tx.itemSerial.updateMany({
      where: { itemId: line.itemId, serialNumber: { in: names }, status: "used" },
      data: { status: "available" },
    });
  }

  // 2. Reverse the revenue + COGS journals (entry lawan, bukan hapus).
  await reverseJournalsByReferenceTx(tx, ["SalesInvoice", "SalesInvoiceCOGS"], invoiceId, reason, userId)

  // 3. Reverse the cash-receipt journal of every linked payment (optional).
  if (reversePaymentJournals) {
    const payments = await tx.salesPayment.findMany({
      where: { salesInvoiceId: invoiceId },
      select: { id: true },
    })
    if (payments.length > 0) {
      await reverseJournalsByReferenceTx(tx, "SalesPayment", payments.map((p) => p.id), reason, userId)
    }
  }
}
