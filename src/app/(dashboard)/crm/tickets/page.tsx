import { Plus } from "@/components/ui/fontawesome-icons";
export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { AppSearchField } from "@/components/ui/search-field"
import { TicketTable } from "./_components/ticket-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CrmTicketQueueCard } from "@/components/reports/crm-ticket-queue-card"
import { getCrmTicketQueue } from "@/lib/reports/crm-ticket-queue-data"
import { CrmTicketWorkloadCard } from "@/components/reports/crm-ticket-workload-card"
import { getCrmTicketWorkload } from "@/lib/reports/crm-ticket-workload-data"
import { CrmTicketSlaCard } from "@/components/reports/crm-ticket-sla-card"
import { getCrmTicketSla } from "@/lib/reports/crm-ticket-sla-data"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tiket Bantuan" }

export const CRM_TICKET_VALID_DB_STATUSES = [
  "open",
  "in_progress",
  "resolved",
  "closed",
] as const

export interface TicketsPageProps {
  statusParam?: string
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}

export async function renderTicketsPage({
  statusParam,
  searchParams,
}: TicketsPageProps) {
  await requirePermission("view_tickets")

  const params = await searchParams

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/crm/tickets/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  const validUrlStatuses = CRM_TICKET_VALID_DB_STATUSES.map(
    (s) => statusToIndo[s] || s,
  )

  if (statusParam && !validUrlStatuses.includes(statusParam)) {
    notFound()
  }

  const activeUrlStatus = statusParam ?? ""
  const dbStatus = activeUrlStatus ? indoToStatus[activeUrlStatus] || activeUrlStatus : undefined

  // Antrean kerja harian F-2026-10-25-032-S
  const [queueResult, workloadResult, slaResult] = await Promise.allSettled([
    getCrmTicketQueue(),
    getCrmTicketWorkload(),
    getCrmTicketSla(),
  ])
  const ticketQueue = queueResult.status === "fulfilled" ? queueResult.value : null
  if (queueResult.status === "rejected") console.error("[crm/tickets] antrean tiket:", queueResult.reason)
  const ticketWorkload = workloadResult.status === "fulfilled" ? workloadResult.value : null
  if (workloadResult.status === "rejected") console.error("[crm/tickets] beban tiket:", workloadResult.reason)
  const ticketSla = slaResult.status === "fulfilled" ? slaResult.value : null
  if (slaResult.status === "rejected") console.error("[crm/tickets] SLA tiket:", slaResult.reason)
  const slaByTicketId = ticketSla
    ? new Map(ticketSla.rows.map((row) => [row.ticketId, row.primaryState] as const))
    : undefined

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    deletedAt: null,
    ...(params.cari && {
      OR: [
        { subject: { contains: params.cari } },
        { customerName: { contains: params.cari } },
      ],
    }),
    ...(dbStatus && { status: dbStatus }),
  }

  const tickets = await prisma.crmTicket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.crmTicket.count({ where })

  const data = toPlain(tickets)

  const statusChips = ["", ...CRM_TICKET_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus ? `/crm/tickets/status/${urlStatus}` : "/crm/tickets"
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
    ? `/crm/tickets/status/${activeUrlStatus}`
    : "/crm/tickets"

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={
          activeUrlStatus
            ? [
                { label: "Dasbor", href: "/" },
                { label: "CRM", href: "/crm" },
                { label: "Tiket Bantuan", href: "/crm/tickets" },
                { label: statusLabel(dbStatus ?? activeUrlStatus) },
              ]
            : [
                { label: "Dasbor", href: "/" },
                { label: "CRM", href: "/crm" },
                { label: "Tiket Bantuan" },
              ]
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Layanan & Tiket Bantuan Pelanggan
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pusat penanganan keluhan, permintaan dukungan purnajual, kepatuhan target SLA, dan beban kerja agen bantuan.
          </p>
        </div>
        <CanCreate permission="create_tickets">
          <Link
            href="/crm/tickets/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-ticket-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Buat Tiket</span>
          </Link>
        </CanCreate>
      </div>

      <div className="flex flex-col gap-6">
        {ticketQueue ? <CrmTicketQueueCard queue={ticketQueue} /> : null}
        {ticketWorkload ? <CrmTicketWorkloadCard workload={ticketWorkload} /> : null}
        {ticketSla ? <CrmTicketSlaCard sla={ticketSla} /> : null}
      </div>

      <TicketTable
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        slaByTicketId={slaByTicketId}
        toolbar={<AppSearchField placeholder="Cari subjek atau pelanggan..." action={currentActionPath} />}
        filters={<div className="flex gap-1.5 flex-wrap">{statusChips}</div>}
      />
    </div>
  )
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  return renderTicketsPage({ searchParams })
}
