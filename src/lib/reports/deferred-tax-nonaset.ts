/**
 * Sumber temporer NON-ASET pajak tangguhan — provisi garansi, CKPN piutang,
 * akumulasi rugi fiskal (sumber 4/5/7 F-2026-10-23-112-V Putusan 1), inti
 * lapis aman F-2026-10-23-126-V (vonis BOT 4, PR #651).
 *
 * Builder MURNI (tanpa Prisma/DOM). Tiga baris sumber bernama masuk read-model
 * yang sama (Putusan 4), nol-netting antar sumber maupun terhadap temporer
 * aset: builder ini tidak menerima temporer aset sama sekali, jadi salinghapus
 * struktural tidak mungkin. Jurnal tangguhan TETAP tertutup — read-model
 * analitis saja, `DEFERRED_TAX_NOTICE` tampil verbatim.
 *
 * Provisi garansi (Putusan 1): HANYA saldo provisi POSTED yang terhitung;
 * dasar fiskal NOL, seluruh tercatat = temporer dapat dikurangkan. Kontrak
 * TIDAK punya field flag rute: klasifikasi ditentukan jurnal POSTED yang
 * dipasok loader (jumlah jurnal + saldo). Nol jurnal POSTED = "nol
 * terverifikasi jurnal" bernama, BUKAN belum-tersedia dan BUKAN asumsi rute
 * mati (E126-1). Beban klaim rute mati tidak pernah masuk kontrak ini —
 * bukan temporer (E126-2).
 *
 * CKPN (Putusan 2): hanya saldo penyisihan POSTED (dasar fiskal nol selama
 * penyisihan, Pasal 6(1)(h) belum terpenuhi). Inti F-090-V belum ada ->
 * loader meneruskan null -> "belum tersedia" bernama; DILARANG hitung ECL
 * bayangan dari aging (E126-3). Hapus-buku menutup temporer sebagai
 * terealisasi fiskal HANYA bila fakta PMK-105/PMK.03/2009 lengkap terstruktur
 * per piutang; tanpa lengkap = "tidak memenuhi syarat fiskal", dan label
 * dapat-dibiayakan tidak pernah diterbitkan builder ini (E126-4).
 *
 * Rugi fiskal (Putusan 3): HANYA register input terstruktur kertas kerja SPT
 * per tahun rugi bertanda tangan penanggung jawab bernama. Kontrak tidak
 * menerima laba GL/jurnal penutup sama sekali (E126-5 struktural). Kompensasi
 * tertua-dulu dalam jendela tahun rugi + 5 tahun (Pasal 6 ayat (2)); sisa di
 * luar jendela KEDALUWARSA: keluar stok + tampil mutasi (E126-6).
 *
 * Label pengakuan per sumber mengikuti F-125-V Putusan 4 (peristiwa/sumber
 * penghasil, bukan warisan pertama): "dapat diakui analitis" hanya bila
 * dasar laba kena pajak terbekukan dipasok untuk sumber itu (E126-7).
 *
 * Pembekuan (E126-9): builder murni atas input terbekukan yang dipasok —
 * tidak membaca master berjalan; edit persen/tarif/input sesudah pembekuan
 * tidak mengubah hasil atas input terbekukan yang sama.
 */

import {
  DEFERRED_TAX_NOTICE,
  OPERATOR_RATE_LABEL,
  validateTaxRatePercent,
  type DeferredTaxRateSource,
} from "@/lib/reports/deferred-tax"
import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { safeAdd, safeDivide, safeMultiply, safeSubtract } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export const NONASET_PROVISION_ZERO_VERIFIED_LABEL =
  "provisi garansi: rute provisi mati — saldo provisi nol terverifikasi jurnal"
export const NONASET_PROVISION_UNMAPPED_LABEL =
  "provisi garansi: belum tersedia — akun provisi belum terpetakan"
export const NONASET_CKPN_UNAVAILABLE_LABEL =
  "CKPN: belum tersedia — inti penyisihan belum terbekukan"
