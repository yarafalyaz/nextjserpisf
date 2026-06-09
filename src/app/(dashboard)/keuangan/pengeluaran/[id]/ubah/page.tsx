export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { ExpenseForm } from "@/components/forms/expense-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Pengeluaran" }

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const data = await prisma.expense.findUnique({
    where: { id: Number(id) },
  })

  if (!data) notFound()

  const accounts = await prisma.account.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, type: true } })

  const projects = await prisma.project.findMany({
    where: { status: "active" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, documentNo: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Keuangan", href: "/keuangan/pengeluaran" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah</h1>
      </div>
      <ExpenseForm expense={{ id: data.id, date: data.date.toISOString().split('T')[0], description: data.description, amount: Number(data.amount), accountId: data.accountId, costCenterId: data.costCenterId, projectId: data.projectId, referenceNo: data.referenceNo, receiptImage: data.receiptImage }} accounts={accounts} projects={projects} />
    </div>
  )
}
