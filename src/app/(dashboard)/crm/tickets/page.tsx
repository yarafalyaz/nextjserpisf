export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { requirePermission } from "@/lib/auth/permissions"
import { AppSearchField } from "@/components/ui/search-field"
import { TicketTable } from "./_components/ticket-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tickets" }

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cari?: string }>
}) {
  await requirePermission("view_tickets")

  const params = await searchParams
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    ...(params.cari && {
      OR: [
        { subject: { contains: params.cari } },
        { customerName: { contains: params.cari } },
      ],
    }),
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
  }

  const tickets = await prisma.crmTicket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 1000,
  })

  const data = JSON.parse(JSON.stringify(tickets))

  const statusChips = ["", "open", "in_progress", "resolved", "closed"].map((dbStatus) => {
    const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
    return (
      <Link
        key={dbStatus}
        href={`/crm/tickets${urlStatus ? `?status=${urlStatus}` : ""}`}
        className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
      >
        {dbStatus ? statusLabel(dbStatus) : "Semua"}
      </Link>
    )
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "CRM", href: "/crm" },
  { label: "Tiket" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tiket Dukungan</h1>
        <Link href="/crm/tickets/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-ticket-btn">
          + Buat Tiket
        </Link>
      </div>

      <TicketTable
        data={data}
        toolbar={<AppSearchField placeholder="Cari subjek atau pelanggan..." action="/crm/tickets" />}
        filters={<div className="flex flex-wrap gap-1.5">{statusChips}</div>}
      />
    </div>
  )
}
