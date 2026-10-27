export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { getWarrantyClaimDetail } from "@/actions/warranty.actions"
import { hasPermission } from "@/lib/auth/permissions"
import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"
import { StatusChip } from "@/components/ui/status-chip"
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils/format"
import { statusLabel } from "@/lib/utils/status-labels"
import { WarrantyClaimActions, type WarrantyClaimFacts } from "../_components/warranty-claim-actions"
import {
  WarrantyJournalPanel,
  type WarrantyJournalFacts,
} from "../_components/warranty-journal-panel"
import {
  warrantyJournalRoutes,
  type WarrantyJournalRow,
} from "../_components/warranty-journal-route-status"
import {
  WarrantySupplierClaimPanel,
  type SupplierClaimFacts,
} from "../_components/warranty-supplier-claim-panel"

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

  const supplierActor = claim.supplierClaimBy
    ? await prisma.user.findUnique({
        where: { id: claim.supplierClaimBy },
        select: { name: true },
      })
    : null
  const supplierClaim: SupplierClaimFacts = {
    claimId: claim.id,
    claimStatus: claim.status,
    resolutionType: claim.resolutionType,
    supplierClaimStatus: claim.supplierClaimStatus,
    vendorName: claim.supplierClaimVendor?.name ?? null,
    purchaseReturnLabel: claim.purchaseReturn
      ? `${claim.purchaseReturn.documentNo} (status retur: ${statusLabel(claim.purchaseReturn.status)})`
      : null,
    supplierClaimRefNo: claim.supplierClaimRefNo,
    supplierClaimNotes: claim.supplierClaimNotes,
    supplierClaimByName: claim.supplierClaimBy
      ? (supplierActor?.name ?? `Pengguna #${claim.supplierClaimBy}`)
      : null,
    supplierClaimAt: claim.supplierClaimAt
      ? formatDate(claim.supplierClaimAt, { includeTime: true })
      : null,
    attachmentCount: 0,
  }
  supplierClaim.attachmentCount = await prisma.transactionAttachment.count({
    where: { referenceType: "WarrantyClaim", referenceId: claim.id },
  })

  // Status rute E2/E3 dibaca dari Journal nyata (POSTED non-REVERSED),
  // BUKAN flag klaim. Jurnal lawan (reversal) referenceType "Journal"
  // menunjuk id jurnal asli — ikut dibaca supaya riwayat reversal tampil.
  // TASK-019: klaim lain atas WO repair yang sama ikut dibaca — biaya WO
  // repair terjurnal satu kali lintas klaim, klaim kedua mereferensikan
  // jurnal klaim pertama (tampil sebagai sudah diposting di sini).
  const siblingClaimIds =
    claim.repairWorkOrderId != null
      ? (
          await prisma.warrantyClaim.findMany({
            where: { repairWorkOrderId: claim.repairWorkOrderId, id: { not: claim.id } },
            select: { id: true },
          })
        ).map((c) => c.id)
      : []
  const journalRowsRaw = await prisma.journal.findMany({
    where: {
      deletedAt: null,
      OR: [
        { referenceType: "WarrantyClaimCost", referenceId: claim.id },
        { referenceType: "WarrantySupplierRecovery", referenceId: claim.id },
        ...(siblingClaimIds.length > 0
          ? [
              { referenceType: "WarrantyClaimCost", referenceId: { in: siblingClaimIds } },
              { referenceType: "WarrantySupplierRecovery", referenceId: { in: siblingClaimIds } },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      journalNumber: true,
      transactionDate: true,
      status: true,
      totalDebit: true,
      referenceType: true,
      referenceId: true,
    },
  })
  const reversedIds = journalRowsRaw.filter((j) => j.status === "REVERSED").map((j) => j.id)
  const reversalRowsRaw =
    reversedIds.length > 0
      ? await prisma.journal.findMany({
          where: { referenceType: "Journal", referenceId: { in: reversedIds }, deletedAt: null },
          select: {
            id: true,
            journalNumber: true,
            transactionDate: true,
            status: true,
            totalDebit: true,
            referenceType: true,
            referenceId: true,
          },
        })
      : []
  const journalRows: WarrantyJournalRow[] = [...journalRowsRaw, ...reversalRowsRaw].map((j) => ({
    id: j.id,
    journalNumber: j.journalNumber,
    transactionDate: formatDate(j.transactionDate),
    status: j.status,
    totalDebitLabel: formatCurrency(Number(j.totalDebit)),
    referenceType: j.referenceType,
    referenceId: j.referenceId,
  }))
  const routes = warrantyJournalRoutes(journalRows)
  const journalFacts: WarrantyJournalFacts = {
    claimId: claim.id,
    status: claim.status,
    supplierClaimStatus: claim.supplierClaimStatus,
    decisionRecorded: claim.decisionBy !== null && claim.decisionAt !== null,
    repairWorkOrderId: claim.repairWorkOrderId,
    claimCost: routes.claimCost,
    supplierRecovery: routes.supplierRecovery,
  }
  const vendorOptions =
    claim.supplierClaimStatus === "none" && canTransition
      ? (
          await prisma.vendor.findMany({
            where: { isActive: true, deletedAt: null },
            orderBy: { name: "asc" },
            take: 200,
            select: { id: true, name: true },
          })
        ).map((v) => ({ value: String(v.id), label: v.name }))
      : []
  const purchaseReturnOptions =
    claim.supplierClaimStatus === "none" && canTransition
      ? (
          await prisma.purchaseReturn.findMany({
            where: { status: "draft" },
            orderBy: { date: "desc" },
            take: 200,
            select: { id: true, documentNo: true, purchaseOrder: { select: { vendor: { select: { name: true } } } } },
          })
        ).map((r) => ({
          value: String(r.id),
          label: `${r.documentNo} — ${r.purchaseOrder.vendor.name}`,
        }))
      : []

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

      <WarrantyJournalPanel facts={journalFacts} canPost={canDecide} />

      <WarrantySupplierClaimPanel
        facts={supplierClaim}
        vendorOptions={vendorOptions}
        purchaseReturnOptions={purchaseReturnOptions}
        canLink={canTransition}
        canApprove={canDecide}
      />

      <TransactionAttachments referenceType="WarrantyClaim" referenceId={claim.id} />
    </div>
  )
}
