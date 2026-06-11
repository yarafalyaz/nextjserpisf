export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from '@/components/ui/status-chip'
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteProductionOrder } from "@/actions/manufacturing.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Production Orders" }

export default async function ProductionOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const order = await prisma.productionOrder.findUnique({
    where: { id: Number(id) },
    include: {
      product: true,
      materials: true,
    },
  })

  if (!order) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Manufaktur", href: "/produksi" },
  { label: "Perintah Produksi", href: "/produksi/production-orders" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Perintah Produksi {order.documentNo}</h1>
        <div className="flex gap-2 items-center">
          <StatusChip status={order.status} />
  <div className="flex gap-2">
          <Link href={`/produksi/production-orders/${order.id}/ubah`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Ubah</Link>
          <DeleteButton id={order.id} action={deleteProductionOrder} />
                  <Link href="/produksi/production-orders" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">No. Dokumen</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{order.documentNo}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Produk</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{order.product.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Jml</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{Number(order.qty)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</span>
            <span className="text-[0.9375rem] text-foreground font-medium"><StatusChip status={order.status} /></span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(order.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Materials */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Material yang Dibutuhkan</h2>
        </div>
        <div className="p-4 px-5">
          {order.materials.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Tidak ada material</p>
          ) : (
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>ID Barang</DetailTableTh>
                <DetailTableTh align="right">Jml</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {order.materials.map((mat) => (
                  <DetailTableRow key={mat.id}>
                    <DetailTableTd>Item #{mat.itemId}</DetailTableTd>
                    <DetailTableTd align="right">{Number(mat.qty)}</DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          )}
        </div>
      </div>
    </div>
  )
}
