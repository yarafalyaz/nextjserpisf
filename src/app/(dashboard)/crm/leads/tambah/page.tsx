export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { LeadForm } from "@/components/forms/lead-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tambah Prospek" }

export default async function CreateLeadPage() {
  await requirePermission("create_leads")

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "CRM", href: "/crm" },
  { label: "Prospek", href: "/crm/leads" },
  { label: "Tambah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tambah Prospek</h1>
      </div>
      <LeadForm />
    </div>
  )
}
