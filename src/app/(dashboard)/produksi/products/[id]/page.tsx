export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from '@/components/ui/status-chip'
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteProduct } from "@/actions/manufacturing.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Products" }

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_production")

  const { id } = await params

  const product = await prisma.product.findUnique({
    where: { id: Number(id) },
    include: {
      materials: true,
      productionOrders: { take: 5, orderBy: { createdAt: "desc" } },
      vehicleBrand: true,
      vehicleModel: true,
    },
  })

  if (!product) notFound()

  const materialItems = await prisma.item.findMany({
    where: { id: { in: product.materials.map((m) => m.itemId) } },
    select: { id: true, sku: true, name: true, unitOfMeasure: true },
  })
  const itemMap = new Map(materialItems.map((it) => [it.id, it]))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={product.name}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Manufaktur", href: "/produksi" },
          { label: "Produk", href: "/produksi/products" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/produksi/products/${product.id}/ubah`} variant="primary">Ubah</Button>
            <DeleteButton id={product.id} action={deleteProduct} />
            <BackButton href="/produksi/products" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="Kode Produk" value={product.code || "-"} mono />
        <DetailField label="Nama" value={product.name} />
        <DetailField label="Merek Kendaraan" value={product.vehicleBrand?.name || "-"} />
        <DetailField label="Model Kendaraan" value={product.vehicleModel?.name || "-"} />
        <DetailField label="Dibuat" value={formatDate(product.createdAt)} />
        {product.description && (
          <DetailField label="Deskripsi" value={product.description} colSpan="full" />
        )}
      </DetailCard>

      {/* Bill of Materials */}
      <DetailSection title="Bill of Materials">
        {product.materials.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Tidak ada material</p>
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Barang</DetailTableTh>
              <DetailTableTh align="right">Jml</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {product.materials.map((mat) => {
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

      {/* Recent Production Orders */}
      <DetailSection title="Perintah Produksi Terbaru">
        {product.productionOrders.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Belum ada perintah produksi</p>
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>No. Dokumen</DetailTableTh>
              <DetailTableTh align="right">Jml</DetailTableTh>
              <DetailTableTh>Status</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {product.productionOrders.map((po) => (
                <DetailTableRow key={po.id}>
                  <DetailTableTd className="font-mono"><Link href={`/produksi/production-orders/${po.id}`}>{po.documentNo}</Link></DetailTableTd>
                  <DetailTableTd align="right">{Number(po.qty)}</DetailTableTd>
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
