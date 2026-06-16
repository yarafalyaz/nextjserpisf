export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { notFound } from "next/navigation"
import { formatDate } from "@/lib/utils/format"
import { Pencil } from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Merek Kendaraan" }

export default async function BrandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_brands")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const brand = await prisma.brand.findUnique({
    where: { id: numId },
    include: {
      items: { take: 20, orderBy: { createdAt: "desc" }, select: { id: true, sku: true, name: true } },
    },
  })

  if (!brand) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Master Data", href: "/master" },
        { label: "Merek", href: "/master/merek" },
        { label: "Detail" },
      ]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">{brand.name}</h1>
        <div className="flex gap-2">
          <Link href={`/master/merek/${id}/ubah`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all"><Pencil size={14} className="inline" /> Ubah</Link>
          <Link href="/master/merek" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nama Merek</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{brand.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Jumlah Item</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{brand.items.length}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(brand.createdAt)}</span>
          </div>
        </div>
      </div>

      {brand.items.length > 0 && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Item dengan Merek ini</h2>
          </div>
          <div className="p-4 px-5">
            <DetailTable>
              <DetailTableHead>
                <DetailTableTh>SKU</DetailTableTh>
                <DetailTableTh>Nama Item</DetailTableTh>
              </DetailTableHead>
              <DetailTableBody>
                {brand.items.map((item) => (
                  <DetailTableRow key={item.id}>
                    <DetailTableTd className="font-mono">{item.sku}</DetailTableTd>
                    <DetailTableTd><Link href={`/master/barang/${item.id}`} className="text-primary hover:underline">{item.name}</Link></DetailTableTd>
                  </DetailTableRow>
                ))}
              </DetailTableBody>
            </DetailTable>
          </div>
        </div>
      )}
    </div>
  )
}
