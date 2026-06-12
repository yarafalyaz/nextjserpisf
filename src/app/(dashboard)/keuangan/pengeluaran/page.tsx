export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { ExpenseTable } from "./_components/expense-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pengeluaran" }

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string; halaman?: string }>
}) {
  await requirePermission("view_expenses")

  const params = await searchParams
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined
  const page = Number(params.halaman) || 1
  const perPage = 100

  const where = {
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
  }

  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.expense.count({ where }),
  ])

  const totalPages = Math.ceil(total / perPage)
  const data = toPlain(expenses)

  const statusChips = ["", "draft", "pending", "approved", "rejected"].map((dbStatus) => {
    const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
    return (
      <Link
        key={dbStatus}
        href={`/keuangan/pengeluaran${urlStatus ? `?status=${urlStatus}` : ""}`}
        className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
      >
        {dbStatus ? statusLabel(dbStatus) : "Semua"}
      </Link>
    )
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Pengeluaran</h1>
<Link href="/keuangan/pengeluaran/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-expense-btn">
          + Buat Pengeluaran
        </Link>
      </div>

      <ExpenseTable
        data={data}
        toolbar={<AppSearchField placeholder="Cari pengeluaran..." action="/keuangan/pengeluaran" />}
        filters={<div className="flex flex-wrap gap-1.5">{statusChips}</div>}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 px-5 border-t border-default">
          <span className="text-[0.8125rem] text-muted-foreground">Hal {page} dari {totalPages} ({total} data)</span>
          <div className="flex gap-1">
            {page > 1 && <Link href={`/keuangan/pengeluaran?halaman=${page - 1}`} className="button button--ghost button--sm">← Sebelumnya</Link>}
            {page < totalPages && <Link href={`/keuangan/pengeluaran?halaman=${page + 1}`} className="button button--ghost button--sm">Berikutnya →</Link>}
          </div>
        </div>
      )}
    </div>
  )
}
