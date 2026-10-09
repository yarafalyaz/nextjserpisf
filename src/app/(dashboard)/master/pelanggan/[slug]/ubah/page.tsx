export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { CustomerForm } from "@/components/forms/customer-form"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Pelanggan" }

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_customers")
  const { slug } = await params

  const customer = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) => prisma.customer.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.customer.findUnique({ where: { id, ...where } }),
    },
  )

  if (!customer) notFound()

  const categories = await prisma.customerCategory.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Pelanggan", href: "/master/pelanggan" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Pelanggan: {customer.name}</h1>
      </div>
      <CustomerForm
        customer={{
          ...customer,
          customerCategoryId: customer.customerCategoryId,
        }}
        categories={categories}
      />
    </div>
  )
}
