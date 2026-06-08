export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { CustomerForm } from "@/components/forms/customer-form"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_customers")
  const { id } = await params
  const customerId = Number(id)

  if (!Number.isInteger(customerId) || customerId <= 0) notFound()

  const customer = await prisma.customer.findUnique({
    where: { id: customerId, deletedAt: null },
  })

  if (!customer) notFound()

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
      <CustomerForm customer={{ ...customer, creditLimit: customer.creditLimit != null ? Number(customer.creditLimit) : 0 }} />
    </div>
  )
}
