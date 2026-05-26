export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from '@/components/ui/status-chip'
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteAssetCategory } from "@/actions/asset.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function AssetCategoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const category = await prisma.assetCategory.findUnique({
    where: { id: Number(id) },
    include: {
      assets: { take: 10, orderBy: { createdAt: "desc" } },
    },
  })

  if (!category) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Assets", href: "/assets" },
  { label: "Categories", href: "/assets/categories" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Kategori Aset: {category.name}</h1>
<div className="flex gap-2">
          <Link href={`/assets/categories/${category.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <DeleteButton id={category.id} action={deleteAssetCategory} />
                  <Link href="/assets/categories" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Nama</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{category.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tingkat Depresiasi</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{category.depreciationRate ? `${Number(category.depreciationRate)}%` : "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Umur Manfaat (tahun)</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{category.usefulLife || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(category.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Assets in this category */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Aset dalam Kategori Ini</h2>
        </div>
        <div className="p-4 px-5">
          {category.assets.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada aset</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Nama</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {category.assets.map((asset) => (
                  <tr key={asset.id}>
                    <td className="font-mono"><Link href={`/assets/${asset.id}`}>{asset.code}</Link></td>
                    <td>{asset.name}</td>
                    <td><StatusChip status={asset.status} /></td>
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
