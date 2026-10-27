/**
 * Builder murni antrean saldo kredit pelanggan terbuka
 * (F-2026-10-27-083-S spec Business + F-2026-10-27-085-V vonis
 * Accountant Putusan 1-6, PR #1114 merged 89ec665ea).
 *
 * Populasi tampil (BR-CCQ-01): CustomerCredit status persis `open`
 * DAN saldo kanonik `received - allocated - refunded > 0` — rumus
 * `creditBalance` customer-credit.service.ts:30-33, dijepit per baris
 * pola K4 (customer-receivables.ts). Baris `used`/`refunded` bersaldo
 * > 0 dan baris `open` bersaldo 0 = anomali warisan (EC-CCQ-2):
 * terhitung di ember anomali terpisah, TIDAK masuk populasi/total,
 * TIDAK diperbaiki/dibuang diam-diam (085-V Putusan 5).
 *
 * PENANDA FP UM (085-V Putusan 2, syarat fisik kartu ini): baris
 * sumber `DownPayment` yang DP-nya punya TaxInvoice keluaran AKTIF
 * (djpStatus bukan cancelled/replaced) DAN snapshot `ppnUangMuka > 0`
 * — persis syarat penolakan J-RF1 di customer-credit.service.ts —
 * membawa `penandaFpUangMuka` + label server verbatim. Turunan murni
 * dari himpunan downPaymentId ber-FP-aktif + snapshot DP yang
 * diteruskan loader (satu query TaxInvoice massal anti-N+1 di
 * loader); UI DILARANG menyimpulkan sendiri dari field mentah.
 * Penanda BUKAN status pajak/dokumen baru dan TIDAK menahan alokasi
 * ke faktur (J-RF1 hanya menahan refund) — `alokasiTerhalang` selalu
 * false tahap ini. Sesudah FP UM dibatalkan (himpunan aktif kosong)
 * penanda hilang dengan sendirinya.
 *
 * PERLUASAN 086-V Putusan 6 (kartu 086-B2): baris `Quotation` /
 * `RevisionDown` ikut berpenanda bila quotation sumbernya (sourceId)
 * memenuhi syarat tahan gerbang refund 086-V Putusan 2 — ada DP
 * confirmed quotation itu ber-snapshot `ppnUangMuka > 0` + FP UM
 * keluaran aktif + residu F4 DP itu > 0 (amount − alokasi bruto
 * SalesPayment `down_payment` bermarker nomor DP − kredit DownPayment
 * DP itu), persis hitungan gerbang refundCredit PR #1148. Turunan
 * murni dari himpunan quotationId tertahan yang dihitung loader (satu
 * rantai query massal per quotation populasi; residu dihitung builder);
 * tanpa atribusi FIFO/pro-rata ke DP tertentu (Putusan 4): satu DP
 * menahan = seluruh baris tertahan. DP legacy tanpa snapshot tidak
 * menahan (Putusan 7a). Kata penanda tetap
 * CUSTOMER_CREDIT_FP_UM_MARKER_LABEL yang sama; fakta turunan server,
 * BUKAN penolakan.
 *
 * Saldo tampil berlabel operasional spec ("total saldo kredit
 * terbuka pada baris tampil"); DILARANG label utang/aging/saldo buku
 * (085-V Putusan 1 — subledger CustomerCredit bukan GL 210102).
 * Umur dari `createdAt` berlabel "sejak diterbitkan" (Putusan 4);
 * `updatedAt`/ActivityLog dilarang sebagai acuan. RevisionDown tampil
 * sourceType verbatim tanpa label terjurnal (Putusan 3).
 *
 * Ambang/urutan/kata tahap Q-CCQ-1..6 BELUM diputus Lead: builder
 * menerbitkan umur apa adanya, urutan deterministik umur terbesar
 * lalu createdAt naik lalu id naik (usul BR-CCQ-07), TANPA tahap
 * BARU/MENGENDAP karangan. Baca-saja: nol tulis, nol aksi
 * alokasi/refund (BR-CCQ-02). Loader:
 * `customer-credit-queue-data.ts`.
 */

