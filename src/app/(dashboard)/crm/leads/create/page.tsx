export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { LeadForm } from "@/components/forms/lead-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CreateLeadPage() {
  await requirePermission("create_leads")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "CRM", href: "/crm" },
  { label: "Leads", href: "/crm/leads" },
  { label: "Create" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tambah Lead</h1>
      </div>
      <LeadForm />
    </div>
  )
}