export const NONASET_FISCAL_LOSS_UNAVAILABLE_LABEL =
  "rugi fiskal: belum tersedia — register kertas kerja SPT belum terbekukan"
export const NONASET_RECOGNITION_ELIGIBLE_LABEL = "dapat diakui analitis"
export const NONASET_RECOGNITION_UNTESTED_LABEL =
  "belum teruji — bukan angka pengakuan"
export const NONASET_NEGATIVE_BALANCE_LABEL =
  "saldo tidak sah — negatif; gagal tertutup bernama (tidak dihitung sebagai temporer)"
export const NONASET_WRITEOFF_INVALID_AMOUNT_LABEL =
  "hapus-buku jumlah tidak sah — wajib positif terhingga; ditolak tanpa total"
export const NONASET_WRITEOFF_NOT_FISCALLY_QUALIFIED_LABEL =
  "hapus-buku tidak memenuhi syarat fiskal"
export const NONASET_WRITEOFF_REALIZED_LABEL =
  "hapus-buku memenuhi syarat PMK-105 — temporer tertutup terealisasi fiskal"

export type NonAssetSourceStatus =
  | "computed"
  | "zero-verified"
  | "unavailable"

export interface WarrantyProvisionInput {
  /**
   * Saldo kredit provisi dari jurnal POSTED+REVERSED akun provisi
   * terpetakan per tanggal neraca (pasangan reversal neto nol).
   * null = akun belum terpetakan (belum tersedia bernama).
   * DILARANG mengisi dari flag rute atau saldo GL karangan.
   */
  postedProvisionBalance: number | null
  /** Jumlah jurnal POSTED+REVERSED yang menyentuh akun provisi s.d. tanggal neraca. */
  postedProvisionJournalCount: number
  /** Dasar laba kena pajak terbekukan untuk sumber ini (uji pengakuan). */
  profitBasisFrozen: boolean
}

export interface ReceivableWriteOffInput {
  /** Identitas piutang terstruktur (nama piutang/dokumen), tampil apa adanya. */
  receivableLabel: string
  /** Jumlah bagian piutang yang dihapus-buku pada peristiwa ini. */
  amount: number
  /**
   * Fakta PMK-105/PMK.03/2009 lengkap terstruktur per piutang: daftar
   * nominatif diserahkan + penagihan/perjanjian tertulis + publikasi +
   * dibebankan komersial, masing-masing fakta dokumen bertanggal yang
   * dibekukan pemanggil. false/satu kurang = tidak memenuhi syarat fiskal.
   */
  pmk105Complete: boolean
}

export interface CkpnInput {
  /**
   * Saldo penyisihan dari jurnal POSTED akun kontra terpetakan. null =
   * inti penyisihan F-090-V belum terbekukan (belum tersedia bernama).
   * DILARANG mengisi dari aging/matriks ECL bayangan.
   */
  postedAllowanceBalance: number | null
  /** Peristiwa hapus-buku tahun berjalan (mutasi penutupan, bukan edit stok lampau). */
  writeOffs: ReceivableWriteOffInput[]
  profitBasisFrozen: boolean
}

export interface FiscalLossCompensationInput {
  /** Tahun pajak kompensasi dipakai. */
  year: number
  amount: number
}

export interface FiscalLossYearInput {
  /** Tahun rugi menurut SPT Tahunan/kertas kerja. */
  lossYear: number
  /** Rugi fiskal awal menurut register terstruktur (positif). */
  initialLoss: number
  /** Penanggung jawab penanda tangan register; kosong = register tidak sah. */
  signedBy: string | null
  /** Kompensasi terpakai per tahun berikutnya (input terstruktur, bukan turunan GL). */
  compensations: FiscalLossCompensationInput[]
  profitBasisFrozen: boolean
}

