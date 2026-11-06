export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { prisma } from "@/lib/db/prisma"
import { loadPostableAccounts } from "@/lib/finance/postable-accounts"
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
  const [schedule, categories] = await Promise.all([
    // deleteRecurringTransaction menghapus lunak (`deletedAt` + `isActive:false`),
    // jadi jadwal yang sudah dihapus tidak boleh tetap terbuka lewat tautan
    // lama/bookmark dan bisa diedit (pola resolveEntity di halaman detail lain).
    isNumericId(slug)
      ? prisma.recurringTransaction.findUnique({ where: { id: Number(slug), deletedAt: null } })
      : prisma.recurringTransaction.findFirst({ where: { slug, deletedAt: null } }),
    prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, label: true } }),
  ])

  if (!schedule) notFound()

  const template = parseRecurringTemplate(schedule.template)

  // Akun tersimpan tetap tampil walau kini induk/terhapus (lihat
  // postable-accounts): template adalah dokumen tersimpan, bukan formulir baru.
  const accounts = await loadPostableAccounts({
    includeIds: [
      template.accountId,
      template.paidFromAccountId,
      template.lines?.find((line) => line.debit > 0)?.accountId,
      template.lines?.find((line) => line.credit > 0)?.accountId,
    ],
  })
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
