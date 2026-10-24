export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { getSupplierClaimAging } from "@/lib/reports/supplier-claim-aging-data"
import { SUPPLIER_CLAIM_AGING_TITLE } from "@/lib/reports/supplier-claim-aging"
import { SupplierClaimAgingCard } from "@/components/reports/supplier-claim-aging-card"

export const metadata: Metadata = { title: SUPPLIER_CLAIM_AGING_TITLE }

/**
 * F-2026-10-24-095-S BR-SUPP-11: daftar aging klaim supplier terbuka
 * baca-saja. Gerbang `view_reports` (pola laporan garansi-segera-berakhir);
 * loader tidak pernah memilih telepon pelanggan dan tidak memutasi apa
 * pun. Umur/ember/label status ditempel apa adanya dari builder server —
 * UI tidak menghitung ulang.
 */
export default async function SupplierClaimAgingReportPage() {
  await requirePermission("view_reports")
  const aging = await getSupplierClaimAging()

  return (
    <ReportPageShell title={SUPPLIER_CLAIM_AGING_TITLE} sheet={false}>
      <SupplierClaimAgingCard aging={aging} />
    </ReportPageShell>
  )
}
