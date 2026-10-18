export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { CostCenterForm } from "@/components/forms/cost-center-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pusat Biaya" }

export default async function CreateCostCenterPage() {
  await requirePermission("create_cost_centers")

  const costCenters = await prisma.costCenter.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { name: "asc" },
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Keuangan", href: "/keuangan" },
  { label: "Pusat Biaya", href: "/keuangan/pusat-biaya" },
  { label: "Buat" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Buat Pusat Biaya</h1>
      </div>
      <CostCenterForm costCenters={costCenters} />
    </div>
  )
}
