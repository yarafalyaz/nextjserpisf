export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { VendorForm } from "@/components/forms/vendor-form"
import { notFound } from "next/navigation"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Pemasok" }

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_vendors")
  const { slug } = await params

  const vendor = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) => prisma.vendor.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.vendor.findUnique({ where: { id, ...where } }),
    },
  )

  if (!vendor) notFound()

  const paymentTerms = await prisma.paymentTerm.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Data Master", href: "/master" },
  { label: "Pemasok", href: "/master/vendor" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Pemasok: {vendor.name}</h1>
      </div>
      <VendorForm vendor={vendor} paymentTerms={paymentTerms} />
    </div>
  )
}
