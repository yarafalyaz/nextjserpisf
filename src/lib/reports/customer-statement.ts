/**
 * F-2026-10-21-032: customer statement (mutasi piutang per pelanggan).
 *
 * Pure by design (no Prisma) — saldo awal periode, baris mutasi periode
 * dengan saldo berjalan, saldo akhir. Definisi outstanding mengikuti
 * read-model piutang existing (`customer-receivables.ts` /
 * `receivableOutstanding`): grandTotal − paidAmount per faktur recognised,
 * dan `paidAmount` invoice sendiri adalah Σ(amount + withholdingAmount)
 * atas SEMUA SalesPayment faktur itu (lihat `sales-payment.hook.ts`).
 *
 * Alokasi CustomerCredit BUKAN dokumen terpisah di DB: service alokasi
 * (`customer-credit.service.ts`) membuatnya sebagai SalesPayment dengan
 * `paymentMethod === "customer_credit"` DAN menaikkan
 * `CustomerCredit.allocatedAmount`. Karena itu baris kredit di sini
 * diturunkan dari payment tersebut — BUKAN dari `allocatedAmount` —
 * supaya tidak dobel: total Cr periode selalu = perubahan paidAmount,
 * dan saldo akhir statement = outstanding piutang untuk fixture sama.
 * `creditDocumentNo` diisi loader dari notes payment ("Alokasi kredit
 * pelanggan <docNo> …") bila terbaca; builder tidak mengarangnya.
 *
 * F-2026-10-23-104-V Putusan 2 (BR-RET-02): baris retur penjualan terpisah
 * dari baris kredit. `returnCredit` per faktur asal diturunkan loader dari
 * kaki Cr Piutang jurnal SalesReturn POSTED (bukan REVERSED) atas retur
 * `completed` ber-`salesInvoiceId` — BUKAN dari `paidAmount` (definisi
 * paidAmount tetap murni pembayaran, F-104 Putusan 2) dan BUKAN dari
 * CustomerCredit (sumber JUMLAH kredit formal, domain terpisah). Retur
 * tanpa faktur asal tidak punya kaki Cr Piutang (priceTotal = 0 di hook)
 * sehingga tidak pernah diteruskan loader ke sini.
 *
 * F-2026-10-25-025-S (Q-ST-1=(a) Lead, BR-ST-01..08): kolom Jatuh Tempo +
 * penanda Lewat Jatuh Tempo TURUNAN baca-saja. Due acuan per faktur =
 * BR-COL-03: due tukar faktur aktif terakhir ?? dueDate dokumen faktur;
 * builder murni menerima keduanya sebagai input opsional (`dueDate` +
 * `exchangeDueDate`, loader yang memuat — builder tidak membaca exchange).
 * Penanda baris faktur aktif hanya bila sisa per faktur (grandTotal −
 * paid − returnCredit, definisi outstanding existing beku BR-ST-06) > 0.005
 * DAN due acuan < periodEnd (hari kalender WIB) — acuan periodEnd, BUKAN
 * jam sistem (BR-ST-05), supaya statement lampau ter-reproduksi persis.
 */

import { safeAdd, safeSubtract } from "@/lib/utils/math"
import { receivableOutstanding } from "@/lib/reports/aging-amounts"
import { isOutstandingSettled } from "@/lib/finance/settlement-status"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

/** Judul kolom verbatim BR-ST-01 — UI/PDF menempel apa adanya. */
export const CUSTOMER_STATEMENT_DUE_COLUMN = "Jatuh Tempo"

/** Label penanda verbatim BR-ST-05 — UI/PDF menempel apa adanya. */
export const CUSTOMER_STATEMENT_OVERDUE_LABEL = "Lewat Jatuh Tempo"

export type CustomerStatementEntryKind = "invoice" | "payment" | "credit" | "return"

/** Satu faktur recognised milik pelanggan (status sudah difilter loader). */
export interface CustomerStatementInvoiceInput {
  id: number
  documentNo: string
  /** Tanggal terbit faktur — momen Dr. */
  date: Date
  grandTotal: number
  /**
   * F-2026-10-25-025-S: due dokumen faktur (SalesInvoice.dueDate).
   * Opsional supaya pemanggil lama tak berubah; tanpa field ini due
   * acuan null (BR-ST-03, tidak pernah tertanda).
   */
  dueDate?: Date | null
  /**
   * Due tukar faktur aktif terakhir (BR-COL-03 reuse Q-ST-1=(a)).
   * Loader meneruskannya; null/tidak ada = jatuh ke `dueDate` faktur.
   */
  exchangeDueDate?: Date | null
}

