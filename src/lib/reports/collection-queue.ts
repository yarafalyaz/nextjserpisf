/**
 * Builder murni antrean penagihan piutang (F-2026-10-22-089-S,
 * PUTUSAN BOT 1 Q-COL-1..4 di backlog §9A).
 *
 * F-2026-10-26-050-S (Q-COLR-1..7 TERPUTUS Lead 2026-10-26 00:40 WIB):
 * `tingkatPengingat` TURUNAN murni tahap 1 — tanpa kolom tersimpan
 * (Q-COLR-2), tanpa jurnal/denda (BR-COLR-07/12, Q-COLR-7 indikator
 * denda BUKAN masukan), tanpa kirim otomatis (BR-COLR-06), tanpa
 * credit-hold (BR-COLR-08), tanpa key baru (Q-COLR-5), urutan Q-COL-3
 * tidak berubah (Q-COLR-4). Perbandingan hari kalender WIB (Q-COLR-6).
 * Ember umur satu-satunya tetap `aging.ts` (BR-COLR-02).
 *
 * Tahap TURUNAN dari faktur + tukar faktur aktif + janji terakhir —
 * BUKAN kolom tersimpan (BR-COL-01):
 * - `belum_diserahkan`: posted/partial, sisa > 0, tanpa exchange aktif.
 * - `sudah_diserahkan`: exchange aktif ada, sisa > 0, belum lewat janji/due.
 * - `lewat_janji`: sisa > 0 DAN (janji terakhir < hari ini WIB, ATAU
 *   tanpa janji DAN due acuan < hari ini). Due acuan = exchange.dueDate
 *   bila exchange aktif ada, else invoice.dueDate (BR-COL-03). Tanpa due
 *   apa pun: umur null jujur, tidak masuk lewat_janji dari due.
 *
 * Sisa presisi sen via receivableOutstanding; lunas sisa <= toleransi
 * FIN-BR-006 (Rp1) lewat `isOutstandingSettled` — SATU ambang dengan layar
 * faktur/daftar tukar faktur, bukan epsilon lokal. Satu faktur satu baris:
 * exchange aktif TERAKHIR per faktur yang dipakai (BR-COL-04). Janji
 * terakhir = promisedDate maksimum dari tindak lanjut outcome janji
 * yang tidak terhapus (BR-COL-05). Baca-saja: tanpa jurnal, tanpa tulis
 * (BR-COL-07). Loader: `collection-queue-data.ts`.
 */

import { receivableOutstanding } from "@/lib/reports/aging-amounts"
import { isOutstandingSettled } from "@/lib/finance/settlement-status"
import { buildLateFeeOutstandingByInvoice } from "@/lib/reports/sales-late-fee"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"
import { safeAdd } from "@/lib/utils/math"

/** Judul verbatim spec §6 — UI menempel apa adanya. */
export const COLLECTION_QUEUE_TITLE = "Antrean Penagihan Piutang"

/** Notice jujur verbatim spec §6 — UI menempel apa adanya. */
export const COLLECTION_QUEUE_NOTICE_TEXT =
  "Tahap dan umur dihitung dari faktur, tukar faktur, dan janji bayar terakhir. Mencatat tindak lanjut tidak mencatat pembayaran dan tidak membuat jurnal."

/** Judul kolom tingkat — verbatim Q-COLR-3 (Frontend menempel apa adanya). */
export const COLLECTION_REMINDER_LEVEL_TITLE = "Tingkat Pengingat"

/** Notice tingkat — verbatim Q-COLR-3, menempel DI BAWAH notice antrean. */
export const COLLECTION_REMINDER_NOTICE_TEXT =
  "Tingkat pengingat dihitung dari umur, janji bayar terakhir, dan tindak lanjut terakhir. Tingkat hanya penanda prioritas internal — tidak mengirim pesan ke pelanggan, tidak mencatat pembayaran, dan tidak membuat jurnal atau denda."

export const COLLECTION_REMINDER_LEVELS = [
  "tanpa_acuan",
  "belum_perlu",
  "pengingat_awal",
  "pengingat_lanjutan",
  "eskalasi",
] as const

export type CollectionReminderLevel =
  (typeof COLLECTION_REMINDER_LEVELS)[number]

/** Label tingkat — verbatim Q-COLR-3; UI menempel apa adanya, tanpa hitung ulang. */
export const COLLECTION_REMINDER_LEVEL_LABELS: Record<
  CollectionReminderLevel,
  string
> = {
  tanpa_acuan: "Tanpa Acuan Tanggal",
  belum_perlu: "Belum Perlu Diingatkan",
  pengingat_awal: "Pengingat Awal",
  pengingat_lanjutan: "Pengingat Lanjutan",
  eskalasi: "Perlu Eskalasi",
}

