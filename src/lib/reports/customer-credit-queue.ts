/**
 * Builder murni antrean saldo kredit pelanggan terbuka (F-2026-10-27-083-S
 * spec PR #1112 + syarat vonis Accountant F-2026-10-27-085-V Putusan 2,
 * PR #1114 MERGED 89ec665ea).
 *
 * Populasi: CustomerCredit status persis "open" dengan saldo
 * received − allocated − refunded > 0, aritmetika kanonik creditBalance
 * (customer-credit.service.ts) — dilarang rumus kedua dan dilarang
 * menghitung ulang dari jurnal/SalesPayment (BR-CCQ-01/04). Baris
 * used/refunded bersaldo > 0 dan open bersaldo <= 0 (anomali warisan
 * EC-CCQ-2) TIDAK masuk populasi/total; terhitung di ember anomali
 * apa adanya, tidak diperbaiki/dibuang diam-diam (085-V Putusan 5).
 *
 * Saldo tampil berlabel operasional ("total saldo kredit terbuka pada
 * baris tampil") — label "utang/aging/saldo buku" DILARANG (085-V
 * Putusan 1, V3). Umur dari createdAt baris ("sejak diterbitkan"),
 * updatedAt DILARANG sebagai acuan (BR-CCQ-03); umur bukan aging
 * liabilitas sejak kas diterima (Putusan 4).
 *
 * Penanda FP UM (085-V Putusan 2, syarat fisik): baris sumber
 * DownPayment yang DP-nya punya TaxInvoice keluaran AKTIF (djpStatus
 * bukan cancelled/replaced) DAN snapshot ppnUangMuka > 0 (persis syarat
 * penolakan J-RF1 di customer-credit.service.ts refundCredit) membawa
 * penanda turunan server. Kata penanda final Lead = "Refund menunggu
 * pembatalan FP uang muka" (kata final di badan kartu 083-B; usul
 * Accountant sama). Penanda = fakta turunan server; UI dilarang
 * menyimpulkan dari field mentah (V2). Alokasi ke faktur TIDAK
 * terhalang penanda (J-RF1 hanya menahan refund).
 *
 * Baca-saja: builder/loader tidak menulis tabel apa pun (BR-CCQ-02).
 * Loader: `customer-credit-queue-data.ts`.
 */

import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"
import { safeSubtract } from "@/lib/utils/math"

export const CUSTOMER_CREDIT_QUEUE_TITLE = "Antrean Saldo Kredit Pelanggan"

/** Rekap berlabel operasional saja (085-V Putusan 1). */
export const CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL =
  "total saldo kredit terbuka pada baris tampil"

/** Kata final Lead (t_6d34dd15) untuk penanda 085-V Putusan 2. */
export const CUSTOMER_CREDIT_FP_UM_MARKER_TEXT =
  "Refund menunggu pembatalan FP uang muka"

const MS_PER_DAY = 86_400_000

