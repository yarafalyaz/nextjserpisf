import { requirePermission } from "@/lib/auth/permissions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ProfitCenterForm } from "@/components/forms/profit-center-form"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Pusat Laba" }

export default async function CreateProfitCenterPage() {
  await requirePermission("create_profit_centers")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Pusat Laba", href: "/keuangan/pusat-laba" },
          { label: "Tambah" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Pusat Laba</h1>
      </div>
      <ProfitCenterForm />
    </div>
  )
}
