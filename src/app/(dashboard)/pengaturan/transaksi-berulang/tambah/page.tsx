export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { RecurringTransactionForm } from "@/components/forms/recurring-transaction-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Transaksi Berulang" }

export default async function CreateRecurringTransactionPage() {
  await requirePermission("manage_recurring_transactions")

  const [accounts, categories] = await Promise.all([
    prisma.account.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, label: true } }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Transaksi Berulang", href: "/pengaturan/transaksi-berulang" },
        { label: "Tambah" },
      ]} />
      <h1 className="text-2xl font-bold text-foreground">Tambah Jadwal Transaksi Berulang</h1>
      <RecurringTransactionForm
        accounts={accounts.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))}
        expenseCategories={categories.map((c) => ({ id: c.id, label: c.label }))}
      />
    </div>
  )
}
