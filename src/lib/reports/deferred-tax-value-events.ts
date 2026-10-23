/**
 * Sumber temporer KEDUA pajak tangguhan — peristiwa penyesuaian nilai aset
 * (revaluasi + impairment), lapis aman F-2026-10-23-125-V (vonis BOT 4,
 * PR #648; lanjutan F-2026-10-23-111-V Putusan 4(d) + F-2026-10-23-124-V Putusan 3).
 *
 * Builder MURNI (tanpa Prisma/DOM). Peristiwa F-111 BELUM dibangun (nol model
 * peristiwa nilai di schema, terverifikasi 2026-10-23), jadi hari ini sumber
 * ini tampil sebagai baris "belum tersedia" BERNAMA — bukan nol yang terbaca
 * "tidak ada perbedaan" (E125-4). Sesudah tabel peristiwa + baris saldo fiskal
 * terbekukan ada, loader meneruskan peristiwa POSTED non-REVERSED ke builder
 * ini dan komponen dihitung per Putusan 1/2:
 *
 * - Dasar fiskal = dasar TERBEKUKAN sebelum/sesudah peristiwa (baris saldo
 *   F-109/F-124 yang dipasok pemanggil), BUKAN nilai wajar komersial. Revaluasi
 *   komersial murni tidak mengubah dasar fiskal — selisihnya justru temporernya
 *   (E125-1). Impairment tidak menyentuh dasar fiskal (E125-3).
 * - Komponen temporer peristiwa = Δ tercatat − Δ dasar fiskal terbekukan, sen
 *   persis. PPh final 10% revaluasi fiskal = PAJAK KINI peristiwa: ditampilkan
 *   terpisah, tidak pernah di-netting ke indikasi tangguhan (E125-2).
 * - Pembalikan dibatasi kumulatif penurunan tercatat aset yang sama (E125-6);
 *   arah dapat-dikurangkan dibatasi temporer kena pajak yang pernah lahir dari
 *   aset yang sama + selisih penyusutan berjalan aset itu (dipasok pemanggil).
 * - Label pengakuan aset tangguhan analitis hanya "dapat diakui analitis" bila
 *   dasar laba kena pajak terbekukan dipasok; selain itu "belum teruji" (E125-7).
 *   Perusahaan berfasilitas tarif khusus tidak dihitung tarif umum diam-diam.
 *
 * Jurnal tangguhan TETAP tertutup (F-112-V Putusan 2 + F-124-V Putusan 3):
 * builder ini read-model analitis saja, tidak membuat jurnal/saldo, tidak
 * men-netting surplus revaluasi dengan indikasi tangguhan (E125-8).
 */

import {
  DEFERRED_TAX_NOTICE,
  validateTaxRatePercent,
} from "@/lib/reports/deferred-tax"
import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { safeAdd, safeDivide, safeMultiply, safeSubtract } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export const VALUE_EVENT_SOURCE_UNAVAILABLE_LABEL =
  "belum tersedia — peristiwa penyesuaian nilai belum terbekukan"
export const VALUE_EVENT_FISCAL_NOT_FROZEN_LABEL = "Fiskal belum terbekukan"
export const VALUE_EVENT_RECOGNITION_ELIGIBLE_LABEL = "dapat diakui analitis"
export const VALUE_EVENT_RECOGNITION_UNTESTED_LABEL =
  "belum teruji — bukan angka pengakuan"
export const VALUE_EVENT_FACILITY_LABEL =
  "belum terhitung — fasilitas tarif khusus, butuh vonis akuntan"
export const VALUE_EVENT_OPERATOR_RATE_LABEL = "tarif pasokan operator — bukan master"

export type DeferredTaxValueEventRateSource = "master" | "operator"

export type AssetValueEventKind =
  | "REVALUATION_UP"
  | "REVALUATION_DOWN"
  | "IMPAIRMENT"
  | "IMPAIRMENT_REVERSAL"
  | "FISCAL_REVALUATION_APPROVED"

