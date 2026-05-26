export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deletePettyCash } from "@/actions/finance.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"

export default async function PettyCashDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const pettyCash = await prisma.pettyCash.findUnique({
    where: { id: Number(id) },
  })

  if (!pettyCash) notFound()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Kas Kecil {pettyCash.documentNo}</h1>
<div className="flex gap-2">
          <Link href={`/finance/petty-cash/${pettyCash.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <DeleteButton id={pettyCash.id} action={deletePettyCash} />
                  <Link href="/finance/petty-cash" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">No. Dokumen</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{pettyCash.documentNo}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tipe</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{pettyCash.type}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Jumlah</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(pettyCash.amount))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(pettyCash.date)}</span>
          </div>
          {pettyCash.accountId && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Account ID</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{pettyCash.accountId}</span>
            </div>
          )}
          {pettyCash.description && (
            <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Deskripsi</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{pettyCash.description}</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(pettyCash.createdAt)}</span>
          </div>
        </div>
      </div>

      <TransactionAttachments referenceType="petty_cash" referenceId={pettyCash.id} />
    </div>
  )
}