export const COLLECTION_STAGES = [
  "belum_diserahkan",
  "sudah_diserahkan",
  "lewat_janji",
] as const

export type CollectionStage = (typeof COLLECTION_STAGES)[number]

/** Label tahap verbatim spec §6 — UI menempel apa adanya. */
export const COLLECTION_STAGE_LABELS: Record<CollectionStage, string> = {
  belum_diserahkan: "Belum Diserahkan",
  sudah_diserahkan: "Sudah Diserahkan",
  lewat_janji: "Lewat Janji",
}

/** Kosakata channel FINAL Q-COL-2. */
export const COLLECTION_CHANNELS = [
  "telepon",
  "whatsapp",
  "kunjungan",
  "email",
  "lainnya",
] as const

export type CollectionChannel = (typeof COLLECTION_CHANNELS)[number]

/** Kosakata outcome FINAL Q-COL-2. */
export const COLLECTION_OUTCOMES = [
  "terhubung_janji_bayar",
  "terhubung_tanpa_janji",
  "tidak_terhubung",
  "sengketa",
  "lainnya",
] as const

export type CollectionOutcome = (typeof COLLECTION_OUTCOMES)[number]

const MS_PER_DAY = 86_400_000

export interface CollectionInvoiceInput {
  invoiceId: number
  documentNo: string
  /** Status tersimpan faktur; hanya posted/partial masuk antrean. */
  status: string
  deletedAt: Date | null
  date: Date
  dueDate: Date | null
  grandTotal: number
  paidAmount: number
  /** F-104-V opsional: returnCredit jurnal SalesReturn POSTED faktur ini;
   * pengurang sisa antrean, BUKAN bagian paidAmount. Default 0. */
  returnCredit?: number
  customerId: number
  customerName: string
  /** Kontak — hanya antrean berizin (Q-COL-4); ekspor tanpa kolom ini. */
  customerPhone: string | null
  contactPerson: string | null
}

export interface CollectionExchangeInput {
  salesInvoiceId: number
  exchangeId: number
  exchangeDocumentNo: string
  exchangeDate: Date
  dueDate: Date | null
  /** Exchange terhapus (deletedAt) = tidak aktif (BR-COL-04). */
  exchangeDeletedAt: Date | null
}

export interface CollectionFollowUpInput {
  salesInvoiceId: number
  followedUpAt: Date
  outcome: string
  promisedDate: Date | null
  deletedAt: Date | null
}

export interface CollectionLateFeeInput {
  salesInvoiceId: number
  amount: number
  paidAmount: number
  status: string
  reversesId: number | null
}

export interface CollectionQueueRow {
  invoiceId: number
  documentNo: string
  customerId: number
  customerName: string
  customerPhone: string | null
  contactPerson: string | null
  date: Date
  /** Due acuan BR-COL-03; null = tanpa due apa pun. */
  dueAcuan: Date | null
  grandTotal: number
  paidAmount: number
  /** Sisa presisi sen (receivableOutstanding). */
  sisa: number
  tahap: CollectionStage
  tahapLabel: string
  /** Tingkat pengingat turunan F-2026-10-26-050-S (Q-COLR); baca-saja. */
  tingkatPengingat: CollectionReminderLevel
  tingkatPengingatLabel: string
  /** Hari kalender WIB sejak due acuan; negatif = belum jatuh tempo. Null tanpa due. */
  umurHari: number | null
  exchangeDocumentNo: string | null
  lastFollowUpAt: Date | null
  /** Janji terakhir: promisedDate maksimum outcome janji (BR-COL-05). */
  promiseDate: Date | null
  /**
   * Saldo dokumen denda yang SUDAH terbit untuk faktur ini
   * (F-2026-10-22-093-V §3 BOT 4): indikator saja, bukan hitung denda.
   */
  lateFeeOutstanding: number
  hasOutstandingLateFee: boolean
}

export interface CollectionReminderLevelSummary {
  count: number
  totalSisa: number
}

export interface CollectionQueueSummary {
  belumDiserahkan: number
  sudahDiserahkan: number
  lewatJanji: number
  total: number
  totalSisa: number
  /** Rekap populasi penuh per tingkat (Q-COLR-4/AC-COLR-11); tanpa kontak. */
  reminderLevels: Record<
    CollectionReminderLevel,
    CollectionReminderLevelSummary
  >
}

function emptyReminderLevelSummary(): Record<
  CollectionReminderLevel,
  CollectionReminderLevelSummary
> {
  return {
    tanpa_acuan: { count: 0, totalSisa: 0 },
    belum_perlu: { count: 0, totalSisa: 0 },
    pengingat_awal: { count: 0, totalSisa: 0 },
    pengingat_lanjutan: { count: 0, totalSisa: 0 },
    eskalasi: { count: 0, totalSisa: 0 },
  }
}

