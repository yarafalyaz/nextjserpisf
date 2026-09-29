import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { EditForm } from "./form"

import type { Metadata } from "next"
import { requirePermission } from "@/lib/auth/permissions"

export const metadata: Metadata = { title: "Ubah Kategori Pengeluaran" }

export default async function EditExpenseCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("manage_expense_categories")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const category = await prisma.expenseCategory.findUnique({ where: { id: numId } })
  if (!category) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Master Data", href: "/master" },
          { label: "Kategori Pengeluaran", href: "/master/kategori-pengeluaran" },
          { label: category.label, href: `/master/kategori-pengeluaran/${category.id}` },
          { label: "Ubah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Kategori</h1>
      </div>
      <EditForm category={category} />
    </div>
  )
}
