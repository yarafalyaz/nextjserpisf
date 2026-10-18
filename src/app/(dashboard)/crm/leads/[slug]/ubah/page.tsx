export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { notFound } from "next/navigation"
import { LeadForm } from "@/components/forms/lead-form"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { resolveEntity } from "@/lib/utils/resolve-entity"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Ubah Prospek" }

export default async function EditLeadPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("edit_leads")

  const { slug } = await params
  const lead = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) => prisma.lead.findFirst({ where: { slug: s, ...where } }),
      byId: (id, where) => prisma.lead.findUnique({ where: { id, ...where } }),
    },
  )

  if (!lead) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "CRM", href: "/crm" },
  { label: "Prospek", href: "/crm/leads" },
  { label: "Ubah" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Ubah Prospek: {lead.name}</h1>
      </div>
      <LeadForm lead={{
        ...lead,
        estimatedValue: lead.estimatedValue ? Number(lead.estimatedValue) : null,
        expectedCloseDate: lead.expectedCloseDate ? lead.expectedCloseDate.toISOString() : null,
      }} />
    </div>
  )
}