export interface CollectionQueue {
  rows: CollectionQueueRow[]
  summary: CollectionQueueSummary
}

export interface CollectionQueueOptions {
  now?: Date
}

function dayKey(date: Date): number {
  return getWibTodayUtcDate(date).getTime()
}

function isValidDate(value: Date | null): value is Date {
  return value != null && !Number.isNaN(value.getTime())
}

type ReminderLevelSignals = Pick<
  CollectionQueueRow,
  "umurHari" | "promiseDate" | "lastFollowUpAt"
>

/**
 * Turunan tingkat pengingat — urutan T0..T5 spec §3 + Q-COLR-6:
 * T0 umur null TANPA janji (janji ada = acuan nyata) | T0b umur null +
 * janji hidup (promiseDate >= hari ini, tidak janjiLewat) = belum_perlu
 * (PUTUSAN Lead PR #939) | T3 janji lewat belum dihubungi sesudah janji |
 * T4 janji lewat sudah dihubungi sesudahnya | T1 belum jatuh tempo | T2
 * lewat due tanpa janji lewat. Janji baru >= hari ini (promiseDate tidak
 * lewat) keluar dari T3/T4 lewat cabang T1/T2 (T5). Indikator denda
 * sengaja BUKAN sinyal (Q-COLR-7).
 */
export function deriveCollectionReminderLevel(
  signals: ReminderLevelSignals,
  today: number,
): CollectionReminderLevel {
  const promiseDate = isValidDate(signals.promiseDate)
    ? signals.promiseDate
    : null
  const promiseLewat =
    promiseDate != null && dayKey(promiseDate) < today
  if (signals.umurHari == null && promiseDate == null) {
    return "tanpa_acuan"
  }
  if (promiseLewat) {
    const lastFollowUpAt = isValidDate(signals.lastFollowUpAt)
      ? signals.lastFollowUpAt
      : null
    const dihubungiSesudahJanji =
      lastFollowUpAt != null && dayKey(lastFollowUpAt) >= dayKey(promiseDate)
    return dihubungiSesudahJanji ? "eskalasi" : "pengingat_lanjutan"
  }
  // T0b: umur null tetapi janji hidup adalah acuan nyata dan belum ada
  // tanggal lewat — belum_perlu, BUKAN pengingat_awal/tanpa_acuan.
  if (signals.umurHari == null) {
    return "belum_perlu"
  }
  return signals.umurHari > 0 ? "pengingat_awal" : "belum_perlu"
}

/** Exchange aktif terakhir per faktur (BR-COL-04): tanggal terbesar, seri id terbesar. */
function latestActiveExchange(
  exchanges: readonly CollectionExchangeInput[],
): CollectionExchangeInput | null {
  let best: CollectionExchangeInput | null = null
  for (const exchange of exchanges) {
    if (exchange.exchangeDeletedAt != null) continue
    if (
      best == null ||
      exchange.exchangeDate.getTime() > best.exchangeDate.getTime() ||
      (exchange.exchangeDate.getTime() === best.exchangeDate.getTime() &&
        exchange.exchangeId > best.exchangeId)
    ) {
      best = exchange
    }
  }
  return best
}

