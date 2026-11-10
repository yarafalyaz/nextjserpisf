export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { requirePermission } from "@/lib/auth/permissions"
import { LeadTable } from "./_components/lead-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { getStaleLeads } from "@/lib/reports/stale-leads-data"
import { StaleLeadsCard } from "@/components/reports/stale-leads-card"
import { getLeadFollowups } from "@/lib/reports/lead-followups-data"
import { LeadFollowupsCard } from "@/components/reports/lead-followups-card"
import { getLeadFunnel } from "@/lib/reports/lead-funnel-data"
import { LeadFunnelCard } from "@/components/reports/lead-funnel-card"

import type { Metadata } from "next"
import { CanCreate } from "@/components/auth/can-create"

export const metadata: Metadata = { title: "Prospek" }

export const LEAD_VALID_DB_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "won",
  "lost",
] as const

export interface LeadsPageProps {
  statusParam?: string
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}

export async function renderLeadsPage({
  statusParam,
  searchParams,
}: LeadsPageProps) {
  await requirePermission("view_leads")

  const params = await searchParams

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/crm/leads/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  const validUrlStatuses = LEAD_VALID_DB_STATUSES.map(
    (s) => statusToIndo[s] || s,
  )

  if (statusParam && !validUrlStatuses.includes(statusParam)) {
    notFound()
  }

  const activeUrlStatus = statusParam ?? ""
  const dbStatus = activeUrlStatus ? indoToStatus[activeUrlStatus] || activeUrlStatus : undefined

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    deletedAt: null,
    ...(params.cari && {
      OR: [
        { name: { contains: params.cari } },
        { email: { contains: params.cari } },
        { company: { contains: params.cari } },
      ],
    }),
    ...(dbStatus && { status: dbStatus }),
  }

  // Independen semua: paralel, bukan 3 loader full-table serial.
  const [leads, total, staleLeads, leadFollowups, leadFunnel] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip: (page - 1) * pageSize,
    }),
    prisma.lead.count({ where }),
    getStaleLeads(),
    getLeadFollowups(),
    getLeadFunnel("leads_page"),
  ])

  const data = toPlain(leads)

  const statusChips = ["", ...LEAD_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus ? `/crm/leads/status/${urlStatus}` : "/crm/leads"
    const isActive = activeUrlStatus === urlStatus

    return (
      <Link
        key={dbStatusKey}
        href={withListParams(targetPath, params, { halaman: undefined })}
        className={`filter-chip ${isActive ? "active" : ""}`}
      >
        {dbStatusKey ? statusLabel(dbStatusKey) : "Semua"}
      </Link>
    )
  })

  const currentActionPath = activeUrlStatus
    ? `/crm/leads/status/${activeUrlStatus}`
    : "/crm/leads"

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={
          activeUrlStatus
            ? [
                { label: "Dasbor", href: "/" },
                { label: "CRM", href: "/crm" },
                { label: "Prospek", href: "/crm/leads" },
                { label: statusLabel(dbStatus ?? activeUrlStatus) },
              ]
            : [
                { label: "Dasbor", href: "/" },
                { label: "CRM", href: "/crm" },
                { label: "Prospek" },
              ]
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Prospek</h1>
        <CanCreate permission="create_leads">
          <Link
            href="/crm/leads/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            id="create-lead-btn"
          >
            + Tambah Prospek
          </Link>
        </CanCreate>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <StaleLeadsCard stale={staleLeads} />
        <LeadFollowupsCard followups={leadFollowups} />
        <LeadFunnelCard funnel={leadFunnel} />
      </div>

      <LeadTable
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={<AppSearchField placeholder="Cari prospek..." action={currentActionPath} />}
        filters={<div className="flex gap-1.5 flex-wrap">{statusChips}</div>}
      />
    </div>
  )
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  return renderLeadsPage({ searchParams })
}
