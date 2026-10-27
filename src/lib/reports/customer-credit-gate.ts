/**
 * F-2026-10-25-035-S lapis aman: penilaian turunan gerbang batas kredit tahap 2.
 *
 * Keputusan simpan DITURUNKAN dari baris paparan builder existing
 * (buildCustomerCreditExposure) — dilarang hitung ulang rumus di sini
 * (BR-CL2-07: satu builder). Definisi inti = PaparanBersih advisory PERSIS
 * max(0, K1+K2+K5−K3efektif(b)−K4) per vonis F-2026-10-25-035-V (Q-CL2-1):
 * `unset` tidak ditahan, `warning` tidak ditahan, hanya `over` dapat ditahan.
 *
 * Gerbang NONAKTIF secara default (gateEnabled=false): penilaian tidak pernah
 * menahan dokumen (BR-CL2-02, AC-CL2-B1). Aktivasi, izin/media override,
 * cakupan titik tahan = Q-CL2-2..5 milik BOT Lead dan BELUM terputus —
 * fungsi ini tidak di-wire ke server action sampai putusan itu terbit.
 * Tanpa kolom/status dokumen baru (spec §2).
 */

import {
  CREDIT_EXPOSURE_STATUS_LABEL,
  type CustomerCreditExposureRow,
} from "@/lib/reports/customer-receivables"

export type CustomerCreditGateReason =
  | "gate_inactive"
  | "within_limit"
  | "credit_limit_exceeded"

export interface CustomerCreditGateAssessment {
  status: CustomerCreditExposureRow["status"]
  /** Label status verbatim builder (CREDIT_EXPOSURE_STATUS_LABEL). */
  statusLabel: string
  /** PaparanBersih dari builder yang sama (bukan hitungan ulang). */
  exposure: number
  creditLimit: number
  utilization: number | null
  /** true hanya bila gerbang aktif DAN status persis "over" (035-V). */
  blocked: boolean
  reason: CustomerCreditGateReason
}

export function assessCustomerCreditGate(
  row: Pick<
    CustomerCreditExposureRow,
    "status" | "exposure" | "creditLimit" | "utilization"
  >,
  opts: { gateEnabled?: boolean } = {},
): CustomerCreditGateAssessment {
  const base = {
    status: row.status,
    statusLabel: CREDIT_EXPOSURE_STATUS_LABEL[row.status],
    exposure: row.exposure,
    creditLimit: row.creditLimit,
    utilization: row.utilization,
  }
  if (!opts.gateEnabled) {
    return { ...base, blocked: false, reason: "gate_inactive" }
  }
  // Vonis 035-V Putusan 4+5: unset dan warning tidak pernah ditahan.
  if (row.status !== "over") {
    return { ...base, blocked: false, reason: "within_limit" }
  }
  return { ...base, blocked: true, reason: "credit_limit_exceeded" }
}
