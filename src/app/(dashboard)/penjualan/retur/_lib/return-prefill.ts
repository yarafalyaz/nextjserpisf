/**
 * Nilai awal form retur penjualan saat dibuka dari sebuah faktur (`?invoiceId=`).
 *
 * Sisa yang boleh diretur per barang = qty yang difakturkan − qty yang sudah
 * diretur pada retur yang tidak dibatalkan. Angka ini adalah cermin dari penjaga
 * "over-return" di `createSalesReturn`/`updateSalesReturn`: tanpa dikurangi lebih
 * dulu, operator yang mengisi form dari tautan faktur akan langsung ditolak server
 * ("melebihi yang difakturkan") atau refleks mengubah qty tanpa tahu batasnya.
 *
 * Baris yang sisanya sudah 0 (faktur tanpa baris barang, atau semua sudah
 * diretur) dibuang supaya form tidak menampilkan baris kosong yang mustahil
 * disimpan.
 */

export interface ReturnPrefillItem {
  itemId: number
  qty: number
}

export interface ReturnPrefill {
  customerId: number
  salesInvoiceId: number
  items: ReturnPrefillItem[]
}

export function buildReturnPrefill(input: {
  invoice: { id: number; customerId: number; items: Array<{ itemId: number | null; qty: number | string | { toString(): string } }> } | null
  /** Total qty sudah diretur per `itemId` (retur yang dibatalkan tidak dihitung). */
  returnedByItem?: Map<number, number>
}): ReturnPrefill | null {
  if (!input.invoice) return null
  const returnedByItem = input.returnedByItem ?? new Map<number, number>()

  const invoicedByItem = new Map<number, number>()
  for (const line of input.invoice.items) {
    if (line.itemId === null) continue
    const qty = Number(line.qty)
    if (!Number.isFinite(qty)) continue
    invoicedByItem.set(line.itemId, (invoicedByItem.get(line.itemId) ?? 0) + qty)
  }

  const items = [...invoicedByItem.entries()]
    .map(([itemId, invoicedQty]) => ({ itemId, qty: invoicedQty - (returnedByItem.get(itemId) ?? 0) }))
    .filter((line) => line.qty > 0)

  if (items.length === 0) return null

  return {
    customerId: input.invoice.customerId,
    salesInvoiceId: input.invoice.id,
    items,
  }
}
