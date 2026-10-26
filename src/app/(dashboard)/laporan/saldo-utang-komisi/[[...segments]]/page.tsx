export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { SalesCommissionPayableCard } from "@/components/reports/sales-commission-payable-card"
import { requirePermission } from "@/lib/auth/permissions"
import { getSalesCommissionPayable } from "@/lib/reports/sales-commission-payable-data"

export const metadata: Metadata = { title: "Saldo Utang Komisi Penjualan" }

/**
 * F-2026-10-25-037-S §5 — Saldo Utang Komisi Penjualan (read-model terpisah
 * dari rekap informatif, BR-KOM37-12). Angka, baris rekonsiliasi, dan notice
 * tampil dari builder `buildSalesCommissionPayable` apa adanya; halaman
 * tidak menghitung ulang. Inti tahap 3 (subledger + jurnal 210212) belum
 * live → loader meneruskan `ledgerAvailable: false` dan saldo terbaca 0
 * berlabel jujur dari builder. Baca-saja; tanpa filter periode (saldo
 * kumulatif subledger, bukan potongan masa rekap).
 */
export default async function SalesCommissionPayablePage() {
  await requirePermission("view_reports")

  const report = await getSalesCommissionPayable()

  return (
    <ReportPageShell
      title="Saldo Utang Komisi Penjualan"
      sheetTitle="Saldo Utang Komisi Penjualan"
      periodLabel="Saldo kumulatif subledger komisi"
      periodCaption="Saldo kumulatif subledger komisi"
      wide
      actions={<ExportButtons title="Saldo_Utang_Komisi_Penjualan" />}
    >
      <SalesCommissionPayableCard report={report} />
    </ReportPageShell>
  )
}
