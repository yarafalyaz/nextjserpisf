export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { PageHeader } from "@/components/ui/page-header"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { QcInspectionResultsTable, QcInspectionNcrTable } from "./_components/qc-inspection-tables"

import type { Metadata } from "next"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref } from "@/lib/utils/entity-url"

export const metadata: Metadata = { title: "Detail Inspeksi QC" }

export default async function QcInspectionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_qc")

  const { slug } = await params

  const inspection = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.qcInspection.findFirst({
          where: { slug: s },
          include: {
            checklist: { select: { id: true, name: true, checklistType: true, slug: true } },
            results: {
              include: { checklistItem: { select: { itemName: true, spec: true } } },
              orderBy: { id: "asc" },
            },
            nonconformances: { select: { id: true, documentNo: true, status: true, severity: true, slug: true } },
          },
        }),
      byId: (id) =>
        prisma.qcInspection.findUnique({
          where: { id },
          include: {
            checklist: { select: { id: true, name: true, checklistType: true, slug: true } },
            results: {
              include: { checklistItem: { select: { itemName: true, spec: true } } },
              orderBy: { id: "asc" },
            },
            nonconformances: { select: { id: true, documentNo: true, status: true, severity: true, slug: true } },
          },
        }),
    },
  )
  if (!inspection) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={inspection.documentNo}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Pengendalian Mutu", href: "/produksi/qc" },
          { label: "Inspeksi", href: "/produksi/qc/inspeksi" },
          { label: "Detail" },
        ]}
      />

      <DetailCard>
        <DetailField
          label="Checklist"
          value={
            <Link href={entityHref("/produksi/qc/checklist", inspection.checklist)} className="hover:underline">
              {inspection.checklist.name}
            </Link>
          }
        />
        <DetailField label="Status" value={<StatusChip status={inspection.status} />} />
        <DetailField
          label="Jenis"
          value={
            (
              {
                incoming: "Penerimaan",
                in_process: "Proses",
                final: "Akhir",
                safety: "Keselamatan",
                vehicle_intake: "Inspeksi Masuk Kendaraan",
                vehicle_handover: "Serah Terima Kendaraan",
              } as Record<string, string>
            )[inspection.inspectionType] ?? inspection.inspectionType
          }
        />
        <DetailField label="Referensi" value={`${inspection.referenceType} #${inspection.referenceId}`} />
        <DetailField label="Diinspeksi" value={inspection.inspectedAt ? formatDate(inspection.inspectedAt) : "-"} />
        {inspection.notes && <DetailField label="Catatan" value={inspection.notes} colSpan="full" />}
      </DetailCard>

      <DetailSection title="Hasil Pemeriksaan">
        <QcInspectionResultsTable
          data={inspection.results.map((r) => ({
            id: r.id,
            itemName: r.checklistItem.itemName,
            spec: r.checklistItem.spec,
            result: r.result,
            measuredValue: r.measuredValue,
            notes: r.notes,
          }))}
        />
      </DetailSection>

      {inspection.nonconformances.length > 0 && (
        <DetailSection title="Ketidaksesuaian Terkait">
          <QcInspectionNcrTable
            data={inspection.nonconformances.map((n) => ({
              id: n.id,
              slug: n.slug,
              documentNo: n.documentNo,
              status: n.status,
              severity: n.severity,
            }))}
          />
        </DetailSection>
      )}
    </div>
  )
}
