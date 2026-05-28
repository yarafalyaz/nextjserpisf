export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteTax } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function TaxDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const tax = await prisma.tax.findUnique({
    where: { id: Number(id) },
  })

  if (!tax) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Taxes", href: "/master/taxes" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">{tax.name}</h1>
        <div className="flex gap-2">
          <Link href={`/master/taxes/${id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all"><Pencil size={14} className="inline" /> Edit</Link>
          <DeleteButton id={tax.id} action={deleteTax} />
          <Link href="/master/taxes" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Nama Pajak</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{tax.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tarif</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{Number(tax.rate)}%</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Status</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <span className={`status-badge status-${tax.isActive ? "active" : "inactive"}`}>
                {tax.isActive ? "Aktif" : "Nonaktif"}
              </span>
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(tax.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
