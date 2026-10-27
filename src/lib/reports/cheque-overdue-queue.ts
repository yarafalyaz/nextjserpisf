/**
 * F-2026-10-27-104-S (104-B+F) — antrean giro/cek pending lewat jatuh
 * tempo belum cair. Turunan baca-saja di atas register giro existing dan
 * builder laporan giro mundur existing.
 *
 * Satu sumber kebenaran hari lewat (BR-CQ-02): builder ini MENGONSUMSI
 * `daysUntilDue` dari `post-dated-cheques.ts` apa adanya — DILARANG
 * rumus hari kedua di sini. Perbedaan hari-H dicatat eksplisit: laporan
 * menghitung `daysUntilDue <= 0` sebagai overdue (hari jatuh tempo persis
 * ikut overdue), sedangkan antrean memberi due hari ini tingkat terpisah
 * `Jatuh Tempo Hari Ini` (PUTUSAN LEAD Q-CQ-1) — bukan lewat, bukan
 * disembunyikan.
 *
 * Populasi (BR-CQ-01): `status === "pending"` PERSIS + `deletedAt` null
 * + `daysUntilDue <= 0`. `cleared`/`cancelled` keluar sepenuhnya. Status
 * di luar {pending, cleared, cancelled} masuk ember `Status Tidak
 * Dikenal` tertanda: tampil apa adanya, tidak dianggap pending, tidak
 * dihitung ke rekap pending.
 *
 * Umur lewat hanya dari `dueDate` (BR-CQ-03); `createdAt`/`updatedAt`
 * diterima pada input hanya sebagai bawaan rekod dan SENGAJA tidak
 * pernah dibaca.
 *
 * Nominal adalah `amount` tersimpan verbatim berlabel `Nominal Tercatat`
 * (BR-CQ-05) — bukan klaim saldo buku apa pun. `party` teks bebas apa
 * adanya (BR-CQ-06), tidak ditautkan ke master mana pun.
 *
 * Baca-saja (BR-CQ-07): builder murni ini tidak memanggil aksi tulis
 * apa pun. Loader: `cheque-overdue-queue-data.ts`.
 * Pure (tanpa Prisma/DOM).
 */

import { daysUntilDue } from "@/lib/reports/post-dated-cheques"
import { safeAdd } from "@/lib/utils/math"

/** Judul verbatim PUTUSAN LEAD Q-CQ-2 — UI menempel apa adanya. */
export const CHEQUE_OVERDUE_QUEUE_TITLE = "Giro/Cek Lewat Jatuh Tempo Belum Cair"

/** Label kolom verbatim Q-CQ-2 — satu konstanta server, UI verbatim. */
export const CHEQUE_OVERDUE_COLUMN_LABELS = {
  dueDate: "Jatuh Tempo",
  documentNo: "No. Dokumen",
  type: "Jenis",
  number: "Nomor",
  party: "Pihak",
  direction: "Arah",
  tier: "Tingkat",
  umurLewat: "Umur Lewat",
  nominalTercatat: "Nominal Tercatat",
} as const

export const CHEQUE_OVERDUE_NOTICE_TEXT =
  "Daftar giro/cek berstatus Belum Cair yang jatuh temponya sudah lewat atau tepat hari ini. Nominal Tercatat adalah nominal tersimpan pada lembar apa adanya dan Pihak adalah teks bebas pada lembar. Daftar ini baca-saja; pencairan dan pembatalan dilakukan di register Giro & Cek."

export const CHEQUE_OVERDUE_EMPTY_TEXT =
  "Tidak ada giro/cek Belum Cair yang lewat jatuh tempo atau jatuh tempo hari ini."

export const CHEQUE_OVERDUE_TRUNCATED_LABEL = "Terpotong"

/** Ambang tingkat Mengendap: umur lewat >= 7 hari kalender (Q-CQ-1/BR-CQ-08). */
export const CHEQUE_OVERDUE_MENGENDAP_MIN_DAYS = 7

/** Batas ambil tampil eksplisit (BR-CQ-11); rekap tetap populasi penuh. */
export const CHEQUE_OVERDUE_QUEUE_LIMIT = 100

export const CHEQUE_UNKNOWN_STATUS_LABEL = "Status Tidak Dikenal"
export const CHEQUE_UNKNOWN_DIRECTION_LABEL = "Arah Tidak Dikenal"
export const CHEQUE_UNKNOWN_TYPE_LABEL = "Jenis Tidak Dikenal"

export const CHEQUE_OVERDUE_TIERS = ["mengendap", "lewat", "hari_ini"] as const

export type ChequeOverdueTier = (typeof CHEQUE_OVERDUE_TIERS)[number]

/** Label tingkat verbatim Q-CQ-1/Q-CQ-2 — UI menempel apa adanya. */
export const CHEQUE_OVERDUE_TIER_LABELS: Record<ChequeOverdueTier, string> = {
  mengendap: "Mengendap",
  lewat: "Lewat Jatuh Tempo",
  hari_ini: "Jatuh Tempo Hari Ini",
}

