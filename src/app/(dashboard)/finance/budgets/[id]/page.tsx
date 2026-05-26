export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteBudget } from "@/actions/finance.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function BudgetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const budget = await prisma.budget.findUnique({
    where: { id: Number(id) },
  })

  if (!budget) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Finance", href: "/finance" },
  { label: "Budgets", href: "/finance/budgets" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Anggaran: {budget.name}</h1>
<div className="flex gap-2">
          <Link href={`/finance/budgets/${budget.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <DeleteButton id={budget.id} action={deleteBudget} />
                  <Link href="/finance/budgets" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Nama</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{budget.name}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Jumlah Anggaran</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(budget.amount))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Account ID</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{budget.accountId}</span>
          </div>
          {budget.costCenterId && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Cost Center ID</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{budget.costCenterId}</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal Mulai</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(budget.startDate)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal Selesai</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(budget.endDate)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(budget.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
