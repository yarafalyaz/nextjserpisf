/**
 * Barang diterima belum ditagih (GR/IR) — laporan **pemeriksaan**.
 *
 * Membandingkan dua sisi yang seharusnya bertemu:
 *
 * - **Dokumen**: nilai barang yang sudah diterima tapi belum (atau belum penuh)
 *   ditagih vendor — selisih per baris penerimaan (`VendorBillItem.goodsReceiptItemId`
 *   yang menunjuk baris penerimaan).
 * - **Buku besar**: saldo akun GRNI (`settings.purchaseInventoryAccountId`,
 *   "Hutang Pembelian Belum Ditagih") dari jurnal terposting.
 *
 * Keduanya bisa berbeda, dan perbedaan itulah temuan yang dicari: dokumen PRD
 * proyek ini sendiri mencatat kasusnya — **ongkir yang sudah masuk HPP/landed
 * cost tetapi tidak muncul di tagihan vendor** meninggalkan sisa di akun GRNI.
 * Karena itu sisa ditampilkan **menurut umur**: sisa tua yang tidak bergerak lebih
 * mencurigakan daripada sisa periode berjalan.
 *
 * Batas yang harus jujur dikatakan: dokumen penagihan diambil dari baris tagihan
 * yang benar-benar menunjuk baris penerimaan; tagihan yang ditulis manual tanpa
 * menautkan barisnya tidak bisa dikurangkan di sini, sehingga sisa dokumen bisa
 * terlihat lebih besar dari kenyataan. Itu dinyatakan sebagai catatan, bukan
 * dibiarkan dibaca sebagai temuan.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency, formatDate } from "@/lib/utils/format"
import { safeAdd, safeMultiply, safeSubtract } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface ReceivedNotBilledLineInput {
  goodsReceiptId: number
  receiptNo: string
  receiptDate: Date
  vendorName: string | null
  sku: string | null
  name: string
  receivedQty: number
  unitCost: number
  /** Nilai tagihan vendor yang menunjuk baris penerimaan ini. */
  billedValue: number
}

export interface ReceivedNotBilledInput {
  lines: ReceivedNotBilledLineInput[]
  /** Saldo akun GRNI menurut buku besar; `null` bila akunnya belum dipetakan. */
  ledger: { accountLabel: string; balance: number } | null
  /** Tanggal acuan untuk menghitung umur (biasanya akhir periode). */
  asOf: Date
  periodEndIsToday: boolean
}

export interface ReceivedNotBilledResult {
  /**
   * Satu tabel saja, sengaja: registry laporan/PDF menerima satu tabel per
   * laporan, sehingga memisahkan "ringkasan" ke tabel kedua akan membuat layar
   * dan PDF menampilkan isi yang berbeda. Catatan rekonsiliasi akun karena itu
   * ikut sebagai baris `notice` di tabel ini, dan angkanya juga muncul di narasi
   * halaman (ikut tercetak).
   */
  detail: { columns: TableColumn[]; rows: TableRow[] }
  totals: {
    receipts: number
    lines: number
    receivedValue: number
    billedValue: number
    outstandingValue: number
    ledgerBalance: number | null
    /** Buku besar − dokumen. `null` bila akun belum dipetakan. */
    difference: number | null
    isBalanced: boolean
  }
  aging: { label: string; value: number; receipts: number }[]
  verdict: string
}

const BALANCE_TOLERANCE = 0.5

/** Ambang umur sisa, dalam hari. */
export const AGING_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: "0–30 hari", min: 0, max: 30 },
  { label: "31–60 hari", min: 31, max: 60 },
  { label: "61–90 hari", min: 61, max: 90 },
  { label: "Lebih dari 90 hari", min: 91, max: null },
]

const DAY = 86_400_000

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function shortDate(date: Date): string {
  return formatDate(date, { format: "short" })
}

/** Umur sisa dalam hari (tidak pernah negatif bila tanggal terima di masa depan). */
export function ageInDays(receiptDate: Date, asOf: Date): number {
  return Math.max(0, Math.floor((asOf.getTime() - receiptDate.getTime()) / DAY))
}

