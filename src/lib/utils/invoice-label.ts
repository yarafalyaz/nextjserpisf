/**
 * Label tampilan Faktur Penjualan.
 *
 * `SalesInvoice.documentNo` diterbitkan saat posting (K5 PR #900); faktur
 * konsep belum punya nomor. Kontrak beku bersama Backend (t_4e19199d):
 * label = documentNo apa adanya, atau `DRAFT #<id>` bila belum terbit.
 * Semua permukaan UI wajib memakai label ini — jangan karang varian lain.
 */
export function salesInvoiceLabel(invoice: {
  id: number;
  documentNo: string | null;
}): string {
  return invoice.documentNo ?? `DRAFT #${invoice.id}`;
}