import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"
import { safeAdd, safeSubtract } from "@/lib/utils/math"

/** Judul antrean — label operasional spec §3, tanpa kata utang/aging. */
export const CUSTOMER_CREDIT_QUEUE_TITLE =
  "Antrean Saldo Kredit Pelanggan Terbuka"

/** Label rekap verbatim 085-V Putusan 1 — UI menempel apa adanya. */
export const CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL =
  "Total saldo kredit terbuka pada baris tampil"

/** Label umur verbatim 085-V Putusan 4 — UI menempel apa adanya. */
export const CUSTOMER_CREDIT_QUEUE_AGE_LABEL = "sejak diterbitkan"

/**
 * Penanda FP UM verbatim 085-V Putusan 2 (kata final Lead pada vonis:
 * "Refund menunggu pembatalan FP uang muka"). Satu-satunya tempat
 * kata ini hidup; UI menempel apa adanya, tidak menyimpulkan sendiri.
 */
export const CUSTOMER_CREDIT_FP_UM_MARKER_LABEL =
  "Refund menunggu pembatalan FP uang muka"

/** Notice kejujuran — penanda menahan refund saja, bukan baris terkunci. */
export const CUSTOMER_CREDIT_QUEUE_NOTICE_TEXT =
  "Penanda FP uang muka hanya menahan refund sampai faktur pajak uang muka dibatalkan; alokasi ke faktur tidak terhalang penanda ini."

const MS_PER_DAY = 86_400_000

/** Input satu baris CustomerCredit (kolom tersimpan verbatim). */
export interface CustomerCreditQueueCreditInput {
  creditId: number
  documentNo: string
  customerId: number
  customerName: string
  /** Verbatim server: DownPayment | Quotation | RevisionDown | liar. */
  sourceType: string
  sourceId: number
  receivedAmount: number
  allocatedAmount: number
  refundedAmount: number
  /** Status tersimpan apa adanya; hanya `open` populasi tampil. */
  status: string
  createdAt: Date
}

/** Snapshot DP sumber kredit (kolom vat* DownPayment existing). */
export interface CustomerCreditQueueDownPaymentInput {
  downPaymentId: number
  /** Snapshot PPN uang muka beku saat confirm; null = legacy/tanpa snapshot. */
  ppnUangMuka: number | null
}

/**
 * Fakta per quotation untuk residu F4 (086-V Putusan 6) — hanya DP
 * confirmed quotation populasi yang lolos saringan snapshot
 * (ppnUangMuka > 0) DAN FP UM aktif yang diteruskan loader; residu
 * dihitung builder dengan rumus F4 persis gerbang refundCredit.
 */
export interface CustomerCreditQueueQuotationInput {
  quotationId: number
  /** DP confirmed ber-snapshot + ber-FP-aktif milik quotation ini. */
  taxedDownPayments: {
    downPaymentId: number
    documentNo: string
    amount: number
  }[]
  /** Alokasi bruto SalesPayment down_payment bermarker nomor DP di notes. */
  dpAllocations: { documentNo: string; amount: number }[]
  /** Kredit DownPayment per DP (pengurang residu F4). */
  dpCredits: { downPaymentId: number; receivedAmount: number }[]
}

/** Residu F4 per DP: amount − alokasi bruto bermarker − kredit DP. */
export function downPaymentResidueF4(input: {
  amount: number
  allocatedByMarker: number
  creditAmount: number
}): number {
  return safeSubtract(
    safeSubtract(input.amount, input.allocatedByMarker, 2),
    input.creditAmount,
    2,
  )
}

