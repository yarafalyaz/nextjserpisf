export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { CostCenterForm } from "@/components/forms/cost-center-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateCostCenterPage() {
  await requirePermission("create_cost_centers")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "Finance", href: "/finance" },
  { label: "Cost Centers", href: "/finance/cost-centers" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Buat Cost Center</h1>
      </div>
      <CostCenterForm />
    </div>
  )
}
