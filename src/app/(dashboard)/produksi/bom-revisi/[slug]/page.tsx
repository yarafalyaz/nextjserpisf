export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { requirePermission } from "@/lib/auth/permissions"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { EmptyState } from "@/components/ui/empty-state"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Detail Revisi BOM" }

export default async function BomRevisionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_bom_revisions")

  const { slug } = await params

  const revision = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) =>
        prisma.bomRevision.findFirst({
          where: { slug: s },
          include: {
            materials: true,
            product: { select: { id: true, name: true, slug: true } },
            productionOrders: { select: { id: true, documentNo: true, status: true, slug: true }, take: 10, orderBy: { createdAt: "desc" } },
          },
        }),
      byId: (id) =>
        prisma.bomRevision.findUnique({
          where: { id },
          include: {
            materials: true,
            product: { select: { id: true, name: true, slug: true } },
            productionOrders: { select: { id: true, documentNo: true, status: true, slug: true }, take: 10, orderBy: { createdAt: "desc" } },
          },
        }),
    },
  )
  if (!revision) notFound()

  const materialItems = await prisma.item.findMany({
    where: { id: { in: revision.materials.map((m) => m.itemId) } },
    select: { id: true, slug: true, sku: true, name: true, unitOfMeasure: true },
  })
  const itemMap = new Map(materialItems.map((it) => [it.id, it]))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Revisi BOM #${revision.revisionNo}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Revisi BOM", href: "/produksi/bom-revisi" },
          { label: "Detail" },
        ]}
        actions={
          <>
            {revision.status === "draft" && (
              <CanCreate permission="manage_bom_revisions">
                <Button href={entityEditHref("/produksi/bom-revisi", revision)} variant="primary">Ubah</Button>
              </CanCreate>
            )}
            {revision.status === "rejected" && (
              <CanCreate permission="manage_bom_revisions">
                <Button href={entityEditHref("/produksi/bom-revisi", revision)} variant="primary">Ubah & Ajukan Ulang</Button>
              </CanCreate>
            )}
            <BackButton href="/produksi/bom-revisi" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Produk" value={
          <Link href={entityHref("/produksi/products", revision.product)} className="hover:underline">
            {revision.product.name}
          </Link>
        } />
        <DetailField label="Nomor Revisi" value={`Rev ${revision.revisionNo}`} mono />
        <DetailField label="Status" value={<StatusChip status={revision.status} />} />
        <DetailField label="Tanggal Berlaku" value={formatDate(revision.effectiveDate)} />
        <DetailField label="Dirilis" value={revision.releasedAt ? formatDate(revision.releasedAt) : "-"} />
        <DetailField label="Diajukan" value={revision.submittedAt ? formatDate(revision.submittedAt) : "-"} />
        <DetailField label="Disetujui" value={revision.approvedAt ? formatDate(revision.approvedAt) : "-"} />
        {revision.status === "rejected" && revision.rejectionReason && (
          <DetailField label="Alasan Penolakan" value={revision.rejectionReason} colSpan="full" />
        )}
        <DetailField label="Dibuat" value={formatDate(revision.createdAt)} />
        {revision.notes && <DetailField label="Catatan" value={revision.notes} colSpan="full" />}
      </DetailCard>

      <DetailSection title="Bahan (BOM Revisi)">
        {revision.materials.length === 0 ? (
          <EmptyState title="Tidak ada bahan" />
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Barang</DetailTableTh>
              <DetailTableTh align="right">Jml</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {revision.materials.map((mat) => {
                const it = itemMap.get(mat.itemId)
                return (
                  <DetailTableRow key={mat.id}>
                    <DetailTableTd>
                      {it ? (
                        <Link href={entityHref("/master/barang", it)} className="hover:underline">
                          <span className="font-mono text-muted-foreground">{it.sku}</span> — {it.name}
                        </Link>
                      ) : (
                        `Barang #${mat.itemId}`
                      )}
                    </DetailTableTd>
                    <DetailTableTd align="right">{Number(mat.qty)} {it?.unitOfMeasure ?? ""}</DetailTableTd>
                  </DetailTableRow>
                )
              })}
            </DetailTableBody>
          </DetailTable>
        )}
      </DetailSection>

      <DetailSection title="Perintah Produksi yang Memakai Revisi Ini">
        {revision.productionOrders.length === 0 ? (
          <EmptyState title="Belum ada" />
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>No. Dokumen</DetailTableTh>
              <DetailTableTh>Status</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {revision.productionOrders.map((po) => (
                <DetailTableRow key={po.id}>
                  <DetailTableTd className="font-mono">
                    <Link href={entityHref("/produksi/production-orders", po)}>{po.documentNo}</Link>
                  </DetailTableTd>
                  <DetailTableTd><StatusChip status={po.status} /></DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
      </DetailSection>
    </div>
  )
}
