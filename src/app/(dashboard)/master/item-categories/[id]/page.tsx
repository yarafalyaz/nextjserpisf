export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteItemCategory } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function ItemCategoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const category = await prisma.itemCategory.findUnique({
    where: { id: Number(id) },
    include: {
      parent: true,
      children: true,
      items: { take: 10, orderBy: { name: "asc" } },
    },
  })

  if (!category) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Item Categories", href: "/master/item-categories" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">{category.name}</h1>
        <div style={{ display: "flex", gap: "8px" }}>
          <Link href={`/master/item-categories/${id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all"><Pencil size={14} className="inline" /> Edit</Link>
          <DeleteButton id={category.id} action={deleteItemCategory} />
          <Link href="/master/item-categories" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Nama Kategori</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{category.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Kategori Induk</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              {category.parent ? (
                <Link href={`/master/item-categories/${category.parent.id}`}>{category.parent.name}</Link>
              ) : "-"}
            </span>
          </div>
          <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Deskripsi</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{category.description || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(category.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Sub-categories */}
      {category.children.length > 0 && (
        <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 px-5 border-b border-default">
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Sub-Kategori</h2>
          </div>
          <div className="p-4 px-5">
            <table className="w-full border-collapse">
              <thead>
                <tr><th>Nama</th><th>Deskripsi</th></tr>
              </thead>
              <tbody>
                {category.children.map((child) => (
                  <tr key={child.id}>
                    <td><Link href={`/master/item-categories/${child.id}`}>{child.name}</Link></td>
                    <td>{child.description || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Item</h2>
        </div>
        <div className="p-4 px-5">
          {category.items.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada item</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr><th>SKU</th><th>Nama</th><th>Satuan</th></tr>
              </thead>
              <tbody>
                {category.items.map((item) => (
                  <tr key={item.id}>
                    <td className="font-mono"><Link href={`/master/items/${item.id}`}>{item.sku}</Link></td>
                    <td>{item.name}</td>
                    <td>{item.unitOfMeasure}</td>
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
