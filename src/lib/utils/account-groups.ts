import type { AccurateAccountType } from "@/lib/setup/base-data"

/**
 * Label Indonesia untuk tipe akun gaya Accurate (`Account.reportGroup`).
 *
 * Kode mentahnya (`AREC`, `OCAS`, `EXPS`, …) hanya masuk akal bagi yang hafal singkatan
 * Accurate, jadi UI tidak boleh menampilkannya apa adanya. Istilahnya disamakan dengan
 * judul seksi di laporan Laba/Rugi (`src/lib/reports/statement-table.ts`) supaya satu
 * akun disebut sama di bagan akun dan di laporannya.
 */
export const ACCOUNT_GROUP_LABELS: Record<AccurateAccountType, string> = {
  // Aset
  BANK: "Kas & Bank",
  AREC: "Piutang Usaha",
  INTR: "Persediaan",
  OCAS: "Aset Lancar Lainnya",
  FASS: "Aset Tetap",
  DEPR: "Akumulasi Penyusutan",
  // Kewajiban
  APAY: "Utang Usaha",
  OCLY: "Kewajiban Lancar Lainnya",
  LTLY: "Kewajiban Jangka Panjang",
  // Ekuitas
  EQTY: "Ekuitas",
  // Laba rugi
  REVE: "Pendapatan",
  COGS: "Beban Pokok Penjualan",
  EXPS: "Beban Operasional",
  OINC: "Pendapatan Non Operasional",
  OEXP: "Beban Non Operasional",
}

/** Label yang bisa dibaca manusia untuk sebuah `reportGroup`; `null` bila belum diisi/tak dikenal. */
export function accountGroupLabel(group: string | null | undefined): string | null {
  if (!group) return null
  return ACCOUNT_GROUP_LABELS[group as AccurateAccountType] ?? null
}
