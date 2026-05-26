export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from '@/components/ui/status-chip'
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteExpense } from "@/actions/finance.actions"
import { PrintButton } from "@/components/ui/print-button"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { TransactionAttachments } from "@/components/ui/transaction-attachments"

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const expense = await prisma.expense.findUnique({
    where: { id: Number(id) },
  })

  if (!expense) notFound()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pengeluaran {expense.documentNo}</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <StatusChip status={expense.status} />
  <div className="flex gap-2">
          <Link href={`/finance/expenses/${expense.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <PrintButton />
          <DeleteButton id={expense.id} action={deleteExpense} />
                  <Link href="/finance/expenses" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">No. Dokumen</span>
            <span className="text-[0.9375rem] text-foreground font-medium font-mono">{expense.documentNo}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Tanggal</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(expense.date)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Jumlah</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatCurrency(Number(expense.amount))}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Kategori</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{expense.category || "-"}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Status</span>
            <span className="text-[0.9375rem] text-foreground font-medium"><StatusChip status={expense.status} /></span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Account ID</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{expense.accountId}</span>
          </div>
          {expense.paidFromAccountId && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibayar dari Account ID</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{expense.paidFromAccountId}</span>
            </div>
          )}
          {expense.employeeId && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Employee ID</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{expense.employeeId}</span>
            </div>
          )}
          {expense.description && (
            <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Deskripsi</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{expense.description}</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(expense.createdAt)}</span>
          </div>
        </div>
      </div>
      <TransactionAttachments referenceType="expense" referenceId={expense.id} />
    </div>
  )
}
