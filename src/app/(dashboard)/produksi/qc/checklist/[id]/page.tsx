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
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

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
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_qc")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const checklist = await prisma.qcChecklist.findUnique({
    where: { id: numId },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      product: { select: { id: true, name: true } },
      _count: { select: { inspections: true } },
    },
  })
  if (!checklist) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={checklist.name}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Quality Control", href: "/produksi/qc" },
          { label: "Checklist", href: "/produksi/qc/checklist" },
          { label: "Detail" },
        ]}
        actions={
          <>
            {checklist.status === "draft" && (
              <Button href={`/produksi/qc/checklist/${checklist.id}/ubah`} variant="primary">Ubah</Button>
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
              <Link href={`/produksi/products/${checklist.product.id}`} className="hover:underline">
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

      <DetailSection title="Item Checklist">
        {checklist.items.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Tidak ada item</p>
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>#</DetailTableTh>
              <DetailTableTh>Item</DetailTableTh>
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
