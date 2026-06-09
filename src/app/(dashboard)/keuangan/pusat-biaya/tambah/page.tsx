export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { CostCenterForm } from "@/components/forms/cost-center-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pusat Biaya" }

export default async function CreateCostCenterPage() {
  await requirePermission("create_cost_centers")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Keuangan", href: "/keuangan" },
  { label: "Pusat Biaya", href: "/keuangan/pusat-biaya" },
  { label: "Buat" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Pusat Biaya</h1>
      </div>
      <CostCenterForm />
    </div>
  )
}
