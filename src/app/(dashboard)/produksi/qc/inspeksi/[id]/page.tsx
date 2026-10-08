export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Detail Inspeksi QC" }

const RESULT_LABELS: Record<string, string> = {
  pass: "Lulus",
  fail: "Gagal",
  na: "N/A",
}

export default async function QcInspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_qc")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const inspection = await prisma.qcInspection.findUnique({
    where: { id: numId },
    include: {
      checklist: { select: { id: true, name: true, checklistType: true } },
      results: {
        include: { checklistItem: { select: { itemName: true, spec: true } } },
        orderBy: { id: "asc" },
      },
      nonconformances: { select: { id: true, documentNo: true, status: true, severity: true } },
    },
  })
  if (!inspection) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={inspection.documentNo}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Quality Control", href: "/produksi/qc" },
          { label: "Inspeksi", href: "/produksi/qc/inspeksi" },
          { label: "Detail" },
        ]}
        actions={<BackButton href="/produksi/qc/inspeksi" />}
      />

      <DetailCard>
        <DetailField
          label="Checklist"
          value={
            <Link href={`/produksi/qc/checklist/${inspection.checklist.id}`} className="hover:underline">
              {inspection.checklist.name}
            </Link>
          }
        />
        <DetailField label="Status" value={<StatusChip status={inspection.status} />} />
        <DetailField label="Referensi" value={`${inspection.referenceType} #${inspection.referenceId}`} />
        <DetailField label="Diinspeksi" value={inspection.inspectedAt ? formatDate(inspection.inspectedAt) : "-"} />
        {inspection.notes && <DetailField label="Catatan" value={inspection.notes} colSpan="full" />}
      </DetailCard>

      <DetailSection title="Hasil Pemeriksaan">
        <DetailTable>
          <DetailTableHead>
            <DetailTableTh>Item</DetailTableTh>
            <DetailTableTh>Spesifikasi</DetailTableTh>
            <DetailTableTh>Hasil</DetailTableTh>
            <DetailTableTh>Nilai Ukur</DetailTableTh>
            <DetailTableTh>Catatan</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {inspection.results.map((r) => (
              <DetailTableRow key={r.id}>
                <DetailTableTd>{r.checklistItem.itemName}</DetailTableTd>
                <DetailTableTd>{r.checklistItem.spec ?? "-"}</DetailTableTd>
                <DetailTableTd>
                  <span
                    className={
                      r.result === "fail"
                        ? "text-danger-600 font-medium"
                        : r.result === "pass"
                          ? "text-success-600 font-medium"
                          : "text-muted-foreground"
                    }
                  >
                    {RESULT_LABELS[r.result] ?? r.result}
                  </span>
                </DetailTableTd>
                <DetailTableTd>{r.measuredValue ?? "-"}</DetailTableTd>
                <DetailTableTd>{r.notes ?? "-"}</DetailTableTd>
              </DetailTableRow>
            ))}
          </DetailTableBody>
        </DetailTable>
      </DetailSection>

      {inspection.nonconformances.length > 0 && (
        <DetailSection title="Nonconformance Terkait">
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>No. NCR</DetailTableTh>
              <DetailTableTh>Status</DetailTableTh>
              <DetailTableTh>Severity</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {inspection.nonconformances.map((n) => (
                <DetailTableRow key={n.id}>
                  <DetailTableTd className="font-mono">
                    <Link href={`/produksi/qc/ncr/${n.id}`}>{n.documentNo}</Link>
                  </DetailTableTd>
                  <DetailTableTd><StatusChip status={n.status} /></DetailTableTd>
                  <DetailTableTd>{n.severity}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </DetailSection>
      )}
    </div>
  )
}
