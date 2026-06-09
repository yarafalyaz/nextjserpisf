export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { BudgetForm } from "@/components/forms/budget-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Anggaran" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.budget.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const budget = {
    id: data.id,
    name: data.name,
    year: data.startDate.getFullYear(),
    totalAmount: Number(data.amount),
    amount: Number(data.amount),
    accountId: data.accountId,
    costCenterId: data.costCenterId,
    startDate: data.startDate.toISOString().split("T")[0],
    endDate: data.endDate.toISOString().split("T")[0],
  }

  const [accounts, costCenters] = await Promise.all([prisma.account.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }), prisma.costCenter.findMany({ orderBy: { name: "asc" }, select: { id: true, code: true, name: true } })])

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Keuangan", href: "/keuangan/anggaran" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <BudgetForm budget={budget} accounts={accounts} costCenters={costCenters}/>
    </div>
  )
}
