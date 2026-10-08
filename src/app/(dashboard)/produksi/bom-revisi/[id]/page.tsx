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
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Detail Revisi BOM" }

export default async function BomRevisionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_bom_revisions")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const revision = await prisma.bomRevision.findUnique({
    where: { id: numId },
    include: {
      materials: true,
      product: { select: { id: true, name: true } },
      productionOrders: { select: { id: true, documentNo: true, status: true }, take: 10, orderBy: { createdAt: "desc" } },
    },
  })
  if (!revision) notFound()

  const materialItems = await prisma.item.findMany({
    where: { id: { in: revision.materials.map((m) => m.itemId) } },
    select: { id: true, sku: true, name: true, unitOfMeasure: true },
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
              <Button href={`/produksi/bom-revisi/${revision.id}/ubah`} variant="primary">Ubah</Button>
            )}
            <BackButton href="/produksi/bom-revisi" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Produk" value={
          <Link href={`/produksi/products/${revision.product.id}`} className="hover:underline">
            {revision.product.name}
          </Link>
        } />
        <DetailField label="Nomor Revisi" value={`Rev ${revision.revisionNo}`} mono />
        <DetailField label="Status" value={<StatusChip status={revision.status} />} />
        <DetailField label="Tanggal Berlaku" value={formatDate(revision.effectiveDate)} />
        <DetailField label="Dirilis" value={revision.releasedAt ? formatDate(revision.releasedAt) : "-"} />
        <DetailField label="Dibuat" value={formatDate(revision.createdAt)} />
        {revision.notes && <DetailField label="Catatan" value={revision.notes} colSpan="full" />}
      </DetailCard>

      <DetailSection title="Material (BOM Revisi)">
        {revision.materials.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Tidak ada material</p>
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
                        <Link href={`/master/barang/${it.id}`} className="hover:underline">
                          <span className="font-mono text-muted-foreground">{it.sku}</span> — {it.name}
                        </Link>
                      ) : (
                        `Item #${mat.itemId}`
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
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Belum ada</p>
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
                    <Link href={`/produksi/production-orders/${po.id}`}>{po.documentNo}</Link>
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
