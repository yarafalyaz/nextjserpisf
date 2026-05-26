export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from '@/components/ui/status-chip'
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteProduct } from "@/actions/manufacturing.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

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
    },
  })

  if (!product) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Manufacturing", href: "/manufacturing" },
  { label: "Products", href: "/manufacturing/products" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">{product.name}</h1>
<div className="flex gap-2">
          <Link href={`/manufacturing/products/${product.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <DeleteButton id={product.id} action={deleteProduct} />
                  <Link href="/manufacturing/products" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">SKU</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{product.sku || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Nama</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{product.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(product.createdAt)}</span>
          </div>
          {product.description && (
            <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Deskripsi</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{product.description}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bill of Materials */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Bill of Materials</h2>
        </div>
        <div className="p-4 px-5">
          {product.materials.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada material</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>Item ID</th>
                  <th style={{ textAlign: "right" }}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {product.materials.map((mat) => (
                  <tr key={mat.id}>
                    <td>Item #{mat.itemId}</td>
                    <td className="text-right">{Number(mat.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Recent Production Orders */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Production Order Terbaru</h2>
        </div>
        <div className="p-4 px-5">
          {product.productionOrders.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada production order</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>No. Dokumen</th>
                  <th style={{ textAlign: "right" }}>Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {product.productionOrders.map((po) => (
                  <tr key={po.id}>
                    <td className="font-mono"><Link href={`/manufacturing/production-orders/${po.id}`}>{po.documentNo}</Link></td>
                    <td className="text-right">{Number(po.qty)}</td>
                    <td><StatusChip status={po.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