export const CHEQUE_OVERDUE_DIRECTIONS = ["in", "out"] as const

export type ChequeOverdueDirection = (typeof CHEQUE_OVERDUE_DIRECTIONS)[number]

/** Label arah mengikuti kosakata register existing. */
export const CHEQUE_OVERDUE_DIRECTION_LABELS: Record<ChequeOverdueDirection, string> = {
  in: "Diterima",
  out: "Dikeluarkan",
}

const KNOWN_STATUSES = new Set(["pending", "cleared", "cancelled"])
const KNOWN_TYPES = new Set(["giro", "cek"])

const TIER_RANK: Record<ChequeOverdueTier, number> = {
  mengendap: 0,
  lewat: 1,
  hari_ini: 2,
}

export interface ChequeOverdueInput {
  chequeId: number
  documentNo: string
  /** "giro" | "cek" apa adanya; nilai lain tertanda (BR-CQ-12). */
  type: string
  /** "in" | "out" apa adanya; nilai lain masuk ember arah tertanda (BR-CQ-04). */
  direction: string
  number: string | null
  /** Teks bebas apa adanya; kosong tampil `—` di UI (BR-CQ-06). */
  party: string | null
  /** Nominal tersimpan verbatim (kolom `amount`). */
  amount: number
  dueDate: Date
  /** "pending" | "cleared" | "cancelled" apa adanya. */
  status: string
  deletedAt: Date | null
  /** Bawaan rekod — SENGAJA tidak dibaca builder (BR-CQ-03). */
  createdAt?: Date | null
  /** Bawaan rekod — SENGAJA tidak dibaca builder (BR-CQ-03). */
  updatedAt?: Date | null
}

export interface ChequeOverdueRow {
  chequeId: number
  documentNo: string
  type: string
  typeLabel: string
  isUnknownType: boolean
  direction: string
  directionBucket: ChequeOverdueDirection | "unknown"
  directionLabel: string
  isUnknownDirection: boolean
  number: string | null
  party: string | null
  /** Nominal tercatat verbatim. */
  amount: number
  dueDate: Date
  /** Hasil `daysUntilDue` existing: 0 = hari ini, negatif = lewat. */
  daysUntilDue: number
  /** Hari lewat: `-daysUntilDue` untuk lewat, 0 untuk hari ini. */
  umurLewat: number
  umurLewatLabel: string
  tier: ChequeOverdueTier
  tierLabel: string
  /** Tanda baris (arah/jenis asing) — tampil apa adanya di UI. */
  flags: string[]
}

export interface ChequeUnknownStatusRow {
  chequeId: number
  documentNo: string
  /** Status tersimpan apa adanya. */
  status: string
  statusLabel: string
  type: string
  direction: string
  number: string | null
  party: string | null
  amount: number
  dueDate: Date
  daysUntilDue: number
  umurLewat: number
  umurLewatLabel: string
}

export interface ChequeOverdueRecapCell {
  count: number
  /** Σ `amount` tersimpan verbatim pada sel ini. */
  nominalTercatat: number
}

export type ChequeOverdueRecap = Record<
  ChequeOverdueDirection,
  Record<ChequeOverdueTier, ChequeOverdueRecapCell>
>

export interface ChequeOverdueQueue {
  /** Baris tampil terurut BR-CQ-10, dipotong pada `limit`. */
  rows: ChequeOverdueRow[]
  /** Baris status asing tertanda; tidak masuk rekap pending. */
  unknownStatusRows: ChequeUnknownStatusRow[]
  /** Rekap populasi PENUH per arah x tingkat; arah tidak pernah dicampur. */
  recap: ChequeOverdueRecap
  /** Sel tertanda arah asing; terpisah dari rekap `in`/`out`. */
  unknownDirection: ChequeOverdueRecapCell
  /** Jumlah populasi pending penuh sebelum potongan tampil. */
  totalPopulation: number
  unknownStatusCount: number
  /** True bila populasi penuh melebihi batas tampil (BR-CQ-11). */
  terpotong: boolean
  limit: number
  noticeText: string
}

function emptyRecapCell(): ChequeOverdueRecapCell {
  return { count: 0, nominalTercatat: 0 }
}

function emptyRecap(): ChequeOverdueRecap {
  return {
    in: { mengendap: emptyRecapCell(), lewat: emptyRecapCell(), hari_ini: emptyRecapCell() },
    out: { mengendap: emptyRecapCell(), lewat: emptyRecapCell(), hari_ini: emptyRecapCell() },
  }
}

function tierFor(days: number): ChequeOverdueTier {
  if (days === 0) return "hari_ini"
  return -days >= CHEQUE_OVERDUE_MENGENDAP_MIN_DAYS ? "mengendap" : "lewat"
}

function typeLabelOf(type: string): string {
  if (type === "cek") return "Cek"
  if (type === "giro") return "Giro"
  return type
}

