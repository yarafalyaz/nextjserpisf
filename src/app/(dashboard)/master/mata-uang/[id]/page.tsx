export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteCurrency } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Mata Uang" }

export default async function CurrencyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const currency = await prisma.currency.findUnique({
    where: { id: Number(id) },
  })

  if (!currency) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Mata Uang", href: "/master/mata-uang" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">{currency.name}</h1>
        <div className="flex gap-2">
          <Link href={`/master/mata-uang/${id}/ubah`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all"><Pencil size={14} className="inline" /> Ubah</Link>
          <DeleteButton id={currency.id} action={deleteCurrency} />
          <Link href="/master/mata-uang" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nama Mata Uang</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{currency.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kode</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{currency.code}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kurs</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{Number(currency.rate)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <StatusChip status={currency.isActive ? "active" : "inactive"} />
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(currency.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
