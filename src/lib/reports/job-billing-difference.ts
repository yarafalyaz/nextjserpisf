/**
 * Helper murni F-2026-10-20-10: selisih revisi antara nilai penawaran
 * berjalan (Quotation.grandTotal terbaru) dan total faktur yang sudah
 * menagih pekerjaan itu (jalinan TIGA jembatan sama seperti
 * loadJobBillingSummary — caller me-dedup per id).
 *
 * Selisih positif = revisi membesar belum tertagih → faktur selisih
 * DRAFT boleh dibuat sebesar selisih. Selisih nol/negatif = tidak ada
 * faktur selisih (kelebihan tagih ditangani retur/kredit, bukan di sini).
 * Status selain cancelled dihitung sebagai penagih: draft pun sudah
 * memesan porsi nilai revisi, jadi membuat draft kedua untuk porsi yang
 * sama akan menagih ganda. Uang rupiah (Decimal 15,2).
 */

export interface DifferenceInvoiceInput {
  id: number
  status: string
  grandTotal: number
}

export interface DifferenceInvoiceCandidate {
  eligible: boolean
  /** Selisih dalam rupiah untuk header faktur. */
  differenceAmount: number
  /** Total sudah tertagih/dipesan dalam rupiah. */
  billedAmount: number
  reason: string | null
}

export function computeDifferenceInvoiceCandidate(input: {
  quotationGrandTotal: number
  invoices: DifferenceInvoiceInput[]
}): DifferenceInvoiceCandidate {
  const billedAmount = input.invoices
    .filter((inv) => inv.status !== "cancelled")
    .reduce((sum, inv) => sum + inv.grandTotal, 0)
  const differenceAmount = input.quotationGrandTotal - billedAmount
  if (differenceAmount <= 0) {
    return {
      eligible: false,
      differenceAmount,
      billedAmount,
      reason:
        differenceAmount === 0
          ? "Tidak ada selisih: nilai revisi sudah tertagih penuh"
          : "Nilai revisi lebih kecil dari total tertagih; selisih negatif ditangani lewat retur/nota kredit, bukan faktur selisih",
    }
  }
  return { eligible: true, differenceAmount, billedAmount, reason: null }
}
