export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteRack } from "@/actions/inventory.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function RackDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const rack = await prisma.rack.findUnique({
    where: { id: Number(id) },
    include: {
      warehouse: true,
      rows: true,
    },
  })

  if (!rack) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Inventory", href: "/inventory" },
  { label: "Racks", href: "/inventory/racks" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Rak {rack.name}</h1>
<div className="flex gap-2">
          <Link href={`/inventory/racks/${rack.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <DeleteButton id={rack.id} action={deleteRack} />
                  <Link href="/inventory/racks" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Kode</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{rack.code}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Nama</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{rack.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Gudang</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{rack.warehouse.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(rack.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Rows */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Baris Rak</h2>
        </div>
        <div className="p-4 px-5">
          {rack.rows.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada baris</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Dibuat</th>
                </tr>
              </thead>
              <tbody>
                {rack.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{formatDate(row.createdAt)}</td>
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