export interface CustomerCreditQueueRow {
  creditId: number
  documentNo: string
  customerId: number
  customerName: string
  sourceType: string
  sourceId: number
  status: string
  createdAt: Date
  /** Hari kalender WIB sejak createdAt ("sejak diterbitkan"); clamp 0. */
  umurMenungguHari: number
  receivedAmount: number
  allocatedAmount: number
  refundedAmount: number
  /** Saldo kanonik received - allocated - refunded (tanpa jepit di baris tampil). */
  saldo: number
  /**
   * Penanda turunan server 085-V Putusan 2 + 086-V Putusan 6: true
   * untuk sumber DownPayment ber-FP UM aktif + snapshot ppnUangMuka
   * > 0, atau sumber Quotation/RevisionDown yang quotation-nya
   * memenuhi syarat tahan gerbang refund (residu F4 > 0).
   */
  penandaFpUangMuka: boolean
  /** Label server verbatim saat penanda aktif; null tanpa penanda. */
  penandaFpUangMukaLabel: string | null
  /** Penanda TIDAK menahan alokasi (J-RF1 refund saja) — selalu false. */
  alokasiTerhalang: false
}

export interface CustomerCreditQueueAnomalySummary {
  /** Baris open bersaldo <= 0 (anomali warisan EC-CCQ-2). */
  openSaldoNol: number
  /** Baris used/refunded bersaldo > 0 (anomali warisan EC-CCQ-2). */
  selesaiSaldoPositif: number
  /** Baris allocated + refunded > received (saldo negatif). */
  alokasiMelebihiDiterima: number
}

export interface CustomerCreditQueueSummary {
  /** Jumlah baris tampil persis (BR-CCQ-01). */
  jumlahBaris: number
  /** Σ saldo baris tampil persis — label CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL. */
  totalSaldo: number
  /** Jumlah baris tampil berpenanda FP UM (085-V Putusan 2). */
  jumlahPenandaFpUangMuka: number
}

export interface CustomerCreditQueue {
  rows: CustomerCreditQueueRow[]
  summary: CustomerCreditQueueSummary
  /** Ember anomali terhitung terpisah — tidak masuk rows/total (Putusan 5). */
  anomaly: CustomerCreditQueueAnomalySummary
}

export interface CustomerCreditQueueOptions {
  now?: Date
}

/** Saldo kanonik service:30-33 atas kolom tersimpan (tanpa jepit). */
export function customerCreditBalance(input: {
  receivedAmount: number
  allocatedAmount: number
  refundedAmount: number
}): number {
  return safeSubtract(
    safeSubtract(input.receivedAmount, input.allocatedAmount, 2),
    input.refundedAmount,
    2,
  )
}