export function buildChequeOverdueQueue(
  inputs: readonly ChequeOverdueInput[],
  asOf: Date,
  limit: number = CHEQUE_OVERDUE_QUEUE_LIMIT,
): ChequeOverdueQueue {
  const fullRows: ChequeOverdueRow[] = []
  const unknownStatusRows: ChequeUnknownStatusRow[] = []

  for (const input of inputs) {
    if (input.deletedAt !== null) continue
    // Hari lewat SATU sumber kebenaran: daysUntilDue existing (BR-CQ-02).
    const days = daysUntilDue(input.dueDate, asOf)
    // Belum jatuh tempo (days > 0) bukan populasi antrean.
    if (days > 0) continue

    if (input.status !== "pending") {
      // cleared/cancelled keluar sepenuhnya; status lain tertanda (BR-CQ-01).
      if (KNOWN_STATUSES.has(input.status)) continue
      const umurLewat = days < 0 ? -days : 0
      unknownStatusRows.push({
        chequeId: input.chequeId,
        documentNo: input.documentNo,
        status: input.status,
        statusLabel: CHEQUE_UNKNOWN_STATUS_LABEL,
        type: input.type,
        direction: input.direction,
        number: input.number,
        party: input.party,
        amount: input.amount,
        dueDate: input.dueDate,
        daysUntilDue: days,
        umurLewat,
        umurLewatLabel: `${umurLewat} hari`,
      })
      continue
    }

    const umurLewat = days < 0 ? -days : 0
    const tier = tierFor(days)
    const isUnknownType = !KNOWN_TYPES.has(input.type)
    const isUnknownDirection = input.direction !== "in" && input.direction !== "out"
    const flags: string[] = []
    if (isUnknownDirection) flags.push(CHEQUE_UNKNOWN_DIRECTION_LABEL)
    if (isUnknownType) flags.push(CHEQUE_UNKNOWN_TYPE_LABEL)

    fullRows.push({
      chequeId: input.chequeId,
      documentNo: input.documentNo,
      type: input.type,
      typeLabel: typeLabelOf(input.type),
      isUnknownType,
      direction: input.direction,
      directionBucket: isUnknownDirection
        ? "unknown"
        : (input.direction as ChequeOverdueDirection),
      directionLabel: isUnknownDirection
        ? CHEQUE_UNKNOWN_DIRECTION_LABEL
        : CHEQUE_OVERDUE_DIRECTION_LABELS[input.direction as ChequeOverdueDirection],
      isUnknownDirection,
      number: input.number,
      party: input.party,
      amount: input.amount,
      dueDate: input.dueDate,
      daysUntilDue: days,
      umurLewat,
      umurLewatLabel: `${umurLewat} hari`,
      tier,
      tierLabel: CHEQUE_OVERDUE_TIER_LABELS[tier],
      flags,
    })
  }

  // BR-CQ-10: Mengendap dulu, lalu umur lewat terbesar (dueDate tertua),
  // seri dueDate sama -> documentNo naik, lalu id naik (deterministik).
  fullRows.sort((a, b) => {
    const tierDiff = TIER_RANK[a.tier] - TIER_RANK[b.tier]
    if (tierDiff !== 0) return tierDiff
    const dueDiff = a.dueDate.getTime() - b.dueDate.getTime()
    if (dueDiff !== 0) return dueDiff
    const docDiff = a.documentNo.localeCompare(b.documentNo, "id-ID")
    if (docDiff !== 0) return docDiff
    return a.chequeId - b.chequeId
  })
  unknownStatusRows.sort((a, b) => {
    const dueDiff = a.dueDate.getTime() - b.dueDate.getTime()
    if (dueDiff !== 0) return dueDiff
    const docDiff = a.documentNo.localeCompare(b.documentNo, "id-ID")
    if (docDiff !== 0) return docDiff
    return a.chequeId - b.chequeId
  })

  // Rekap dari POPULASI PENUH per arah x tingkat (BR-CQ-10); arah asing
  // ke sel tertanda sendiri, tidak pernah dicampur ke `in`/`out` (BR-CQ-04).
  const recap = emptyRecap()
  const unknownDirection = emptyRecapCell()
  for (const row of fullRows) {
    const cell =
      row.directionBucket === "unknown"
        ? unknownDirection
        : recap[row.directionBucket][row.tier]
    cell.count += 1
    cell.nominalTercatat = safeAdd(cell.nominalTercatat, row.amount, 2)
  }

  const safeLimit = Math.max(0, Math.floor(limit))

  return {
    rows: fullRows.slice(0, safeLimit),
    unknownStatusRows,
    recap,
    unknownDirection,
    totalPopulation: fullRows.length,
    unknownStatusCount: unknownStatusRows.length,
    terpotong: fullRows.length > safeLimit,
    limit: safeLimit,
    noticeText: CHEQUE_OVERDUE_NOTICE_TEXT,
  }
}