/** Satu SalesPayment atas faktur pelanggan. `paymentMethod === "customer_credit"` = alokasi kredit. */
export interface CustomerStatementPaymentInput {
  id: number
  documentNo: string
  salesInvoiceId: number
  salesInvoiceDocumentNo: string
  paymentDate: Date
  amount: number
  withholdingAmount: number
  paymentMethod: string
  /** Nomor dokumen CustomerCredit sumber alokasi, bila terbaca dari notes. */
  creditDocumentNo?: string | null
}

/**
 * Satu retur penjualan `completed` ber-faktur asal (F-104-V Putusan 2).
 * `returnCredit` = Σ kaki Cr Piutang jurnal SalesReturn POSTED (bukan
 * REVERSED) retur ini — dihitung loader; builder tidak membaca jurnal.
 * Retur tanpa faktur asal / tanpa jurnal POSTED tidak diteruskan (Cr 0).
 */
export interface CustomerStatementReturnInput {
  id: number
  documentNo: string
  salesInvoiceId: number
  salesInvoiceDocumentNo: string
  /** Tanggal retur (SalesReturn.date) — momen Cr piutang. */
  date: Date
  returnCredit: number
}

export interface CustomerStatementEntry {
  kind: CustomerStatementEntryKind
  date: Date
  documentNo: string
  /** No. faktur lawan untuk baris payment/credit; null untuk baris invoice. */
  referenceDocumentNo: string | null
  /**
   * Due acuan baris (BR-COL-03 via loader); null untuk baris non-invoice
   * dan untuk faktur tanpa due apa pun (BR-ST-01/03 — tampil "—").
   */
  dueDate: Date | null
  /**
   * Penanda lewat jatuh tempo TURUNAN per periodEnd (BR-ST-04/05):
   * sisa faktur > epsilon lunas DAN due acuan < akhir periode (hari WIB).
   * Selalu false untuk baris non-invoice dan faktur lunas.
   */
  isOverdue: boolean
  description: string
  debit: number
  credit: number
  /** Saldo piutang sesudah baris ini (saldo awal + kumulatif Dr − Cr). */
  balance: number
}

export interface CustomerStatement {
  customerId: number
  periodStart: Date
  periodEnd: Date
  /** Σ grandTotal − Σ(amount+withholding) untuk semua mutasi < periodStart. */
  openingBalance: number
  entries: CustomerStatementEntry[]
  totalDebit: number
  totalCredit: number
  /** openingBalance + totalDebit − totalCredit. */
  closingBalance: number
}

const CREDIT_PAYMENT_METHOD = "customer_credit"

function byDateThenKindThenId(
  a: { date: Date; kind: CustomerStatementEntryKind; id: number },
  b: { date: Date; kind: CustomerStatementEntryKind; id: number },
): number {
  const byDate = a.date.getTime() - b.date.getTime()
  if (byDate !== 0) return byDate
  // Faktur (Dr) sebelum pelunasannya pada tanggal sama.
  const rank = (kind: CustomerStatementEntryKind) => (kind === "invoice" ? 0 : 1)
  const byKind = rank(a.kind) - rank(b.kind)
  if (byKind !== 0) return byKind
  return a.id - b.id
}

/** Hari kalender WIB (tengah malam UTC) dari sebuah tanggal. */
function wibDayKey(date: Date): number {
  return getWibTodayUtcDate(date).getTime()
}

/**
 * Due acuan BR-COL-03 untuk input faktur builder: exchangeDueDate bila
 * ada (tukar faktur aktif terakhir dari loader), else dueDate faktur.
 * Tanggal invalid (NaN) diperlakukan tidak ada — penanda tak pernah aktif.
 */
export function customerStatementDueAcuan(inv: CustomerStatementInvoiceInput): Date | null {
  const pick = (d: Date | null | undefined): Date | null =>
    d != null && !Number.isNaN(d.getTime()) ? d : null
  return pick(inv.exchangeDueDate) ?? pick(inv.dueDate)
}

