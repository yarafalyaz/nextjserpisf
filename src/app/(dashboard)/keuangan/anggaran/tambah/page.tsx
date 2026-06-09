export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { BudgetForm } from "@/components/forms/budget-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Anggaran" }

export default async function CreateBudgetPage() {
  await requirePermission("create_budgets")

  const [accounts, costCenters] = await Promise.all([
    prisma.account.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    prisma.costCenter.findMany({
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Keuangan", href: "/keuangan" },
  { label: "Anggaran", href: "/keuangan/anggaran" },
  { label: "Buat" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Anggaran</h1>
      </div>
      <BudgetForm accounts={accounts} costCenters={costCenters} />
    </div>
  )
}