function bucketOf(age: number): string {
  const bucket = AGING_BUCKETS.find(
    (item) => age >= item.min && (item.max === null || age <= item.max),
  )
  return bucket?.label ?? AGING_BUCKETS[AGING_BUCKETS.length - 1].label
}

export function buildReceivedNotBilled(input: ReceivedNotBilledInput): ReceivedNotBilledResult {
  const { lines, ledger, asOf, periodEndIsToday } = input

  const byReceipt = new Map<number, ReceivedNotBilledLineInput[]>()
  for (const line of lines) {
    const existing = byReceipt.get(line.goodsReceiptId) ?? []
    existing.push(line)
    byReceipt.set(line.goodsReceiptId, existing)
  }

  const detailColumns: TableColumn[] = [
    { header: "Barang", align: "left", width: 100 },
    { header: "Diterima", align: "right", width: 55 },
    { header: "Ditagih", align: "right", width: 55 },
    { header: "Selisih", align: "right", width: 57 },
  ]
  const detailRows: TableRow[] = []

  const totals: ReceivedNotBilledResult["totals"] = {
    receipts: 0,
    lines: 0,
    receivedValue: 0,
    billedValue: 0,
    outstandingValue: 0,
    ledgerBalance: ledger?.balance ?? null,
    difference: null,
    isBalanced: false,
  }
  const aging = AGING_BUCKETS.map((bucket) => ({ label: bucket.label, value: 0, receipts: 0 }))

  const receipts = [...byReceipt.entries()].sort(
    (a, b) => a[1][0].receiptDate.getTime() - b[1][0].receiptDate.getTime() || a[0] - b[0],
  )

  for (const [, receiptLines] of receipts) {
    const first = receiptLines[0]
    const outstandingLines = receiptLines
      .map((line) => {
        const receivedValue = safeMultiply(line.receivedQty, line.unitCost, 2)
        return { line, receivedValue, outstanding: safeSubtract(receivedValue, line.billedValue, 2) }
      })
      .filter(({ outstanding }) => outstanding > BALANCE_TOLERANCE)

    // Penerimaan yang sudah ditagih penuh tidak masuk rincian: laporan ini daftar
    // tindak lanjut, bukan riwayat penagihan.
    if (outstandingLines.length === 0) continue

    const age = ageInDays(first.receiptDate, asOf)
    const bucket = aging.find((item) => item.label === bucketOf(age))
    if (bucket) bucket.receipts += 1

    let receiptOutstanding = 0
    let receiptReceived = 0
    let receiptBilled = 0

    detailRows.push({
      kind: "group",
      label: [
        first.receiptNo,
        shortDate(first.receiptDate),
        first.vendorName ?? "–",
        `umur ${age} hari`,
      ].join(" · "),
    })

    for (const { line, receivedValue, outstanding } of outstandingLines) {
      detailRows.push({
        kind: "data",
        cells: [
          `${line.sku ? `${line.sku} ` : ""}${line.name}`.trim(),
          amount(receivedValue),
          amount(line.billedValue),
          amount(outstanding),
        ],
      })
      totals.lines += 1
      totals.receivedValue = safeAdd(totals.receivedValue, receivedValue, 2)
      totals.billedValue = safeAdd(totals.billedValue, line.billedValue, 2)
      receiptOutstanding = safeAdd(receiptOutstanding, outstanding, 2)
      receiptReceived = safeAdd(receiptReceived, receivedValue, 2)
      receiptBilled = safeAdd(receiptBilled, line.billedValue, 2)
    }

    detailRows.push({
      kind: "total",
      label: `Sisa ${first.receiptNo}`,
      cells: ["", amount(receiptReceived), amount(receiptBilled), amount(receiptOutstanding)],
    })

    totals.receipts += 1
    totals.outstandingValue = safeAdd(totals.outstandingValue, receiptOutstanding, 2)
    if (bucket) bucket.value = safeAdd(bucket.value, receiptOutstanding, 2)
  }

  if (totals.receipts === 0) {
    detailRows.push({
      kind: "notice",
      text: "Tidak ada penerimaan barang yang belum ditagih pada periode ini.",
    })
  } else {
    detailRows.push({
      kind: "total",
      grand: true,
      label: "Jumlah Sisa Belum Ditagih",
      cells: [
        "",
        amount(totals.receivedValue),
        amount(totals.billedValue),
        amount(totals.outstandingValue),
      ],
    })
  }

  const difference = ledger === null ? null : safeSubtract(ledger.balance, totals.outstandingValue, 2)
  const isBalanced = difference !== null && Math.abs(difference) < BALANCE_TOLERANCE
  totals.difference = difference
  totals.isBalanced = isBalanced

  let verdict: string
  if (ledger === null) {
    verdict = "Akun GRNI belum dipetakan, jadi saldo buku besar belum bisa dibandingkan."
    detailRows.push({
      kind: "notice",
      text:
        "Akun \"Hutang Pembelian Belum Ditagih\" (GRNI) belum dipetakan di Pengaturan → Pemetaan Akun, " +
        "sehingga saldo buku besar tidak bisa dibandingkan. Laporan ini sengaja tidak menampilkan 0.",
    })
  } else if (isBalanced) {
    verdict = "Saldo akun GRNI sama dengan sisa dokumen."
    detailRows.push({
      kind: "notice",
      text:
        `Saldo akun ${ledger.accountLabel} (${amount(ledger.balance)}) sama dengan sisa belum ditagih menurut ` +
        `dokumen — tidak ada selisih.`,
    })
  } else {
    const arah = (difference ?? 0) > 0 ? "buku besar lebih besar" : "sisa dokumen lebih besar"
    verdict = `Ada selisih ${formatCurrency(Math.abs(difference ?? 0))} antara akun GRNI dan sisa dokumen.`
    detailRows.push({
      kind: "notice",
      text:
        `Saldo akun ${ledger.accountLabel} (${amount(ledger.balance)}) dibanding sisa dokumen ` +
        `(${amount(totals.outstandingValue)}): ada selisih ${formatCurrency(Math.abs(difference ?? 0))} (${arah}). ` +
        `Penyebab yang paling sering: ongkos angkut/biaya lain yang sudah masuk nilai persediaan tetapi tidak ` +
        `muncul di tagihan vendor, tagihan yang ditulis tanpa menautkan baris penerimaan, atau penerimaan yang ` +
        `dibatalkan setelah dijurnal.`,
    })
  }

  if (totals.receipts > 0) {
    detailRows.push({
      kind: "notice",
      text:
        "Dokumen penagihan hanya dihitung dari baris tagihan yang menunjuk baris penerimaan; tagihan manual " +
        "tanpa tautan membuat sisa dokumen tampak lebih besar dari kenyataan.",
    })
  }

  if (!periodEndIsToday) {
    detailRows.push({
      kind: "notice",
      text:
        "Sisa dokumen dihitung per akhir periode, sedangkan saldo akun diambil s.d. tanggal yang sama pada " +
        "buku besar; bila ada tagihan bertanggal di luar periode, selisih dapat berasal dari perbedaan titik waktu.",
    })
  }

  return {
    detail: { columns: detailColumns, rows: detailRows },
    totals,
    aging,
    verdict,
  }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function receivedNotBilledSummary(result: ReceivedNotBilledResult): string {
  const { totals } = result
  if (totals.ledgerBalance === null) {
    return `${totals.receipts} penerimaan bersisa ${formatCurrency(totals.outstandingValue)} · akun GRNI belum dipetakan`
  }
  if (totals.isBalanced) {
    return `${totals.receipts} penerimaan bersisa ${formatCurrency(totals.outstandingValue)} · cocok dengan akun GRNI`
  }
  return `${totals.receipts} penerimaan bersisa ${formatCurrency(totals.outstandingValue)} · selisih ${formatCurrency(Math.abs(totals.difference ?? 0))} dengan akun GRNI`
}