/** Input satu baris CustomerCredit (kolom tersimpan verbatim). */
export interface CustomerCreditQueueItemInput {
  creditId: number
  documentNo: string
  customerId: number
  customerName: string
  sourceType: string
  sourceId: number
  receivedAmount: number
  allocatedAmount: number
  refundedAmount: number
  status: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Fakta FP UM per DP sumber (satu query massal loader atas himpunan
 * downPaymentId populasi — anti-N+1, 085-V Putusan 2).
 */
export interface CustomerCreditQueueFpUmInput {
  /** = DownPayment.id (= CustomerCredit.sourceId baris sumber DownPayment). */
  downPaymentId: number
  /** Snapshot ppnUangMuka DP (snapshotFromDownPaymentRow); null = legacy. */
  ppnUangMuka: number | null
  /** Ada TaxInvoice direction="out" dengan djpStatus bukan cancelled/replaced. */
  hasActiveOutTaxInvoice: boolean
}

export interface CustomerCreditQueueRow {
  creditId: number
  documentNo: string
  customerId: number
  customerName: string
  /** sourceType verbatim server; UI dilarang menerjemahkan sendiri. */
  sourceType: string
  sourceId: number
  createdAt: Date
  /** Hari kalender WIB sejak createdAt; clamp 0. Label: "sejak diterbitkan". */
  umurHari: number
  receivedAmount: number
  allocatedAmount: number
  refundedAmount: number
  /** received − allocated − refunded (rumus kanonik creditBalance). */
  saldo: number
  /**
   * Penanda turunan server 085-V Putusan 2. null = tanpa penanda.
   * Alokasi TIDAK terhalang; hanya refund yang tertahan J-RF1.
   */
  penandaFpUm: string | null
}

export interface CustomerCreditQueueAnomaly {
  /** Open bersaldo <= 0. */
  openSaldoNolAtauNegatif: number
  /** used/refunded bersaldo > 0. */
  tutupSaldoMasihPositif: number
  /** allocated + refunded > received (saldo negatif tercatat apa adanya). */
  alokasiRefundMelebihiReceived: number
}

export interface CustomerCreditQueue {
  rows: CustomerCreditQueueRow[]
  summary: {
    /** Jumlah baris tampil. */
    totalBaris: number
    /** Jumlah saldo baris tampil (sen dari kolom tersimpan). */
    totalSaldo: number
    totalSaldoLabel: typeof CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL
    /** Baris tampil berpenanda FP UM. */
    jumlahBerpenandaFpUm: number
  }
  anomaly: CustomerCreditQueueAnomaly
}

function dayKey(date: Date): number {
  return getWibTodayUtcDate(date).getTime()
}

export function buildCustomerCreditQueue(
  credits: readonly CustomerCreditQueueItemInput[],
  fpUmFacts: readonly CustomerCreditQueueFpUmInput[],
  options: { now: Date },
): CustomerCreditQueue {
  const today = dayKey(options.now)

  const fpUmByDownPaymentId = new Map<number, CustomerCreditQueueFpUmInput>()
  for (const fact of fpUmFacts) fpUmByDownPaymentId.set(fact.downPaymentId, fact)

  const rows: CustomerCreditQueueRow[] = []
  const anomaly: CustomerCreditQueueAnomaly = {
    openSaldoNolAtauNegatif: 0,
    tutupSaldoMasihPositif: 0,
    alokasiRefundMelebihiReceived: 0,
  }
  let totalSaldo = 0
  let jumlahBerpenandaFpUm = 0

  for (const credit of credits) {
    const saldo = safeSubtract(
      safeSubtract(credit.receivedAmount, credit.allocatedAmount, 2),
      credit.refundedAmount,
      2,
    )
    if (credit.allocatedAmount + credit.refundedAmount > credit.receivedAmount) {
      anomaly.alokasiRefundMelebihiReceived += 1
    }

    if (credit.status !== "open") {
      if (saldo > 0) anomaly.tutupSaldoMasihPositif += 1
      continue
    }
    if (saldo <= 0) {
      anomaly.openSaldoNolAtauNegatif += 1
      continue
    }

    // 085-V Putusan 2: hanya sumber DownPayment; syarat kembar FP UM
    // aktif AND snapshot ppnUangMuka > 0 persis J-RF1.
    let penandaFpUm: string | null = null
    if (credit.sourceType === "DownPayment") {
      const fact = fpUmByDownPaymentId.get(credit.sourceId)
      if (
        fact &&
        fact.hasActiveOutTaxInvoice &&
        fact.ppnUangMuka != null &&
        fact.ppnUangMuka > 0
      ) {
        penandaFpUm = CUSTOMER_CREDIT_FP_UM_MARKER_TEXT
      }
    }
    if (penandaFpUm) jumlahBerpenandaFpUm += 1

    rows.push({
      creditId: credit.creditId,
      documentNo: credit.documentNo,
      customerId: credit.customerId,
      customerName: credit.customerName,
      sourceType: credit.sourceType,
      sourceId: credit.sourceId,
      createdAt: credit.createdAt,
      umurHari: Math.max(
        0,
        Math.round((today - dayKey(credit.createdAt)) / MS_PER_DAY),
      ),
      receivedAmount: credit.receivedAmount,
      allocatedAmount: credit.allocatedAmount,
      refundedAmount: credit.refundedAmount,
      saldo,
      penandaFpUm,
    })
    totalSaldo = Math.round((totalSaldo + saldo) * 100) / 100
  }

  return {
    rows,
    summary: {
      totalBaris: rows.length,
      totalSaldo,
      totalSaldoLabel: CUSTOMER_CREDIT_QUEUE_TOTAL_LABEL,
      jumlahBerpenandaFpUm,
    },
    anomaly,
  }
}
