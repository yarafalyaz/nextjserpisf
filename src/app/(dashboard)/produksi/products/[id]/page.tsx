export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from '@/components/ui/status-chip'
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteProduct } from "@/actions/manufacturing.actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField, DetailSection } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { FitmentChecker } from "./_components/fitment-checker"
import { RecalculateStandardCostButton } from "./_components/recalculate-standard-cost-button"

export const metadata: Metadata = { title: "Detail Produk (BOM)" }

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_production")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const product = await prisma.product.findUnique({
    where: { id: numId },
    include: {
      materials: true,
      bomRevisions: { orderBy: { revisionNo: "desc" }, take: 10 },
      productionOrders: { take: 5, orderBy: { createdAt: "desc" } },
      vehicleBrand: true,
      vehicleModel: true,
      inventoryItem: { select: { id: true, sku: true, name: true } },
    },
  })

  if (!product) notFound()

  const materialItems = await prisma.item.findMany({
    where: { id: { in: product.materials.map((m) => m.itemId) } },
    select: { id: true, sku: true, name: true, unitOfMeasure: true },
  })
  const itemMap = new Map(materialItems.map((it) => [it.id, it]))

  // VEH-07 fitment checker (only when the user may view fitment rules).
  const canViewFitment = await hasPermission("view_vehicle_fitments")
  const [fitmentBrands, fitmentModels, fitmentVariants] = canViewFitment
    ? await Promise.all([
        prisma.vehicleBrand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
        prisma.vehicleModel.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, vehicleBrandId: true } }),
        prisma.vehicleVariant.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, vehicleModelId: true } }),
      ])
    : [[], [], []]

  const itemNameMap: Record<number, string> = {}
  for (const [id, it] of itemMap) itemNameMap[id] = `${it.sku} — ${it.name}`

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
            <RecalculateStandardCostButton productId={product.id} />
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
        <DetailField
          label="Item Persediaan Hasil Produksi"
          value={product.inventoryItem ? `${product.inventoryItem.sku} — ${product.inventoryItem.name}` : "Belum dihubungkan"}
        />
        <DetailField label="Dibuat" value={formatDate(product.createdAt)} />
        {product.description && (
          <DetailField label="Deskripsi" value={product.description} colSpan="full" />
        )}
      </DetailCard>

      {/* Rincian Bahan Baku (BOM) */}
      <DetailSection title="Rincian Bahan Baku (BOM)">
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

      {/* VEH-07 fitment check */}
      {canViewFitment && (
        <FitmentChecker
          productId={product.id}
          itemNameMap={itemNameMap}
          brands={fitmentBrands}
          models={fitmentModels}
          variants={fitmentVariants}
        />
      )}

      {/* BOM Revisions */}
      <DetailSection title="Revisi BOM">
        {product.bomRevisions.length === 0 ? (
          <p className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            Belum ada revisi. Revisi membekukan BOM saat ini agar order produksi yang dirilis tidak berubah bila BOM master disunting.
          </p>
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Revisi</DetailTableTh>
              <DetailTableTh>Status</DetailTableTh>
              <DetailTableTh>Berlaku</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {product.bomRevisions.map((rev) => (
                <DetailTableRow key={rev.id}>
                  <DetailTableTd className="font-mono">
                    <Link href={`/produksi/bom-revisi/${rev.id}`}>Rev {rev.revisionNo}</Link>
                  </DetailTableTd>
                  <DetailTableTd><StatusChip status={rev.status} /></DetailTableTd>
                  <DetailTableTd>{formatDate(rev.effectiveDate)}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
      </DetailSection>

      {/* Recent Production Orders */}
      <DetailSection title="Perintah Produksi Terbaru">        {product.productionOrders.length === 0 ? (
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
