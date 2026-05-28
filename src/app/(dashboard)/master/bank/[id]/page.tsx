export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteBank } from "@/actions/master.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function BankDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const bank = await prisma.bank.findUnique({
    where: { id: Number(id) },
  })

  if (!bank) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Banks", href: "/master/banks" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">{bank.name}</h1>
        <div className="flex gap-2">
          <Link href={`/master/banks/${id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all"><Pencil size={14} className="inline" /> Edit</Link>
          <DeleteButton id={bank.id} action={deleteBank} />
          <Link href="/master/banks" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Nama Bank</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{bank.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Kode</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{bank.code}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Status</span>
            <span className="text-[0.9375rem] text-foreground font-medium">
              <StatusChip status={bank.isActive ? "active" : "inactive"} />
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(bank.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