/**
 * Bangun statement satu pelanggan untuk [periodStart, periodEnd] inklusif.
 *
 * Input = SEMUA faktur recognised + payment pelanggan (loader memfilter
 * status non-cancelled & deletedAt); builder membelah sebelum/periode
 * sendiri supaya saldo awal dan saldo akhir konsisten dari sumber sama.
 * Payment atas faktur di luar himpunan invoice (mis. faktur cancelled)
 * diabaikan — piutangnya tidak pernah diakui, jadi tidak boleh meng-Cr.
 * `returns` opsional (F-104-V): baris retur Cr per faktur asal; tanpa arg
 * ini perilaku identik versi sebelumnya.
 */
export function buildCustomerStatement(input: {
  customerId: number
  periodStart: Date
  periodEnd: Date
  invoices: readonly CustomerStatementInvoiceInput[]
  payments: readonly CustomerStatementPaymentInput[]
  returns?: readonly CustomerStatementReturnInput[]
}): CustomerStatement {
  const { customerId, periodStart, periodEnd } = input
  const startMs = periodStart.getTime()
  const endMs = periodEnd.getTime()
  const invoiceIds = new Set(input.invoices.map((inv) => inv.id))
  const payments = input.payments.filter((p) => invoiceIds.has(p.salesInvoiceId))
  const returns = (input.returns ?? []).filter((r) => invoiceIds.has(r.salesInvoiceId))

  // Sisa per faktur untuk penanda (BR-ST-04): grandTotal − paid −
  // returnCredit, rumus persis customerStatementOutstanding/outstanding
  // existing (BR-ST-06 — bukan saldo berjalan agregat pelanggan).
  const paidByInvoice = new Map<number, number>()
  for (const pay of payments) {
    paidByInvoice.set(
      pay.salesInvoiceId,
      safeAdd(paidByInvoice.get(pay.salesInvoiceId) ?? 0, safeAdd(pay.amount, pay.withholdingAmount, 2), 2),
    )
  }
  const returnCreditByInvoice = new Map<number, number>()
  for (const ret of returns) {
    if (ret.returnCredit <= 0) continue
    returnCreditByInvoice.set(
      ret.salesInvoiceId,
      safeAdd(returnCreditByInvoice.get(ret.salesInvoiceId) ?? 0, ret.returnCredit, 2),
    )
  }
  const sisaByInvoice = new Map<number, number>()
  for (const inv of input.invoices) {
    const settled = safeAdd(paidByInvoice.get(inv.id) ?? 0, returnCreditByInvoice.get(inv.id) ?? 0, 2)
    sisaByInvoice.set(inv.id, receivableOutstanding(inv.grandTotal, settled))
  }
  const periodEndDay = wibDayKey(periodEnd)

  let openingBalance = 0
  type Raw = {
    id: number
    kind: CustomerStatementEntryKind
    date: Date
    documentNo: string
    referenceDocumentNo: string | null
    dueDate: Date | null
    isOverdue: boolean
    description: string
    debit: number
    credit: number
  }
  const raw: Raw[] = []

  for (const inv of input.invoices) {
    const t = inv.date.getTime()
    if (t < startMs) {
      openingBalance = safeAdd(openingBalance, inv.grandTotal, 2)
    } else if (t <= endMs) {
      const dueAcuan = customerStatementDueAcuan(inv)
      raw.push({
        id: inv.id,
        kind: "invoice",
        date: inv.date,
        documentNo: inv.documentNo,
        referenceDocumentNo: null,
        dueDate: dueAcuan,
        isOverdue:
          // ponytail: penanda ikut deskripsi existing; label mandiri (mis. overdueLabel) tambah bila Frontend butuh badge terpisah.
          dueAcuan != null &&
          wibDayKey(dueAcuan) < periodEndDay &&
          !isOutstandingSettled(sisaByInvoice.get(inv.id) ?? 0),
        description: `Faktur penjualan ${inv.documentNo}`,
        debit: safeAdd(0, inv.grandTotal, 2),
        credit: 0,
      })
    }
  }

  for (const pay of payments) {
    // Pelunasan piutang = amount + PPh dipotong (pola sales-payment.hook).
    // Baris kredit: withholding selalu 0 pada payment customer_credit,
    // rumus sama tetap berlaku.
    const settled = safeAdd(pay.amount, pay.withholdingAmount, 2)
    const t = pay.paymentDate.getTime()
    if (t < startMs) {
      openingBalance = safeSubtract(openingBalance, settled, 2)
    } else if (t <= endMs) {
      const isCredit = pay.paymentMethod === CREDIT_PAYMENT_METHOD
      raw.push({
        id: pay.id,
        kind: isCredit ? "credit" : "payment",
        date: pay.paymentDate,
        documentNo: pay.documentNo,
        referenceDocumentNo: pay.salesInvoiceDocumentNo,
        dueDate: null,
        isOverdue: false,
        description: isCredit
          ? `Alokasi kredit pelanggan${pay.creditDocumentNo ? ` ${pay.creditDocumentNo}` : ""} ke faktur ${pay.salesInvoiceDocumentNo}`
          : `Pembayaran faktur ${pay.salesInvoiceDocumentNo}`,
        debit: 0,
        credit: settled,
      })
    }
  }

  for (const ret of returns) {
    if (ret.returnCredit <= 0) continue
    const t = ret.date.getTime()
    if (t < startMs) {
      openingBalance = safeSubtract(openingBalance, ret.returnCredit, 2)
    } else if (t <= endMs) {
      raw.push({
        id: ret.id,
        kind: "return",
        date: ret.date,
        documentNo: ret.documentNo,
        referenceDocumentNo: ret.salesInvoiceDocumentNo,
        dueDate: null,
        isOverdue: false,
        description: `Retur penjualan ${ret.documentNo} atas faktur ${ret.salesInvoiceDocumentNo}`,
        debit: 0,
        credit: safeAdd(0, ret.returnCredit, 2),
      })
    }
  }

  raw.sort(byDateThenKindThenId)

  let balance = openingBalance
  let totalDebit = 0
  let totalCredit = 0
  const entries: CustomerStatementEntry[] = raw.map((row) => {
    balance = safeSubtract(safeAdd(balance, row.debit, 2), row.credit, 2)
    totalDebit = safeAdd(totalDebit, row.debit, 2)
    totalCredit = safeAdd(totalCredit, row.credit, 2)
    return {
      kind: row.kind,
      date: row.date,
      documentNo: row.documentNo,
      referenceDocumentNo: row.referenceDocumentNo,
      dueDate: row.dueDate,
      isOverdue: row.isOverdue,
      description: row.description,
      debit: row.debit,
      credit: row.credit,
      balance,
    }
  })

  return {
    customerId,
    periodStart,
    periodEnd,
    openingBalance,
    entries,
    totalDebit,
    totalCredit,
    closingBalance: balance,
  }
}