export interface AssetValueEventInput {
  assetCode: string
  assetName: string
  categoryName: string | null
  kind: AssetValueEventKind
  /** Tanggal efektif bulan peristiwa terbekukan. */
  effectiveDate: Date
  status: "POSTED" | "REVERSED"
  /** Nilai tercatat jurnal POSTED sebelum peristiwa. */
  carryingBefore: number
  /** Nilai tercatat jurnal POSTED sesudah peristiwa. */
  carryingAfter: number
  /** Dasar fiskal TERBEKUKAN (baris saldo F-109) sebelum peristiwa; null = belum terbekukan. */
  fiscalBaseBefore: number | null
  /** Dasar fiskal TERBEKUKAN sesudah peristiwa; null = belum terbekukan. */
  fiscalBaseAfter: number | null
  /** PPh final 10% revaluasi fiskal berpersetujuan = pajak kini peristiwa, tampil terpisah. */
  finalTaxAmount: number | null
  /**
   * Selisih penyusutan berjalan aset yang sama (tercatat − fiskal, dari
   * read-model perbedaan penyusutan) — bagian plafon arah dapat-dikurangkan.
   */
  depreciationTemporaryDifference: number
  /** Dasar laba kena pajak masa depan terbekukan ada (uji Putusan 4). */
  profitBasisFrozen: boolean
  /** Perusahaan berfasilitas tarif khusus — jangan hitung tarif umum diam-diam. */
  facilityRateCase: boolean
}

export interface DeferredTaxValueEventResult {
  taxRatePercent: number | null
  rateSource: DeferredTaxValueEventRateSource | null
  rateSourceLabel: string | null
  asOf: Date
  /** Peristiwa terbekukan tersedia untuk dihitung (false hari ini: F-111 belum dibangun). */
  sourceAvailable: boolean
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: {
    events: number
    computed: number
    unavailable: number
    reversed: number
    rejected: number
    /** Perbedaan temporer kena pajak dari sumber nilai (per aset berstok positif). */
    taxableDifference: number
    /** Perbedaan temporer dapat dikurangkan dari sumber nilai (per aset berstok negatif). */
    deductibleDifference: number
    deferredTaxLiabilityIndication: number
    deferredTaxAssetIndication: number
    /** PPh final peristiwa — pajak kini, BUKAN komponen tangguhan. */
    finalTaxCurrent: number
  }
  /** Label pengakuan atas indikasi aset tangguhan (Putusan 4). */
  recognitionLabel: string
  verdict: string
  notice: string
}

/** Lebar kolom (mm) — jumlahnya 267mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Aset", align: "left", width: 52 },
  { header: "Peristiwa", align: "left", width: 40 },
  { header: "Δ Tercatat", align: "right", width: 30 },
  { header: "Δ Dasar Fiskal Terbekukan", align: "right", width: 38 },
  { header: "Komponen Temporer", align: "right", width: 35 },
  { header: "Arah", align: "left", width: 32 },
  { header: "Indikasi", align: "right", width: 22 },
  { header: "PPh Final (pajak kini)", align: "right", width: 18 },
]

const KIND_LABEL: Record<AssetValueEventKind, string> = {
  REVALUATION_UP: "Revaluasi naik",
  REVALUATION_DOWN: "Revaluasi turun",
  IMPAIRMENT: "Impairment",
  IMPAIRMENT_REVERSAL: "Pembalikan impairment",
  FISCAL_REVALUATION_APPROVED: "Revaluasi fiskal berpersetujuan DJP",
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function assetLabel(event: AssetValueEventInput): string {
  return event.assetCode ? `${event.assetCode} ${event.assetName}` : event.assetName
}

interface AssetState {
  /** Stok temporer bertanda dari sumber nilai untuk aset ini. */
  stock: number
  /** Kumulatif penurunan tercatat (revaluasi turun + impairment), plafon pembalikan. */
  cumulativeDecrease: number
  /** Kumulatif komponen positif yang pernah lahir, plafon arah dapat-dikurangkan. */
  taxableEverBorn: number
}