export interface NonAssetSourceLine {
  source: "warranty-provision" | "ckpn" | "fiscal-loss"
  label: string
  status: NonAssetSourceStatus
  /** Jumlah tercatat dasar jurnal/input terbekukan. */
  carryingAmount: number
  /** Dasar fiskal (nol terstruktur provisi/CKPN; stok sisa rugi fiskal = 0 dasar, sisa tampil di temporer). */
  taxBase: number
  /** Perbedaan temporer dapat dikurangkan (positif). */
  deductibleDifference: number
  /** Indikasi aset pajak tangguhan atas baris ini (tidak di-netting). */
  deferredTaxAssetIndication: number
  recognitionLabel: string
  /** Penanda risiko kedaluwarsa rugi fiskal tampil pada barisnya. */
  expiryRiskLabel: string | null
  detail: string
}

export interface DeferredTaxNonAssetResult {
  taxRatePercent: number | null
  rateSource: DeferredTaxRateSource | null
  rateSourceLabel: string | null
  asOf: Date
  table: { columns: TableColumn[]; rows: TableRow[] }
  lines: NonAssetSourceLine[]
  /** Mutasi tahun berjalan: penutupan hapus-buku + kedaluwarsa rugi fiskal. */
  mutations: string[]
  /** Kompensasi yang ditolak (urutan/jendela/register tidak sah). */
  rejectedCompensations: string[]
  totals: {
    /** Temporer dapat dikurangkan per sumber — TIDAK dijumlah silang ke liabilitas. */
    deductibleBySource: Record<NonAssetSourceLine["source"], number>
    deferredTaxAssetIndication: number
    expiredFiscalLoss: number
    realizedWriteOff: number
    nonQualifiedWriteOff: number
  }
  verdict: string
  notice: string
}

const COLUMNS: TableColumn[] = [
  { header: "Sumber Non-Aset", align: "left", width: 62 },
  { header: "Jumlah Tercatat", align: "right", width: 38 },
  { header: "Dasar Fiskal", align: "right", width: 32 },
  { header: "Temporer Dapat Dikurangkan", align: "right", width: 45 },
  { header: "Status / Pengakuan", align: "left", width: 50 },
  { header: "Indikasi Aset Tangguhan", align: "right", width: 40 },
]

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function indication(deductible: number, rate: number): number {
  return safeDivide(safeMultiply(deductible, rate, 2), 100, 2)
}

function recognition(profitBasisFrozen: boolean, deductible: number): string {
  if (deductible <= 0) return NONASET_RECOGNITION_UNTESTED_LABEL
  return profitBasisFrozen
    ? NONASET_RECOGNITION_ELIGIBLE_LABEL
    : NONASET_RECOGNITION_UNTESTED_LABEL
}

/** Jendela kompensasi Pasal 6 ayat (2): tahun rugi + 5 tahun berikutnya. */
export function fiscalLossExpiryYear(lossYear: number): number {
  return lossYear + 5
}

