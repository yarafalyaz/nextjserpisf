export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { ExpenseForm } from "@/components/forms/expense-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pengeluaran" }

export default async function CreateExpensePage() {
  await requirePermission("create_expenses")

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, type: true },
  })

  const projects = await prisma.project.findMany({
    where: { status: "active" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, documentNo: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Pengeluaran</h1>
      </div>
      <ExpenseForm accounts={accounts} projects={projects} />
    </div>
  )
}
