/**
 * Pemuatan data sumber temporer KEDUA pajak tangguhan (revaluasi/impairment).
 *
 * Peristiwa penyesuaian nilai F-2026-10-23-111-V BELUM dibangun: tidak ada
 * tabel peristiwa nilai di schema maupun baris saldo fiskal peristiwa untuk
 * dibaca. Loader karena itu meneruskan daftar kosong ke builder murni —
 * sumber tampil "belum tersedia — peristiwa penyesuaian nilai belum
 * terbekukan" bernama (vonis F-2026-10-23-125-V Putusan 1), BUKAN nol dan
 * BUKAN ditarik dari `Asset.currentValue`/saldo GL. Sesudah tabel peristiwa
 * terbekukan ada, loader ini membaca peristiwa POSTED non-REVERSED per aset
 * beserta dasar fiskal terbekukan sebelum/sesudahnya (baris saldo inti F-109).
 */

import { DEFERRED_TAX_NOTICE } from "@/lib/reports/deferred-tax"
import {
  buildDeferredTaxValueEventSource,
  type AssetValueEventInput,
  type DeferredTaxValueEventRateSource,
  type DeferredTaxValueEventResult,
} from "@/lib/reports/deferred-tax-value-events"

export { DEFERRED_TAX_NOTICE }

export interface DeferredTaxValueEventReport {
  report: DeferredTaxValueEventResult
  notice: string
}

export async function loadDeferredTaxValueEventSource(input: {
  /** Tarif badan persen; master bertanggal efektif kelak, transisi pasokan operator. */
  taxRatePercent: number | null
  /** Asal tarif; default `operator` selama master belum ada. */
  rateSource?: DeferredTaxValueEventRateSource
  /** Tanggal akhir tahun pajak yang dinilai. */
  asOf: Date
}): Promise<DeferredTaxValueEventReport> {
  // ponytail: tabel peristiwa nilai F-111 belum ada di schema — jangan
  // karang peristiwa dari currentValue/GL. Ganti dengan query peristiwa
  // POSTED non-REVERSED + baris saldo F-109 sesudah inti F-111 merged.
  const events: AssetValueEventInput[] = []
  const report = buildDeferredTaxValueEventSource({
    events,
    taxRatePercent: input.taxRatePercent,
    rateSource: input.rateSource ?? "operator",
    asOf: input.asOf,
  })
  return { report, notice: DEFERRED_TAX_NOTICE }
}
