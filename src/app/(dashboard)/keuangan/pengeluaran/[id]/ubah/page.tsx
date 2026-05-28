export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { ExpenseForm } from "@/components/forms/expense-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

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

  const accounts = await prisma.account.findMany({ where: { isActive: true }, orderBy: { code: "asc" } })

  const projects = await prisma.project.findMany({
    where: { status: "active" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, documentNo: true },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "finance", href: "/keuangan/pengeluaran" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit</h1>
      </div>
      <ExpenseForm expense={data as any} accounts={accounts as any} projects={projects} />
    </div>
  )
}
