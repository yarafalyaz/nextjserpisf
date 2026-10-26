export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { requirePermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { AppSearchField } from "@/components/ui/search-field"
import { TicketTable } from "./_components/ticket-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CrmTicketQueueCard } from "@/components/reports/crm-ticket-queue-card"
import { getCrmTicketQueue } from "@/lib/reports/crm-ticket-queue-data"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Tiket Bantuan" }

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cari?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_tickets")

  const params = await searchParams

  // Antrean kerja harian F-2026-10-25-032-S: himpunan GLOBAL tiket
  // non-terminal dari loader read-only (gerbang view_tickets ditegakkan
  // di loader juga), ditampilkan verbatim di atas daftar inventaris.
  // Kegagalan loader menyembunyikan kartu saja (BR-CTQ-11) — daftar
  // tiket existing tetap dapat dipakai; dilarang kartu kosong karangan.
  const ticketQueue = await getCrmTicketQueue().catch((error) => {
    console.error("[crm/tickets] antrean tiket:", error)
    return null
  })

  const { page, pageSize, take } = parsePagination(params)
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    // deleteTicket falls back to a soft delete when a FK blocks the hard delete,
    // so soft-deleted tickets must be filtered out of the list.
    deletedAt: null,
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
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.crmTicket.count({ where })

  const data = toPlain(tickets)

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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Tiket Dukungan</h1>
        <CanCreate permission="create_tickets">
          <Link href="/crm/tickets/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-ticket-btn">
            + Buat Tiket
          </Link>
        </CanCreate>
      </div>

      {ticketQueue ? <CrmTicketQueueCard queue={ticketQueue} /> : null}

      <TicketTable
        data={data}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={<AppSearchField placeholder="Cari subjek atau pelanggan..." action="/crm/tickets" />}
        filters={<div className="flex flex-wrap gap-1.5">{statusChips}</div>}
      />
    </div>
  )
}
