export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { statusLabel } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ExpenseTable } from "./_components/expense-table"

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; status?: string }>
}) {
  await requirePermission("view_expenses")

  const params = await searchParams

  const where = {
    ...(params.status && { status: params.status }),
  }

  const expenses = await prisma.expense.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })

  const data = JSON.parse(JSON.stringify(expenses))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Expenses</h1>
<Link href="/keuangan/pengeluaran/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-expense-btn">
          + Buat Expense
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari expense..." action="/keuangan/pengeluaran" />
          <div className="flex gap-1.5 flex-wrap">
            {["", "draft", "pending", "approved", "rejected"].map((s) => (
              <Link key={s} href={`/keuangan/pengeluaran?status=${s}`} className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}>
                {s ? statusLabel(s) : "Semua"}
              </Link>
            ))}
          </div>
        </div>

        <ExpenseTable data={data} />
      </div>
    </div>
  )
}
