export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { NonconformanceResolveForm } from "../_components/nonconformance-resolve-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Detail NCR" }

const SEVERITY_LABELS: Record<string, string> = {
  minor: "Ringan",
  major: "Berat",
  critical: "Kritis",
}

export default async function NonconformanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await requirePermission("view_qc")
  const isSuperAdmin = user.roles.includes("super_admin")
  const canManage = isSuperAdmin || user.permissions.includes("manage_nonconformances")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const ncr = await prisma.nonconformance.findUnique({
    where: { id: numId },
    include: {
      inspection: { select: { id: true, documentNo: true } },
    },
  })
  if (!ncr) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={ncr.documentNo}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Quality Control", href: "/produksi/qc" },
          { label: "NCR", href: "/produksi/qc/ncr" },
          { label: "Detail" },
        ]}
        actions={<BackButton href="/produksi/qc/ncr" />}
      />

      <DetailCard>
        <DetailField label="Status" value={<StatusChip status={ncr.status} />} />
        <DetailField label="Severity" value={SEVERITY_LABELS[ncr.severity] ?? ncr.severity} />
        <DetailField label="Penanggung" value={ncr.responsibility} />
        <DetailField label="Referensi" value={`${ncr.referenceType} #${ncr.referenceId}`} />
        <DetailField
          label="Inspeksi"
          value={
            ncr.inspection ? (
              <Link href={`/produksi/qc/inspeksi/${ncr.inspection.id}`} className="hover:underline font-mono">
                {ncr.inspection.documentNo}
              </Link>
            ) : (
              "-"
            )
          }
        />
        <DetailField label="Dibuat" value={formatDate(ncr.createdAt)} />
        <DetailField label="Jam Rework" value={String(Number(ncr.reworkHours))} />
        <DetailField label="Biaya Rework" value={String(Number(ncr.reworkCost))} />
        <DetailField label="Deskripsi Cacat" value={ncr.defectDescription} colSpan="full" />
        {ncr.cause && <DetailField label="Penyebab" value={ncr.cause} colSpan="full" />}
        {ncr.resolution && <DetailField label="Resolusi" value={ncr.resolution} colSpan="full" />}
        {ncr.closedAt && <DetailField label="Ditutup" value={formatDate(ncr.closedAt)} />}
      </DetailCard>

      <DetailSection title="Tindakan">
        <NonconformanceResolveForm
          ncrId={ncr.id}
          currentStatus={ncr.status}
          canManage={canManage}
          reworkHours={Number(ncr.reworkHours)}
          reworkCost={Number(ncr.reworkCost)}
          resolution={ncr.resolution ?? ""}
        />
      </DetailSection>
    </div>
  )
}
