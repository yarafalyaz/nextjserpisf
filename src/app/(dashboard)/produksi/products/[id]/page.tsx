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

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={product.name}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Manufacturing", href: "/produksi" },
          { label: "Products", href: "/produksi/products" },
          { label: "Detail" },
        ]}
        actions={
          <>
            <Button href={`/produksi/products/${product.id}/edit`} variant="primary">Ubah</Button>
            <DeleteButton id={product.id} action={deleteProduct} />
            <BackButton href="/produksi/products" />
          </>
        }
      />

      <DetailCard>
        <DetailField label="SKU" value={product.sku || "-"} mono />
        <DetailField label="Kode Produk" value={product.code || "-"} mono />
        <DetailField label="Nama" value={product.name} />
        <DetailField label="Vehicle Brand" value={product.vehicleBrand?.name || "-"} />
        <DetailField label="Vehicle Model" value={product.vehicleModel?.name || "-"} />
        <DetailField label="Dibuat" value={formatDate(product.createdAt)} />
        {product.description && (
          <DetailField label="Deskripsi" value={product.description} colSpan="full" />
        )}
      </DetailCard>

      {/* Bill of Materials */}
      <DetailSection title="Bill of Materials">
        {product.materials.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada material</p>
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Item ID</DetailTableTh>
              <DetailTableTh align="right">Qty</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {product.materials.map((mat) => (
                <DetailTableRow key={mat.id}>
                  <DetailTableTd>Item #{mat.itemId}</DetailTableTd>
                  <DetailTableTd align="right">{Number(mat.qty)}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
      </DetailSection>

      {/* Recent Production Orders */}
      <DetailSection title="Production Order Terbaru">
        {product.productionOrders.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada production order</p>
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>No. Dokumen</DetailTableTh>
              <DetailTableTh align="right">Qty</DetailTableTh>
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
