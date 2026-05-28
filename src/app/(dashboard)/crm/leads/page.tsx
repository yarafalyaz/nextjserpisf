export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { statusLabel } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { requirePermission } from "@/lib/auth/permissions"
import { LeadTable } from "./_components/lead-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cari?: string }>
}) {
  await requirePermission("view_leads")

  const params = await searchParams

  const where = {
    ...(params.cari && {
      OR: [
        { name: { contains: params.cari } },
        { email: { contains: params.cari } },
        { company: { contains: params.cari } },
      ],
    }),
    ...(params.status && { status: params.status }),
  }

  const leads = await prisma.lead.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })

  const data = JSON.parse(JSON.stringify(leads))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "CRM", href: "/crm" },
  { label: "Leads" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Prospek</h1>
        <Link href="/crm/leads/create" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-lead-btn">
          + Tambah Lead
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari nama, email, atau perusahaan..." action="/crm/leads" />
          <div className="flex gap-1.5 flex-wrap">
            {["", "new", "contacted", "qualified", "proposal", "won", "lost"].map((s) => (
              <Link key={s} href={`/crm/leads?status=${s}`} className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}>
                {s ? statusLabel(s) : "Semua"}
              </Link>
            ))}
          </div>
        </div>

        <LeadTable data={data} />
      </div>
    </div>
  )
}
