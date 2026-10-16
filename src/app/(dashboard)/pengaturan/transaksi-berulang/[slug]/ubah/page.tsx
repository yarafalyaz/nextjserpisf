export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { isNumericId } from "@/lib/utils/entity-url"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { RecurringTransactionForm } from "@/components/forms/recurring-transaction-form"
import { parseRecurringTemplate } from "@/lib/services/recurring.service"
import { toLocalDateOnly } from "@/lib/utils/date-only"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Transaksi Berulang" }

export default async function EditRecurringTransactionPage({ params }: { params: Promise<{ slug: string }> }) {
  await requirePermission("manage_recurring_transactions")

  const { slug } = await params
  const [schedule, accounts, categories] = await Promise.all([
    isNumericId(slug)
      ? prisma.recurringTransaction.findUnique({ where: { id: Number(slug) } })
      : prisma.recurringTransaction.findFirst({ where: { slug } }),
    prisma.account.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, label: true } }),
  ])

  if (!schedule) notFound()

  const template = parseRecurringTemplate(schedule.template)
  const debitLine = template.lines?.find((line) => line.debit > 0)
  const creditLine = template.lines?.find((line) => line.credit > 0)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Pengaturan", href: "/pengaturan" },
        { label: "Transaksi Berulang", href: "/pengaturan/transaksi-berulang" },
        { label: schedule.name },
      ]} />
      <h1 className="text-2xl font-bold text-foreground">Ubah Jadwal Transaksi Berulang</h1>
      <RecurringTransactionForm
        accounts={accounts.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))}
        expenseCategories={categories.map((c) => ({ id: c.id, label: c.label }))}
        schedule={{
          id: schedule.id,
          name: schedule.name,
          type: schedule.type,
          frequency: schedule.frequency,
          interval: schedule.interval,
          startDate: toLocalDateOnly(schedule.startDate),
          endDate: schedule.endDate ? toLocalDateOnly(schedule.endDate) : null,
          description: template.description ?? "",
          amount: Number(debitLine?.debit ?? template.amount ?? 0),
          debitAccountId: debitLine?.accountId ?? null,
          creditAccountId: creditLine?.accountId ?? null,
          accountId: template.accountId ?? null,
          paidFromAccountId: template.paidFromAccountId ?? null,
          categoryId: template.categoryId ?? null,
          isActive: schedule.isActive,
        }}
      />
    </div>
  )
}
