export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { getWarrantyClaimDetail } from "@/actions/warranty.actions"
import { hasPermission } from "@/lib/auth/permissions"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { StatusChip } from "@/components/ui/status-chip"
import { formatDate, formatNumber } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"
import { WarrantyClaimActions, type WarrantyClaimFacts } from "../_components/warranty-claim-actions"

export const metadata: Metadata = { title: "Detail Klaim Garansi" }

/**
 * Detail klaim garansi (F-2026-10-21-021 tahap UI).
 *
 * Fakta tampil dari `getWarrantyClaimDetail` existing apa adanya:
 * `termsSnapshot` verbatim, fakta eligibility sebagai bahan penilai
 * (BUKAN keputusan otomatis — tidak ada simpulan layak/tidak di UI),
 * dan serialKey kosong ("") TIDAK PERNAH ditampilkan sebagai nomor
 * serial — status belum ada serial dinyatakan eksplisit. UI tidak
 * menghitung ulang eligibility; keputusan dan transisi lewat action
 * existing dengan gating izin terpisah (approve vs edit).
 */
export default async function WarrantyClaimDetailPage({
  params,
}: {
  params: Promise<{ claimId: string }>
}) {
  await requirePermission("view_warranty_claims")
  const { claimId } = await params
  const id = Number(claimId)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const detail = await getWarrantyClaimDetail(id)
  if (!detail.success || !detail.claim || !detail.eligibility) notFound()

  const claim = detail.claim
  const coverage = claim.coverage
  const serialNumber = coverage.serialNumber?.trim() ? coverage.serialNumber : null
  const [canDecide, canTransition] = await Promise.all([
    hasPermission("approve_warranty_claims"),
    hasPermission("edit_warranty_claims"),
  ])

  const facts: WarrantyClaimFacts = {
    id: claim.id,
    status: claim.status,
    complaint: claim.complaint,
    reportedAt: formatDate(claim.reportedAt),
    odometerKm: claim.odometerKm,
    coverageId: coverage.id,
    coverageStatus: coverage.status,
    coverageTermsSnapshot: coverage.termsSnapshot,
    serialLabel: serialNumber ?? "",
    serialIsPlaceholder: serialNumber === null,
    installedAt: formatDate(coverage.installedAt),
    expiresAt: formatDate(coverage.expiresAt),
    warrantyMonths: coverage.warrantyMonths,
    mileageLimitKm: coverage.mileageLimitKm,
    plateNumber: claim.customerVehicle.plateNumber,
    eligibility: {
      coverageStatus: detail.eligibility.coverageStatus,
      withinPeriod: detail.eligibility.withinPeriod,
      withinMileage: detail.eligibility.withinMileage,
      serialMatches: detail.eligibility.serialMatches,
      notes: detail.eligibility.notes,
    },
    decisionByName: null,
    decisionAt: claim.decisionAt ? formatDate(claim.decisionAt) : null,
    decisionNotes: claim.decisionNotes,
    resolutionType: claim.resolutionType,
    repairWorkOrderId: claim.repairWorkOrderId,
  }

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Klaim Garansi", href: "/produksi/garansi" },
          { label: `Klaim #${claim.id}` },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Detail Klaim Garansi #{claim.id}</h1>
        <Link
          href="/produksi/garansi"
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-surface-secondary hover:text-foreground"
        >
          ← Kembali
        </Link>
      </div>

      <section
        aria-label="Ringkasan klaim garansi"
        className="bg-surface rounded-xl border border-default shadow-sm p-6"
      >
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status Klaim</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <StatusChip status={claim.status} /> {statusLabel(claim.status)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tanggal Lapor</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(claim.reportedAt)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Plat Nomor</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">
              {claim.customerVehicle.plateNumber ?? "-"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Odometer Lapor</span>
            <span className="text-[0.9375rem] text-foreground font-medium tabular-nums">
              {claim.odometerKm === null ? "Tidak tercatat" : `${formatNumber(claim.odometerKm)} km`}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Terpasang</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(coverage.installedAt)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Berakhir</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(coverage.expiresAt)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Masa Garansi</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{coverage.warrantyMonths} bulan</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Batas Odometer Cakupan</span>
            <span className="text-[0.9375rem] text-foreground font-medium tabular-nums">
              {coverage.mileageLimitKm === null ? "Tanpa batas tercatat" : `${formatNumber(coverage.mileageLimitKm)} km`}
            </span>
          </div>
          <div className="flex flex-col gap-1 col-span-full">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Keluhan</span>
            <span className="whitespace-pre-wrap text-[0.9375rem] text-foreground">{claim.complaint}</span>
          </div>
        </div>
      </section>

      <WarrantyClaimActions claim={facts} canDecide={canDecide} canTransition={canTransition} />
    </div>
  )
}