export function buildDeferredTaxValueEventSource(input: {
  events: AssetValueEventInput[]
  /** Tarif badan persen dari master bertanggal efektif; transisi: pasokan operator berlabel. */
  taxRatePercent: number | null
  rateSource?: DeferredTaxValueEventRateSource
  asOf: Date
}): DeferredTaxValueEventResult {
  const rate = validateTaxRatePercent(input.taxRatePercent)
  const notice = DEFERRED_TAX_NOTICE
  const source: DeferredTaxValueEventRateSource = input.rateSource ?? "operator"
  const baseTotals: DeferredTaxValueEventResult["totals"] = {
    events: input.events.length,
    computed: 0,
    unavailable: 0,
    reversed: 0,
    rejected: 0,
    taxableDifference: 0,
    deductibleDifference: 0,
    deferredTaxLiabilityIndication: 0,
    deferredTaxAssetIndication: 0,
    finalTaxCurrent: 0,
  }

  if (rate === null) {
    return {
      taxRatePercent: null,
      rateSource: null,
      rateSourceLabel: null,
      asOf: input.asOf,
      sourceAvailable: input.events.length > 0,
      table: {
        columns: COLUMNS,
        rows: [
          {
            kind: "notice",
            text: "Tarif pajak badan tidak sah atau belum dipasok, sehingga sumber revaluasi/impairment tidak dihitung. " + notice,
          },
        ],
      },
      totals: baseTotals,
      recognitionLabel: VALUE_EVENT_RECOGNITION_UNTESTED_LABEL,
      verdict: "Sumber revaluasi/impairment tidak dihitung: tarif badan tidak sah",
      notice,
    }
  }

  const rateSourceLabel = source === "operator" ? VALUE_EVENT_OPERATOR_RATE_LABEL : null

  if (input.events.length === 0) {
    return {
      taxRatePercent: rate,
      rateSource: source,
      rateSourceLabel,
      asOf: input.asOf,
      sourceAvailable: false,
      table: {
        columns: COLUMNS,
        rows: [
          {
            kind: "notice",
            text: `Sumber revaluasi/impairment ${VALUE_EVENT_SOURCE_UNAVAILABLE_LABEL}: tidak ada angka nol yang terbaca "tidak ada perbedaan" untuk sumber ini.`,
          },
          { kind: "notice", text: notice },
        ],
      },
      totals: baseTotals,
      recognitionLabel: VALUE_EVENT_RECOGNITION_UNTESTED_LABEL,
      verdict: `Sumber revaluasi/impairment ${VALUE_EVENT_SOURCE_UNAVAILABLE_LABEL}`,
      notice,
    }
  }

  const sorted = [...input.events].sort((a, b) => {
    const byCategory = (a.categoryName ?? "").localeCompare(b.categoryName ?? "", "id-ID")
    if (byCategory !== 0) return byCategory
    const byAsset = assetLabel(a).localeCompare(assetLabel(b), "id-ID")
    if (byAsset !== 0) return byAsset
    return a.effectiveDate.getTime() - b.effectiveDate.getTime()
  })

  const totals = { ...baseTotals }
  const rows: TableRow[] = []
  const states = new Map<string, AssetState>()
  let currentCategory: string | null | undefined
  let anyDeductibleComputed = false
  let allDeductibleProfitFrozen = true

  for (const event of sorted) {
    const categoryName = event.categoryName ?? "Tanpa kategori"
    if (categoryName !== currentCategory) {
      rows.push({ kind: "group", label: categoryName })
      currentCategory = categoryName
    }
    const label = assetLabel(event)
    const eventLabel = `${KIND_LABEL[event.kind]} ${event.effectiveDate.toISOString().slice(0, 10)}`
    const finalTaxCell =
      event.finalTaxAmount === null ? "–" : amount(event.finalTaxAmount)
    if (event.finalTaxAmount !== null && event.status === "POSTED") {
      totals.finalTaxCurrent = safeAdd(totals.finalTaxCurrent, event.finalTaxAmount, 2)
    }

    if (event.status === "REVERSED") {
      totals.reversed += 1
      rows.push({
        kind: "data",
        cells: [label, eventLabel, "–", "–", "–", "Direversal — tidak dihitung", "–", finalTaxCell],
      })
      continue
    }
    if (event.facilityRateCase) {
      totals.unavailable += 1
      rows.push({
        kind: "data",
        cells: [label, eventLabel, "–", "–", "–", VALUE_EVENT_FACILITY_LABEL, "–", finalTaxCell],
      })
      continue
    }
    if (event.fiscalBaseBefore === null || event.fiscalBaseAfter === null) {
      totals.unavailable += 1
      rows.push({
        kind: "data",
        cells: [
          label,
          eventLabel,
          amount(safeSubtract(event.carryingAfter, event.carryingBefore, 2)),
          VALUE_EVENT_FISCAL_NOT_FROZEN_LABEL,
          "–",
          VALUE_EVENT_FISCAL_NOT_FROZEN_LABEL,
          "–",
          finalTaxCell,
        ],
      })
      continue
    }

    const key = `${event.assetCode} ${event.assetName}`
    const state: AssetState = states.get(key) ?? {
      stock: 0,
      cumulativeDecrease: 0,
      taxableEverBorn: 0,
    }
    states.set(key, state)

    const deltaCarrying = safeSubtract(event.carryingAfter, event.carryingBefore, 2)
    const deltaFiscal = safeSubtract(event.fiscalBaseAfter, event.fiscalBaseBefore, 2)
    const component = safeSubtract(deltaCarrying, deltaFiscal, 2)

    if (event.kind === "IMPAIRMENT_REVERSAL" && deltaCarrying > state.cumulativeDecrease) {
      totals.rejected += 1
      rows.push({
        kind: "data",
        cells: [
          label,
          eventLabel,
          amount(deltaCarrying),
          amount(deltaFiscal),
          "–",
          "Ditolak — pembalikan melebihi kumulatif penurunan aset yang sama",
          "–",
          finalTaxCell,
        ],
      })
      continue
    }

    let effective = component
    let cappedExcess = 0
    if (event.kind === "REVALUATION_DOWN" || event.kind === "IMPAIRMENT") {
      state.cumulativeDecrease = safeAdd(state.cumulativeDecrease, Math.abs(deltaCarrying), 2)
    }
    if (component > 0) {
      state.taxableEverBorn = safeAdd(state.taxableEverBorn, component, 2)
    } else if (component < 0) {
      // Plafon Putusan 2: stok negatif tidak melebihi temporer kena pajak yang
      // pernah lahir dari aset ini + selisih penyusutan berjalan aset itu.
      const floor = -safeAdd(
        state.taxableEverBorn,
        Math.max(0, event.depreciationTemporaryDifference),
        2,
      )
      const newStock = safeAdd(state.stock, component, 2)
      if (newStock < floor) {
        effective = safeSubtract(floor, state.stock, 2)
        cappedExcess = safeSubtract(component, effective, 2)
      }
    }
    state.stock = safeAdd(state.stock, effective, 2)
    totals.computed += 1
    if (effective < 0) {
      anyDeductibleComputed = true
      if (!event.profitBasisFrozen) allDeductibleProfitFrozen = false
    }

    const indication = safeDivide(safeMultiply(Math.abs(effective), rate, 2), 100, 2)
    const direction =
      effective > 0
        ? "Kena pajak (liabilitas)"
        : effective < 0
          ? "Dapat dikurangkan (aset)"
          : "Tidak ada perbedaan"
    rows.push({
      kind: "data",
      cells: [
        label,
        eventLabel,
        amount(deltaCarrying),
        amount(deltaFiscal),
        amount(effective),
        cappedExcess !== 0 ? `${direction} — sebagian melebihi plafon tidak diakui` : direction,
        amount(indication),
        finalTaxCell,
      ],
    })
  }

  for (const state of states.values()) {
    if (state.stock > 0) {
      totals.taxableDifference = safeAdd(totals.taxableDifference, state.stock, 2)
      totals.deferredTaxLiabilityIndication = safeAdd(
        totals.deferredTaxLiabilityIndication,
        safeDivide(safeMultiply(state.stock, rate, 2), 100, 2),
        2,
      )
    } else if (state.stock < 0) {
      totals.deductibleDifference = safeAdd(totals.deductibleDifference, Math.abs(state.stock), 2)
      totals.deferredTaxAssetIndication = safeAdd(
        totals.deferredTaxAssetIndication,
        safeDivide(safeMultiply(Math.abs(state.stock), rate, 2), 100, 2),
        2,
      )
    }
  }

  const recognitionLabel =
    anyDeductibleComputed && allDeductibleProfitFrozen
      ? VALUE_EVENT_RECOGNITION_ELIGIBLE_LABEL
      : VALUE_EVENT_RECOGNITION_UNTESTED_LABEL

  rows.push({
    kind: "total",
    grand: true,
    label: "Jumlah sumber nilai",
    cells: [
      amount(totals.taxableDifference),
      amount(totals.deductibleDifference),
      amount(safeAdd(totals.deferredTaxLiabilityIndication, totals.deferredTaxAssetIndication, 2)),
      amount(totals.finalTaxCurrent),
    ],
  })
  if (totals.unavailable > 0 || totals.rejected > 0 || totals.reversed > 0) {
    rows.push({
      kind: "notice",
      text:
        `${totals.unavailable} peristiwa tidak dihitung (${VALUE_EVENT_FISCAL_NOT_FROZEN_LABEL.toLowerCase()} atau fasilitas), ` +
        `${totals.rejected} ditolak, ${totals.reversed} direversal — tidak ikut komponen temporer.`,
    })
  }
  if (totals.deferredTaxAssetIndication > 0) {
    rows.push({
      kind: "notice",
      text: `Indikasi aset pajak tangguhan dari sumber nilai: ${recognitionLabel}.`,
    })
  }
  if (totals.finalTaxCurrent > 0) {
    rows.push({
      kind: "notice",
      text: `PPh final revaluasi fiskal ${formatCurrency(totals.finalTaxCurrent)} adalah pajak kini peristiwa, bukan komponen pajak tangguhan dan tidak di-netting.`,
    })
  }
  if (rateSourceLabel) {
    rows.push({ kind: "notice", text: `Tarif ${rate}% adalah ${rateSourceLabel}.` })
  }
  rows.push({ kind: "notice", text: notice })

  const verdict =
    totals.computed === 0
      ? `Sumber revaluasi/impairment ${VALUE_EVENT_SOURCE_UNAVAILABLE_LABEL}`
      : `Sumber nilai: liabilitas tangguhan indikasi ${formatCurrency(totals.deferredTaxLiabilityIndication)} · ` +
        `aset tangguhan indikasi ${formatCurrency(totals.deferredTaxAssetIndication)} (${recognitionLabel}) ` +
        `pada tarif ${rate}%${rateSourceLabel ? ` (${rateSourceLabel})` : ""} (read-model, bukan jurnal)`

  return {
    taxRatePercent: rate,
    rateSource: source,
    rateSourceLabel,
    asOf: input.asOf,
    sourceAvailable: true,
    table: { columns: COLUMNS, rows },
    totals,
    recognitionLabel,
    verdict,
    notice,
  }
}
