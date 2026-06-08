export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { LeadForm } from "@/components/forms/lead-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function EditLeadPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("edit_leads")

  const { id } = await params
  const lead = await prisma.lead.findUnique({ where: { id: Number(id) } })

  if (!lead) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "CRM", href: "/crm" },
  { label: "Leads", href: "/crm/leads" },
  { label: "Ubah" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Ubah Lead: {lead.name}</h1>
      </div>
      <LeadForm lead={{
        ...lead,
        estimatedValue: lead.estimatedValue ? Number(lead.estimatedValue) : null,
        expectedCloseDate: lead.expectedCloseDate ? lead.expectedCloseDate.toISOString() : null,
      }} />
    </div>
  )
}
