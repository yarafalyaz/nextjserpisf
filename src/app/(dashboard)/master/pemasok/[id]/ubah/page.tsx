export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { VendorForm } from "@/components/forms/vendor-form"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_vendors")
  const { id } = await params

  const vendor = await prisma.vendor.findUnique({
    where: { id: Number(id), deletedAt: null },
  })

  if (!vendor) notFound()

  const paymentTerms = await prisma.paymentTerm.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Master Data", href: "/master" },
  { label: "Vendors", href: "/master/vendors" },
  { label: "Edit" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Edit Vendor: {vendor.name}</h1>
      </div>
      <VendorForm vendor={vendor} paymentTerms={paymentTerms} />
    </div>
  )
}
