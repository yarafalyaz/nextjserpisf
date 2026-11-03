export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { loadPostableAccounts } from "@/lib/finance/postable-accounts"
import { requirePermission } from "@/lib/auth/permissions"
import { ExpenseForm } from "@/components/forms/expense-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pengeluaran" }

export default async function CreateExpensePage() {
  await requirePermission("create_expenses")

  const [accounts, projects, categories, vendors] = await Promise.all([
    loadPostableAccounts(),
    prisma.project.findMany({
      where: { status: "active" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, documentNo: true },
    }),
    prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, label: true },
    }),
    prisma.vendor.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Pengeluaran</h1>
      </div>
      <ExpenseForm accounts={accounts} categories={categories} projects={projects} vendors={vendors} />
    </div>
  )
}
