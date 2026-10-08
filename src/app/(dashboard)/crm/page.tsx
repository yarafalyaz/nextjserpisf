import { Target, Ticket } from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid, type ModuleItem } from "@/components/ui/module-grid"
import { requireAnyPermission } from "@/lib/auth/permissions"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "CRM" }

const crmModules: ModuleItem[] = [
  { label: "Prospek (Leads)", href: "/crm/leads", icon: Target, desc: "Kelola prospek pelanggan", permission: "view_leads" },
  { label: "Tiket", href: "/crm/tickets", icon: Ticket, desc: "Tiket bantuan pelanggan", permission: "view_tickets" },
]

const CRM_PERMISSIONS = [
  "view_leads",
  "view_tickets",
]

export default async function CrmPage() {
  const user = await requireAnyPermission(CRM_PERMISSIONS)
  const isSuperAdmin = user.roles.includes("super_admin")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "CRM" }]} />
      <h1 id="crm-heading" className="text-2xl font-bold text-foreground">
        CRM
      </h1>
      <ModuleGrid
        ariaLabel="Modul CRM"
        headingId="crm-heading"
        items={crmModules}
        userPermissions={user.permissions}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  )
}