export function buildCollectionQueue(
  invoices: readonly CollectionInvoiceInput[],
  exchanges: readonly CollectionExchangeInput[],
  followUps: readonly CollectionFollowUpInput[],
  options: CollectionQueueOptions = {},
  lateFees: readonly CollectionLateFeeInput[] = [],
): CollectionQueue {
  const today = getWibTodayUtcDate(options.now ?? new Date()).getTime()
  const lateFeeByInvoice = buildLateFeeOutstandingByInvoice(lateFees)

  const exchangesByInvoice = new Map<number, CollectionExchangeInput[]>()
  for (const exchange of exchanges) {
    const list = exchangesByInvoice.get(exchange.salesInvoiceId) ?? []
    list.push(exchange)
    exchangesByInvoice.set(exchange.salesInvoiceId, list)
  }

  const followUpsByInvoice = new Map<number, CollectionFollowUpInput[]>()
  for (const followUp of followUps) {
    if (followUp.deletedAt != null) continue
    const list = followUpsByInvoice.get(followUp.salesInvoiceId) ?? []
    list.push(followUp)
    followUpsByInvoice.set(followUp.salesInvoiceId, list)
  }

  const summary: CollectionQueueSummary = {
    belumDiserahkan: 0,
    sudahDiserahkan: 0,
    lewatJanji: 0,
    total: 0,
    totalSisa: 0,
    reminderLevels: emptyReminderLevelSummary(),
  }
  const rows: CollectionQueueRow[] = []

  for (const invoice of invoices) {
    if (invoice.deletedAt != null) continue
    if (invoice.status !== "posted" && invoice.status !== "partial") continue
    const sisa = receivableOutstanding(
      invoice.grandTotal,
      invoice.paidAmount + (invoice.returnCredit ?? 0),
    )
    if (isOutstandingSettled(sisa)) continue

    const exchange = latestActiveExchange(
      exchangesByInvoice.get(invoice.invoiceId) ?? [],
    )
    const dueAcuan = exchange ? exchange.dueDate : invoice.dueDate

    const invoiceFollowUps = followUpsByInvoice.get(invoice.invoiceId) ?? []
    let lastFollowUpAt: Date | null = null
    let promiseDate: Date | null = null
    for (const followUp of invoiceFollowUps) {
      if (
        lastFollowUpAt == null ||
        followUp.followedUpAt.getTime() > lastFollowUpAt.getTime()
      ) {
        lastFollowUpAt = followUp.followedUpAt
      }
      if (
        followUp.outcome === "terhubung_janji_bayar" &&
        followUp.promisedDate != null &&
        (promiseDate == null ||
          followUp.promisedDate.getTime() > promiseDate.getTime())
      ) {
        promiseDate = followUp.promisedDate
      }
    }

    let umurHari: number | null = null
    if (dueAcuan != null && !Number.isNaN(dueAcuan.getTime())) {
      umurHari = Math.round((today - dayKey(dueAcuan)) / MS_PER_DAY)
    }

    const promiseLewat = promiseDate != null && dayKey(promiseDate) < today
    const dueLewat =
      promiseDate == null && umurHari != null && umurHari > 0

    let tahap: CollectionStage
    if (promiseLewat || dueLewat) {
      tahap = "lewat_janji"
      summary.lewatJanji += 1
    } else if (exchange) {
      tahap = "sudah_diserahkan"
      summary.sudahDiserahkan += 1
    } else {
      tahap = "belum_diserahkan"
      summary.belumDiserahkan += 1
    }
    summary.total += 1
    summary.totalSisa = safeAdd(summary.totalSisa, sisa, 2)
    const tingkatPengingat = deriveCollectionReminderLevel(
      { umurHari, promiseDate, lastFollowUpAt },
      today,
    )
    const levelSummary = summary.reminderLevels[tingkatPengingat]
    levelSummary.count += 1
    levelSummary.totalSisa = safeAdd(levelSummary.totalSisa, sisa, 2)

    rows.push({
      invoiceId: invoice.invoiceId,
      documentNo: invoice.documentNo,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      customerPhone: invoice.customerPhone,
      contactPerson: invoice.contactPerson,
      date: invoice.date,
      dueAcuan: dueAcuan ?? null,
      grandTotal: invoice.grandTotal,
      paidAmount: invoice.paidAmount,
      sisa,
      tahap,
      tahapLabel: COLLECTION_STAGE_LABELS[tahap],
      tingkatPengingat,
      tingkatPengingatLabel:
        COLLECTION_REMINDER_LEVEL_LABELS[tingkatPengingat],
      umurHari,
      exchangeDocumentNo: exchange?.exchangeDocumentNo ?? null,
      lastFollowUpAt,
      promiseDate,
      lateFeeOutstanding: lateFeeByInvoice.get(invoice.invoiceId) ?? 0,
      // V4 vonis F-2026-10-28-130-V: uji KEBERADAAN denda memakai nol tegas.
      // Toleransi Rp1 menjawab "lunas?", bukan "ada denda?".
      hasOutstandingLateFee:
        (lateFeeByInvoice.get(invoice.invoiceId) ?? 0) > 0,
    })
  }

  // Q-COL-3: LEWAT_JANJI paling lama dulu (janji/due tertua), lalu due
  // acuan terdekat, lalu sisa terbesar; seri invoiceId naik.
  const stageRank: Record<CollectionStage, number> = {
    lewat_janji: 0,
    sudah_diserahkan: 1,
    belum_diserahkan: 1,
  }
  rows.sort((a, b) => {
    if (stageRank[a.tahap] !== stageRank[b.tahap]) {
      return stageRank[a.tahap] - stageRank[b.tahap]
    }
    if (a.tahap === "lewat_janji") {
      const overdueA = a.promiseDate ?? a.dueAcuan
      const overdueB = b.promiseDate ?? b.dueAcuan
      const timeA = overdueA?.getTime() ?? Number.POSITIVE_INFINITY
      const timeB = overdueB?.getTime() ?? Number.POSITIVE_INFINITY
      if (timeA !== timeB) return timeA - timeB
    } else {
      const dueA = a.dueAcuan?.getTime() ?? Number.POSITIVE_INFINITY
      const dueB = b.dueAcuan?.getTime() ?? Number.POSITIVE_INFINITY
      if (dueA !== dueB) return dueA - dueB
    }
    if (a.sisa !== b.sisa) return b.sisa - a.sisa
    return a.invoiceId - b.invoiceId
  })

  return { rows, summary }
}
