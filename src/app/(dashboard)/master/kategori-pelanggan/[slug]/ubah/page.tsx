export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { CustomerCategoryForm } from "@/components/forms/customer-category-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Ubah Kategori Pelanggan" }

export default async function EditCustomerCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_customers")

  const { slug } = await params
  const category = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) => prisma.customerCategory.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.customerCategory.findUnique({ where: { id, ...where } }),
    },
  )

  if (!category) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Data Master", href: "/master" },
          { label: "Kategori Pelanggan", href: "/master/kategori-pelanggan" },
          { label: "Ubah" },
        ]}
      />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Kategori: {category.name}</h1>
      </div>
      <CustomerCategoryForm
        category={{
          id: category.id,
          name: category.name,
          downPaymentPercent: Number(category.downPaymentPercent),
        }}
      />
    </div>
  )
}