export function buildDeferredTaxNonAssetSources(input: {
  provision: WarrantyProvisionInput
  ckpn: CkpnInput
  fiscalLossYears: FiscalLossYearInput[]
  taxRatePercent: number | null
  rateSource?: DeferredTaxRateSource
  asOf: Date
}): DeferredTaxNonAssetResult {
  const rate = validateTaxRatePercent(input.taxRatePercent)
  const notice = DEFERRED_TAX_NOTICE
  const source: DeferredTaxRateSource = input.rateSource ?? "operator"
  const asOfYear = input.asOf.getUTCFullYear()
  const zeroTotals: DeferredTaxNonAssetResult["totals"] = {
    deductibleBySource: { "warranty-provision": 0, ckpn: 0, "fiscal-loss": 0 },
    deferredTaxAssetIndication: 0,
    expiredFiscalLoss: 0,
    realizedWriteOff: 0,
    nonQualifiedWriteOff: 0,
  }

  if (rate === null) {
    return {
      taxRatePercent: null,
      rateSource: null,
      rateSourceLabel: null,
      asOf: input.asOf,
      table: {
        columns: COLUMNS,
        rows: [
          {
            kind: "notice",
            text: "Tarif pajak badan tidak sah atau belum dipasok, sehingga sumber temporer non-aset tidak dihitung. " + notice,
          },
        ],
      },
      lines: [],
      mutations: [],
      rejectedCompensations: [],
      totals: zeroTotals,
      verdict: "Sumber temporer non-aset tidak dihitung: tarif badan tidak sah",
      notice,
    }
  }

  const rateSourceLabel = source === "operator" ? OPERATOR_RATE_LABEL : null
  const lines: NonAssetSourceLine[] = []
  const mutations: string[] = []
  const rejected: string[] = []
  const totals = { ...zeroTotals, deductibleBySource: { ...zeroTotals.deductibleBySource } }

  // ── Putusan 1: provisi garansi — hanya jurnal POSTED penentu ─────────────
  const prov = input.provision
  if (prov.postedProvisionBalance === null || !Number.isFinite(prov.postedProvisionBalance)) {
    lines.push({
      source: "warranty-provision",
      label: "Provisi garansi",
      status: "unavailable",
      carryingAmount: 0,
      taxBase: 0,
      deductibleDifference: 0,
      deferredTaxAssetIndication: 0,
      recognitionLabel: NONASET_RECOGNITION_UNTESTED_LABEL,
      expiryRiskLabel: null,
      detail: NONASET_PROVISION_UNMAPPED_LABEL,
    })
  } else if (prov.postedProvisionBalance < 0) {
    // Gagal tertutup: saldo negatif (debit anomali) bukan temporer negatif.
    lines.push({
      source: "warranty-provision",
      label: "Provisi garansi",
      status: "unavailable",
      carryingAmount: 0,
      taxBase: 0,
      deductibleDifference: 0,
      deferredTaxAssetIndication: 0,
      recognitionLabel: NONASET_RECOGNITION_UNTESTED_LABEL,
      expiryRiskLabel: null,
      detail: `provisi garansi: ${NONASET_NEGATIVE_BALANCE_LABEL}`,
    })
  } else if (prov.postedProvisionJournalCount <= 0 || prov.postedProvisionBalance === 0) {
    // Nol terverifikasi dari ketiadaan jurnal POSTED — bukan flag rute.
    lines.push({
      source: "warranty-provision",
      label: "Provisi garansi",
      status: "zero-verified",
      carryingAmount: 0,
      taxBase: 0,
      deductibleDifference: 0,
      deferredTaxAssetIndication: 0,
      recognitionLabel: NONASET_RECOGNITION_UNTESTED_LABEL,
      expiryRiskLabel: null,
      detail: NONASET_PROVISION_ZERO_VERIFIED_LABEL,
    })
  } else {
    const deductible = prov.postedProvisionBalance
    const ind = indication(deductible, rate)
    lines.push({
      source: "warranty-provision",
      label: "Provisi garansi",
      status: "computed",
      carryingAmount: deductible,
      taxBase: 0,
      deductibleDifference: deductible,
      deferredTaxAssetIndication: ind,
      recognitionLabel: recognition(prov.profitBasisFrozen, deductible),
      expiryRiskLabel: null,
      detail: "saldo provisi POSTED; dasar fiskal nol (baru dapat dikurangkan saat klaim terealisasi)",
    })
    totals.deductibleBySource["warranty-provision"] = deductible
    totals.deferredTaxAssetIndication = safeAdd(totals.deferredTaxAssetIndication, ind, 2)
  }

  // ── Putusan 2: CKPN — penyisihan POSTED; hapus-buku bersyarat PMK-105 ───
  const ckpn = input.ckpn
  for (const wo of ckpn.writeOffs) {
    if (!Number.isFinite(wo.amount) || wo.amount <= 0) {
      mutations.push(`${wo.receivableLabel}: ${NONASET_WRITEOFF_INVALID_AMOUNT_LABEL}`)
      continue
    }
    if (wo.pmk105Complete) {
      totals.realizedWriteOff = safeAdd(totals.realizedWriteOff, wo.amount, 2)
      mutations.push(
        `${wo.receivableLabel}: ${NONASET_WRITEOFF_REALIZED_LABEL} ${amount(wo.amount)}`,
      )
    } else {
      totals.nonQualifiedWriteOff = safeAdd(totals.nonQualifiedWriteOff, wo.amount, 2)
      mutations.push(
        `${wo.receivableLabel}: ${NONASET_WRITEOFF_NOT_FISCALLY_QUALIFIED_LABEL} ${amount(wo.amount)} — temporer ditutup tanpa manfaat fiskal terealisasi`,
      )
    }
  }
  if (ckpn.postedAllowanceBalance === null || !Number.isFinite(ckpn.postedAllowanceBalance)) {
    lines.push({
      source: "ckpn",
      label: "CKPN piutang",
      status: "unavailable",
      carryingAmount: 0,
      taxBase: 0,
      deductibleDifference: 0,
      deferredTaxAssetIndication: 0,
      recognitionLabel: NONASET_RECOGNITION_UNTESTED_LABEL,
      expiryRiskLabel: null,
      detail: NONASET_CKPN_UNAVAILABLE_LABEL,
    })
  } else if (ckpn.postedAllowanceBalance < 0) {
    lines.push({
      source: "ckpn",
      label: "CKPN piutang",
      status: "unavailable",
      carryingAmount: 0,
      taxBase: 0,
      deductibleDifference: 0,
      deferredTaxAssetIndication: 0,
      recognitionLabel: NONASET_RECOGNITION_UNTESTED_LABEL,
      expiryRiskLabel: null,
      detail: `CKPN: ${NONASET_NEGATIVE_BALANCE_LABEL}`,
    })
  } else {
    // Stok penyisihan POSTED kini; penutupan hapus-buku tampil mutasi di atas,
    // bukan pengurang diam-diam (loader memasok saldo sesudah peristiwa).
    const deductible = ckpn.postedAllowanceBalance
    const ind = indication(deductible, rate)
    lines.push({
      source: "ckpn",
      label: "CKPN piutang",
      status: deductible === 0 ? "zero-verified" : "computed",
      carryingAmount: deductible,
      taxBase: 0,
      deductibleDifference: deductible,
      deferredTaxAssetIndication: ind,
      recognitionLabel: recognition(ckpn.profitBasisFrozen, deductible),
      expiryRiskLabel: null,
      detail:
        deductible === 0
          ? "CKPN: saldo penyisihan POSTED nol terverifikasi jurnal"
          : "saldo penyisihan POSTED; dasar fiskal nol selama penyisihan (Pasal 6 ayat (1) huruf h belum terpenuhi)",
    })
    totals.deductibleBySource.ckpn = deductible
    totals.deferredTaxAssetIndication = safeAdd(totals.deferredTaxAssetIndication, ind, 2)
  }

  // ── Putusan 3: rugi fiskal — register SPT, tertua-dulu, jendela 5 tahun ──
  const signedYears = [...input.fiscalLossYears].sort((a, b) => a.lossYear - b.lossYear)
  let fiscalStock = 0
  let fiscalCarrying = 0
  let anyFiscalComputed = false
  let allFiscalProfitFrozen = true
  const fiscalDetails: string[] = []
  // Sisa berjalan per tahun rugi untuk penegakan tertua-dulu.
  const remaining = new Map<number, number>()
  const yearCounts = new Map<number, number>()
  for (const y of signedYears) yearCounts.set(y.lossYear, (yearCounts.get(y.lossYear) ?? 0) + 1)
  for (const y of signedYears) {
    // Register satu baris per tahun rugi: duplikat ditolak semua entri tahun
    // itu (dilarang agregasi diam-diam / tertimpa Map + sisa ganda).
    if ((yearCounts.get(y.lossYear) ?? 0) > 1) {
      rejected.push(
        `rugi fiskal ${y.lossYear}: tahun rugi duplikat pada register — semua entri tahun ini ditolak (wajib satu baris per tahun rugi)`,
      )
      continue
    }
    if (!y.signedBy?.trim() || !(y.initialLoss > 0)) {
      rejected.push(
        `rugi fiskal ${y.lossYear}: register tidak sah (wajib rugi awal positif + penanda tangan bernama) — tidak masuk stok`,
      )
      continue
    }
    remaining.set(y.lossYear, y.initialLoss)
  }
  for (const y of signedYears) {
    if (!remaining.has(y.lossYear)) continue
    const expiry = fiscalLossExpiryYear(y.lossYear)
    let rem = remaining.get(y.lossYear) ?? 0
    const comps = [...y.compensations].sort((a, b) => a.year - b.year)
    for (const comp of comps) {
      // Tertua-dulu: tahun rugi lebih tua yang masih bersisa & belum
      // kedaluwarsa pada tahun kompensasi ini harus sudah habis lebih dulu.
      const olderOutstanding = signedYears.some((o) => {
        if (o.lossYear >= y.lossYear) return false
        const oRem = remaining.get(o.lossYear)
        if (oRem === undefined || oRem <= 0) return false
        return comp.year <= fiscalLossExpiryYear(o.lossYear)
      })
      if (olderOutstanding) {
        rejected.push(
          `kompensasi ${comp.year} untuk rugi ${y.lossYear} ditolak: tahun rugi tertua belum habis (wajib tertua-dulu)`,
        )
        continue
      }
      if (comp.year <= y.lossYear || comp.year > expiry) {
        rejected.push(
          `kompensasi ${comp.year} untuk rugi ${y.lossYear} ditolak: di luar jendela ${y.lossYear + 1}–${expiry}`,
        )
        continue
      }
      if (!(comp.amount > 0) || comp.amount > rem) {
        rejected.push(
          `kompensasi ${comp.year} untuk rugi ${y.lossYear} ditolak: jumlah tidak sah atau melebihi sisa`,
        )
        continue
      }
      rem = safeSubtract(rem, comp.amount, 2)
      remaining.set(y.lossYear, rem)
    }
    fiscalCarrying = safeAdd(fiscalCarrying, y.initialLoss, 2)
    if (asOfYear > expiry) {
      if (rem > 0) {
        totals.expiredFiscalLoss = safeAdd(totals.expiredFiscalLoss, rem, 2)
        mutations.push(
          `rugi fiskal ${y.lossYear}: kedaluwarsa akhir ${expiry} — sisa ${amount(rem)} keluar stok`,
        )
      }
      fiscalDetails.push(`rugi ${y.lossYear}: kedaluwarsa ${expiry}, sisa ${amount(rem)} keluar stok`)
      remaining.set(y.lossYear, 0)
      continue
    }
    if (rem > 0) {
      anyFiscalComputed = true
      if (!y.profitBasisFrozen) allFiscalProfitFrozen = false
      fiscalStock = safeAdd(fiscalStock, rem, 2)
      const yearsLeft = expiry - asOfYear
      fiscalDetails.push(
        `rugi ${y.lossYear}: awal ${amount(y.initialLoss)}, sisa ${amount(rem)}, kedaluwarsa ${expiry}`,
      )
      if (yearsLeft <= 1) {
        fiscalDetails.push(`rugi ${y.lossYear}: risiko kedaluwarsa — jendela tersisa ${yearsLeft} tahun`)
      }
    }
  }
  const fiscalRisk =
    signedYears.some(
      (y) =>
        (remaining.get(y.lossYear) ?? 0) > 0 &&
        asOfYear <= fiscalLossExpiryYear(y.lossYear) &&
        fiscalLossExpiryYear(y.lossYear) - asOfYear <= 1,
    )
      ? "risiko kedaluwarsa rugi fiskal — jendela tersisa ≤1 tahun"
      : null
  if (input.fiscalLossYears.length === 0) {
    lines.push({
      source: "fiscal-loss",
      label: "Akumulasi rugi fiskal",
      status: "unavailable",
      carryingAmount: 0,
      taxBase: 0,
      deductibleDifference: 0,
      deferredTaxAssetIndication: 0,
      recognitionLabel: NONASET_RECOGNITION_UNTESTED_LABEL,
      expiryRiskLabel: null,
      detail: NONASET_FISCAL_LOSS_UNAVAILABLE_LABEL,
    })
  } else {
    const ind = indication(fiscalStock, rate)
    lines.push({
      source: "fiscal-loss",
      label: "Akumulasi rugi fiskal",
      status: anyFiscalComputed ? "computed" : "zero-verified",
      carryingAmount: fiscalCarrying,
      taxBase: 0,
      deductibleDifference: fiscalStock,
      deferredTaxAssetIndication: ind,
      recognitionLabel:
        fiscalStock > 0 && anyFiscalComputed && allFiscalProfitFrozen
          ? NONASET_RECOGNITION_ELIGIBLE_LABEL
          : NONASET_RECOGNITION_UNTESTED_LABEL,
      expiryRiskLabel: fiscalRisk,
      detail:
        fiscalDetails.join("; ") ||
        "rugi fiskal: tidak ada sisa dalam jendela pada tanggal neraca",
    })
    totals.deductibleBySource["fiscal-loss"] = fiscalStock
    totals.deferredTaxAssetIndication = safeAdd(totals.deferredTaxAssetIndication, ind, 2)
  }

  const rows: TableRow[] = lines.map((line) => ({
    kind: "data" as const,
    cells: [
      line.label,
      amount(line.carryingAmount),
      amount(line.taxBase),
      amount(line.deductibleDifference),
      `${line.detail}${line.expiryRiskLabel ? ` — ${line.expiryRiskLabel}` : ""} · ${line.recognitionLabel}`,
      amount(line.deferredTaxAssetIndication),
    ],
  }))
  rows.push({
    kind: "total",
    grand: true,
    label: "Jumlah sumber non-aset (per arah, tanpa salinghapus)",
    cells: [
      amount(lines.reduce((s, l) => safeAdd(s, l.carryingAmount, 2), 0)),
      amount(0),
      amount(lines.reduce((s, l) => safeAdd(s, l.deductibleDifference, 2), 0)),
      amount(totals.deferredTaxAssetIndication),
    ],
  })
  for (const m of mutations) rows.push({ kind: "notice", text: `Mutasi: ${m}` })
  for (const r of rejected) rows.push({ kind: "notice", text: r })
  if (totals.expiredFiscalLoss > 0) {
    rows.push({
      kind: "notice",
      text: `Rugi fiskal kedaluwarsa ${formatCurrency(totals.expiredFiscalLoss)} dikeluarkan dari stok dapat dikurangkan.`,
    })
  }
  if (rateSourceLabel) {
    rows.push({ kind: "notice", text: `Tarif ${rate}% adalah ${rateSourceLabel}.` })
  }
  rows.push({ kind: "notice", text: notice })

  const computedCount = lines.filter((l) => l.status === "computed").length
  const verdict =
    computedCount === 0
      ? "Sumber temporer non-aset: tidak ada sumber terhitung (nol terverifikasi / belum tersedia bernama)"
      : `Sumber non-aset: aset tangguhan indikasi ${formatCurrency(totals.deferredTaxAssetIndication)} ` +
        `pada tarif ${rate}%${rateSourceLabel ? ` (${rateSourceLabel})` : ""} (read-model, bukan jurnal; tanpa salinghapus antar sumber)`

  return {
    taxRatePercent: rate,
    rateSource: source,
    rateSourceLabel,
    asOf: input.asOf,
    table: { columns: COLUMNS, rows },
    lines,
    mutations,
    rejectedCompensations: rejected,
    totals,
    verdict,
    notice,
  }
}
