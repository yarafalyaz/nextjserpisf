import { redirect } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"

/**
 * Halaman lama "Keuangan" adalah pengalih laporan (`?report=trial-balance` /
 * `?report=income-statement`) yang menggandakan Neraca Saldo dan Laba Rugi sebagai
 * beberapa section dalam satu halaman — bukan satu lembar laporan.
 *
 * Sistem akuntansi menaruh tiap statement di laporannya sendiri (Accurate:
 * "Neraca Saldo" dan "Laba Rugi" terpisah; begitu pula NetSuite/Odoo), jadi
 * halaman ini diarahkan ke laporan kanoniknya: tautan lama tetap hidup tanpa
 * memelihara dua tampilan untuk data yang sama.
 */
export default async function LegacyFinanceReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermission("view_reports")
  const params = await searchParams

  redirect(params.report === "income-statement" ? "/laporan/laba-rugi" : "/laporan/neraca-saldo")
}
