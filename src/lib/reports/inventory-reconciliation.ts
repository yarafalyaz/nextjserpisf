/**
 * Selisih saldo akun persediaan dengan nilai barang — laporan **pemeriksaan**
 * (audit), bukan laporan operasional.
 *
 * Yang dibandingkan bukan dua angka dari sumber yang sama, melainkan dua dunia:
 *
 * - **Buku besar**: saldo akun persediaan (`settings.inventoryAccountId`) dari
 *   jurnal terposting s/d akhir periode.
 * - **Nilai barang**: lapisan persediaan menurut aturan penilaian yang sama
 *   dengan laporan Valuasi Stok (`stock-valuation.ts`).
 *
 * Karena itu laporan ini jujur soal batasnya:
 *
 * - Lapisan persediaan adalah **kondisi saat ini**, bukan potret akhir periode.
 *   Bila periode yang dibuka bukan periode berjalan, selisih bisa lahir dari
 *   perbedaan titik waktu — dan itu harus dikatakan, bukan dibiarkan dibaca
 *   sebagai temuan.
 * - Bila akun persediaan belum dipetakan, laporan **tidak** menampilkan 0
 *   (angka 0 akan terbaca "sudah cocok") melainkan menyatakannya belum bisa
 *   dibandingkan.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface InventoryReconciliationInput {
  valuation: {
    qty: number
    value: number
    byWarehouse: { code: string; name: string; items: number; qty: number; value: number }[]
  }
  ledger: { accountLabel: string; balance: number } | null
  /** Apakah akhir periode = hari ini (menentukan apakah titik waktu sebanding). */
  periodEndIsToday: boolean
}

export interface InventoryReconciliationResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: {
    valuationValue: number
    ledgerBalance: number | null
    /** Buku besar − nilai barang. `null` bila akun belum dipetakan. */
    difference: number | null
    isBalanced: boolean
  }
  verdict: string
}

/** Selisih di bawah setengah rupiah dianggap nol (pembulatan dua desimal). */
const BALANCE_TOLERANCE = 0.5

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

export function buildInventoryReconciliation(
  input: InventoryReconciliationInput,
): InventoryReconciliationResult {
  const { valuation, ledger, periodEndIsToday } = input
  const columns: TableColumn[] = [
    { header: "Keterangan", align: "left", width: 200 },
    { header: "Nilai", align: "right", width: 67 },
  ]

  const difference = ledger === null ? null : ledger.balance - valuation.value
  const isBalanced = difference !== null && Math.abs(difference) < BALANCE_TOLERANCE

  const rows: TableRow[] = [
    {
      kind: "data",
      cells: ["Nilai barang menurut lapisan persediaan", amount(valuation.value)],
    },
  ]

  for (const warehouse of valuation.byWarehouse) {
    rows.push({
      kind: "data",
      cells: [
        `   · ${warehouse.name} (${warehouse.code}) — ${warehouse.items} barang`,
        amount(warehouse.value),
      ],
    })
  }

  rows.push({
    kind: "data",
    cells: [
      ledger ? `Saldo akun ${ledger.accountLabel} menurut buku besar` : "Saldo akun persediaan menurut buku besar",
      ledger ? amount(ledger.balance) : "–",
    ],
  })

  rows.push({
    kind: "total",
    grand: true,
    label: "Selisih (buku besar − nilai barang)",
    cells: ["", difference === null ? "–" : amount(difference)],
  })

  let verdict: string
  if (ledger === null) {
    verdict = "Akun persediaan belum dipetakan, jadi saldo buku besar belum bisa dibandingkan."
    rows.push({
      kind: "notice",
      text:
        "Akun persediaan belum dipetakan di Pengaturan → Pemetaan Akun, sehingga saldo buku besar tidak " +
        "bisa dibandingkan. Laporan ini sengaja tidak menampilkan 0 — angka 0 akan terbaca seolah sudah cocok.",
    })
  } else if (isBalanced) {
    verdict = "Saldo akun persediaan sama dengan nilai barang."
    rows.push({
      kind: "notice",
      text: "Saldo akun persediaan sama dengan nilai barang menurut lapisan persediaan — tidak ada selisih.",
    })
  } else {
    verdict = `Ada selisih ${formatCurrency(Math.abs(difference ?? 0))} antara buku besar dan nilai barang.`
    rows.push({
      kind: "notice",
      text:
        `Ada selisih ${formatCurrency(Math.abs(difference ?? 0))} antara saldo akun persediaan dan nilai barang ` +
        `(${difference !== null && difference > 0 ? "buku besar lebih besar" : "nilai barang lebih besar"}). ` +
        `Periksa mutasi stok yang belum terjurnal, penerimaan/pengeluaran bertanggal di luar periode, atau ` +
        `harga pokok yang berubah setelah transaksi dibukukan.`,
    })
  }

  if (!periodEndIsToday) {
    rows.push({
      kind: "notice",
      text:
        "Nilai barang dihitung dari kondisi lapisan persediaan SAAT INI, sedangkan saldo akun dihitung s/d " +
        "akhir periode. Karena periodenya bukan periode berjalan, selisih dapat berasal dari perbedaan " +
        "titik waktu — bukan berarti ada transaksi yang salah.",
    })
  }

  return {
    table: { columns, rows },
    totals: {
      valuationValue: valuation.value,
      ledgerBalance: ledger?.balance ?? null,
      difference,
      isBalanced,
    },
    verdict,
  }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function inventoryReconciliationSummary(result: InventoryReconciliationResult): string {
  const { totals } = result
  if (totals.ledgerBalance === null) return "Akun persediaan belum dipetakan"
  if (totals.isBalanced) return "Cocok: saldo akun = nilai barang"
  return `Selisih ${formatCurrency(Math.abs(totals.difference ?? 0))}`
}
