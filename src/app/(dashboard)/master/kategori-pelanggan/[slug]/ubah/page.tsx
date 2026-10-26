export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { notFound } from "next/navigation"
import { CustomerCategoryForm } from "@/components/forms/customer-category-form"
import { CustomerCommissionRates } from "../../_components/customer-commission-rates"
import { getCustomerCommissionRates } from "@/actions/master.actions"
import { hasPermission } from "@/lib/auth/permissions"
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

  // F-2026-10-25-036-S: histori tarif komisi kategori ini (loader server
  // read-only; izin existing kategori — view di page ini, tambah
  // create_customers, ubah/hapus edit_customers; tanpa izin baru).
  const [commissionRates, canCreateCommissionRate, canEditCommissionRate] =
    await Promise.all([
      getCustomerCommissionRates(category.id),
      hasPermission("create_customers"),
      hasPermission("edit_customers"),
    ])

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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Kategori: {category.name}</h1>
      </div>
      <CustomerCategoryForm
        category={{
          id: category.id,
          name: category.name,
          downPaymentPercent: Number(category.downPaymentPercent),
        }}
      />
      <CustomerCommissionRates
        customerCategoryId={category.id}
        rates={commissionRates.map((rate) => ({
          id: rate.id,
          commissionPercent: rate.commissionPercent,
          effectiveFrom: rate.effectiveFrom.toISOString(),
          effectiveTo: rate.effectiveTo ? rate.effectiveTo.toISOString() : null,
        }))}
        canCreate={canCreateCommissionRate}
        canEdit={canEditCommissionRate}
      />
    </div>
  )
}
