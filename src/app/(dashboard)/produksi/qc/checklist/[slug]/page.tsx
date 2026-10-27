export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { EmptyState } from "@/components/ui/empty-state"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Detail Checklist QC" }

const TYPE_LABELS: Record<string, string> = {
  incoming: "Penerimaan",
  in_process: "Proses",
  final: "Akhir",
  safety: "Keselamatan",
}

const METHOD_LABELS: Record<string, string> = {
  visual: "Visual",
  measure: "Ukur",
  torque: "Torsi",
  test: "Uji",
  functional: "Fungsional",
}

export default async function QcChecklistDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_qc")

  const { slug } = await params

  const checklist = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.qcChecklist.findFirst({
          where: { slug: s },
          include: {
            items: { orderBy: { sortOrder: "asc" } },
            product: { select: { id: true, name: true, slug: true } },
            _count: { select: { inspections: true } },
          },
        }),
      byId: (id) =>
        prisma.qcChecklist.findUnique({
          where: { id },
          include: {
            items: { orderBy: { sortOrder: "asc" } },
            product: { select: { id: true, name: true, slug: true } },
            _count: { select: { inspections: true } },
          },
        }),
    },
  )
  if (!checklist) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={checklist.name}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Pengendalian Mutu", href: "/produksi/qc" },
          { label: "Checklist", href: "/produksi/qc/checklist" },
          { label: "Detail" },
        ]}
        actions={
          <>
            {checklist.status === "draft" && (
              <CanCreate permission="manage_qc_checklists">
                <Button href={entityEditHref("/produksi/qc/checklist", checklist)} variant="primary">Ubah</Button>
              </CanCreate>
            )}
            <BackButton href="/produksi/qc/checklist" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Kode" value={checklist.code ?? "-"} mono />
        <DetailField label="Jenis" value={TYPE_LABELS[checklist.checklistType] ?? checklist.checklistType} />
        <DetailField label="Versi" value={`v${checklist.version}`} />
        <DetailField label="Status" value={<StatusChip status={checklist.status} />} />
        <DetailField
          label="Produk"
          value={
            checklist.product ? (
              <Link href={entityHref("/produksi/products", checklist.product)} className="hover:underline">
                {checklist.product.name}
              </Link>
            ) : (
              "Berlaku umum"
            )
          }
        />
        <DetailField label="Dipakai inspeksi" value={`${checklist._count.inspections}x`} />
        <DetailField label="Dirilis" value={checklist.releasedAt ? formatDate(checklist.releasedAt) : "-"} />
        <DetailField label="Dibuat" value={formatDate(checklist.createdAt)} />
      </DetailCard>

      <DetailSection title="Butir Checklist">
        {checklist.items.length === 0 ? (
          <EmptyState title="Tidak ada butir" />
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>#</DetailTableTh>
              <DetailTableTh>Butir</DetailTableTh>
              <DetailTableTh>Metode</DetailTableTh>
              <DetailTableTh>Spesifikasi</DetailTableTh>
              <DetailTableTh>Wajib</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {checklist.items.map((it, idx) => (
                <DetailTableRow key={it.id}>
                  <DetailTableTd>{idx + 1}</DetailTableTd>
                  <DetailTableTd>{it.itemName}</DetailTableTd>
                  <DetailTableTd>{METHOD_LABELS[it.method] ?? it.method}</DetailTableTd>
                  <DetailTableTd>{it.spec ?? "-"}</DetailTableTd>
                  <DetailTableTd>{it.isRequired ? "Ya" : "Tidak"}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
      </DetailSection>
    </div>
  )
}