/**
 * Outstanding piutang pelanggan dari himpunan faktur+payment yang sama —
 * jembatan uji AC-1: harus identik dengan closingBalance statement yang
 * periodenya menutup di akhir data, dan dengan agregasi
 * `customer-receivables.ts` (Σ receivableOutstanding per faktur, termasuk
 * faktur lunas yang di sana ter-skip karena sisa ≤ 0 — kontribusi 0).
 * `returns` opsional (F-104-V Putusan 2): kurangi `returnCredit` per faktur
 * asal (grandTotal − paid − returnCredit); tanpa arg ini rumus lama persis.
 */
export function customerStatementOutstanding(input: {
  invoices: readonly CustomerStatementInvoiceInput[]
  payments: readonly CustomerStatementPaymentInput[]
  returns?: readonly CustomerStatementReturnInput[]
}): number {
  const invoiceIds = new Set(input.invoices.map((inv) => inv.id))
  const paidByInvoice = new Map<number, number>()
  for (const pay of input.payments) {
    if (!invoiceIds.has(pay.salesInvoiceId)) continue
    paidByInvoice.set(
      pay.salesInvoiceId,
      safeAdd(paidByInvoice.get(pay.salesInvoiceId) ?? 0, safeAdd(pay.amount, pay.withholdingAmount, 2), 2),
    )
  }
  const returnCreditByInvoice = new Map<number, number>()
  for (const ret of input.returns ?? []) {
    if (!invoiceIds.has(ret.salesInvoiceId) || ret.returnCredit <= 0) continue
    returnCreditByInvoice.set(
      ret.salesInvoiceId,
      safeAdd(returnCreditByInvoice.get(ret.salesInvoiceId) ?? 0, ret.returnCredit, 2),
    )
  }
  let total = 0
  for (const inv of input.invoices) {
    const settled = safeAdd(
      paidByInvoice.get(inv.id) ?? 0,
      returnCreditByInvoice.get(inv.id) ?? 0,
      2,
    )
    total = safeAdd(total, receivableOutstanding(inv.grandTotal, settled), 2)
  }
  return total
}
