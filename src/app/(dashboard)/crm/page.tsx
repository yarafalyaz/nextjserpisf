import { Target, Ticket } from "lucide-react"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { ModuleGrid, type ModuleItem } from "@/components/ui/module-grid"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "CRM" }

const crmModules: ModuleItem[] = [
  { label: "Leads", href: "/crm/leads", icon: Target, desc: "Prospek pelanggan" },
  { label: "Tiket", href: "/crm/tickets", icon: Ticket, desc: "Tiket support" },
]

export default function CrmPage() {
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
      />
    </div>
  )
}
