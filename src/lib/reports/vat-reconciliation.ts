/**
 * PPN (VAT) reconciliation position for a period.
 *
 * Pure by design (no Prisma) so the "kurang/lebih bayar" decision is unit-testable.
 *
 * `output` = PPN Keluaran (collected on sales, credit-normal liability),
 * `input`  = PPN Masukan (paid on purchases, debit-normal asset).
 * Output exceeds input → the company still owes VAT (kurang bayar).
 */

export type VatStatus = "kurang_bayar" | "lebih_bayar" | "nihil"

export interface VatPosition {
  output: number
  input: number
  /** output − input. Positive = payable, negative = creditable. */
  difference: number
  status: VatStatus
}

const round2 = (value: number) => Math.round(value * 100) / 100

export function buildVatPosition(output: number, input: number): VatPosition {
  const difference = round2(output - input)
  const status: VatStatus =
    Math.abs(difference) < 0.005 ? "nihil" : difference > 0 ? "kurang_bayar" : "lebih_bayar"
  return { output: round2(output), input: round2(input), difference, status }
}

export const VAT_STATUS_LABELS: Record<VatStatus, string> = {
  kurang_bayar: "Kurang Bayar",
  lebih_bayar: "Lebih Bayar",
  nihil: "Nihil",
}