export function buildCustomerCreditQueue(
  credits: readonly CustomerCreditQueueCreditInput[],
  downPayments: readonly CustomerCreditQueueDownPaymentInput[],
  activeFpDownPaymentIds: ReadonlySet<number>,
  options: CustomerCreditQueueOptions = {},
  quotations: readonly CustomerCreditQueueQuotationInput[] = [],
): CustomerCreditQueue {
  const today = getWibTodayUtcDate(options.now ?? new Date()).getTime()

  // 086-V Putusan 6: quotation tertahan = ada DP taxed ber-FP aktif
  // dengan residu F4 > 0 (rumus persis gerbang refundCredit #1148).
  const blockedQuotationIds = new Set<number>()
  for (const q of quotations) {
    const allocatedByDocNo = new Map<string, number>()
    for (const p of q.dpAllocations) {
      allocatedByDocNo.set(
        p.documentNo,
        (allocatedByDocNo.get(p.documentNo) ?? 0) + p.amount,
      )
    }
    const creditByDpId = new Map<number, number>()
    for (const c of q.dpCredits) {
      creditByDpId.set(
        c.downPaymentId,
        (creditByDpId.get(c.downPaymentId) ?? 0) + c.receivedAmount,
      )
    }
    for (const dp of q.taxedDownPayments) {
      const residue = downPaymentResidueF4({
        amount: dp.amount,
        allocatedByMarker: allocatedByDocNo.get(dp.documentNo) ?? 0,
        creditAmount: creditByDpId.get(dp.downPaymentId) ?? 0,
      })
      if (residue > 0) {
        blockedQuotationIds.add(q.quotationId)
        break
      }
    }
  }

  const ppnByDownPaymentId = new Map<number, number | null>()
  for (const dp of downPayments) {
    ppnByDownPaymentId.set(dp.downPaymentId, dp.ppnUangMuka)
  }

  const rows: CustomerCreditQueueRow[] = []
  const anomaly: CustomerCreditQueueAnomalySummary = {
    openSaldoNol: 0,
    selesaiSaldoPositif: 0,
    alokasiMelebihiDiterima: 0,
  }

  for (const credit of credits) {
    const saldo = customerCreditBalance(credit)
    const melebihi =
      safeAdd(credit.allocatedAmount, credit.refundedAmount, 2) >
      credit.receivedAmount
    if (melebihi) anomaly.alokasiMelebihiDiterima += 1

    if (credit.status !== "open") {
      // used/refunded (atau status liar) bersaldo > 0 = anomali terhitung.
      if (saldo > 0) anomaly.selesaiSaldoPositif += 1
      continue
    }
    if (saldo <= 0) {
      anomaly.openSaldoNol += 1
      continue
    }

    // 085-V Putusan 2: persis syarat J-RF1 — sumber DownPayment,
    // snapshot ppnUangMuka > 0, dan FP keluaran aktif untuk DP itu.
    // 086-V Putusan 6: sumber Quotation/RevisionDown berpenanda bila
    // quotation sumbernya tertahan gerbang refund Putusan 2.
    const ppnUangMuka =
      credit.sourceType === "DownPayment"
        ? (ppnByDownPaymentId.get(credit.sourceId) ?? null)
        : null
    const penandaFpUangMuka =
      (credit.sourceType === "DownPayment" &&
        ppnUangMuka != null &&
        ppnUangMuka > 0 &&
        activeFpDownPaymentIds.has(credit.sourceId)) ||
      ((credit.sourceType === "Quotation" ||
        credit.sourceType === "RevisionDown") &&
        blockedQuotationIds.has(credit.sourceId))

    const umurMenungguHari = Math.max(
      0,
      Math.round(
        (today - getWibTodayUtcDate(credit.createdAt).getTime()) / MS_PER_DAY,
      ),
    )

    rows.push({
      creditId: credit.creditId,
      documentNo: credit.documentNo,
      customerId: credit.customerId,
      customerName: credit.customerName,
      sourceType: credit.sourceType,
      sourceId: credit.sourceId,
      status: credit.status,
      createdAt: credit.createdAt,
      umurMenungguHari,
      receivedAmount: credit.receivedAmount,
      allocatedAmount: credit.allocatedAmount,
      refundedAmount: credit.refundedAmount,
      saldo,
      penandaFpUangMuka,
      penandaFpUangMukaLabel: penandaFpUangMuka
        ? CUSTOMER_CREDIT_FP_UM_MARKER_LABEL
        : null,
      alokasiTerhalang: false,
    })
  }

  // Usul BR-CCQ-07 (kata final Q-CCQ-1 Lead): tertua dulu, seri
  // createdAt naik lalu id naik — deterministik tanpa tahap karangan.
  rows.sort((a, b) => {
    if (a.umurMenungguHari !== b.umurMenungguHari) {
      return b.umurMenungguHari - a.umurMenungguHari
    }
    const created = a.createdAt.getTime() - b.createdAt.getTime()
    if (created !== 0) return created
    return a.creditId - b.creditId
  })

  let totalSaldo = 0
  let jumlahPenandaFpUangMuka = 0
  for (const row of rows) {
    totalSaldo = safeAdd(totalSaldo, row.saldo, 2)
    if (row.penandaFpUangMuka) jumlahPenandaFpUangMuka += 1
  }

  return {
    rows,
    summary: {
      jumlahBaris: rows.length,
      totalSaldo,
      jumlahPenandaFpUangMuka,
    },
    anomaly,
  }
}
