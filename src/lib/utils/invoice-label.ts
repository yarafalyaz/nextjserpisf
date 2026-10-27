/**
 * Display identity for a sales invoice.
 *
 * Drafts do not own an official INV number yet (it is issued at posting),
 * so every human-facing surface refers to them by internal id instead.
 * Posted legacy/new invoices always use their stored document number.
 */
export function salesInvoiceLabel(invoice: {
  id: number
  documentNo: string | null | undefined
}): string {
  return invoice.documentNo ?? `DRAFT #${invoice.id}`
}
