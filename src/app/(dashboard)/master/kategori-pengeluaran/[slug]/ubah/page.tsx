import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { EditForm } from "./form"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref } from "@/lib/utils/entity-url"

import type { Metadata } from "next"
import { requirePermission } from "@/lib/auth/permissions"

export const metadata: Metadata = { title: "Ubah Kategori Pengeluaran" }

export default async function EditExpenseCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("manage_expense_categories")

  const { slug } = await params

  const category = await resolveEntity(
    { segment: slug },
    {
      bySlug: (s) => prisma.expenseCategory.findFirst({ where: { slug: s } }),
      byId: (id) => prisma.expenseCategory.findUnique({ where: { id } }),
    },
  )
  if (!category) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Kategori Pengeluaran", href: "/master/kategori-pengeluaran" },
          { label: category.label, href: entityHref("/master/kategori-pengeluaran", category) },
          { label: "Ubah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Kategori</h1>
      </div>
      <EditForm category={category} />
    </div>
  )
}
