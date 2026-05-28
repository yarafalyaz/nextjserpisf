export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import Link from "next/link"
import { statusLabel } from "@/lib/utils/status-labels"
import { requirePermission } from "@/lib/auth/permissions"
import { AppSearchField } from "@/components/ui/search-field"
import { TicketTable } from "./_components/ticket-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cari?: string }>
}) {
  await requirePermission("view_tickets")

  const params = await searchParams

  const where = {
    ...(params.cari && {
      OR: [
        { subject: { contains: params.cari } },
        { customerName: { contains: params.cari } },
      ],
    }),
    ...(params.status && { status: params.status }),
  }

  const tickets = await prisma.crmTicket.findMany({
    where,
    orderBy: { createdAt: "desc" },
  })

  const data = JSON.parse(JSON.stringify(tickets))

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "CRM", href: "/crm" },
  { label: "Tickets" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tiket Dukungan</h1>
        <Link href="/crm/tickets/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-ticket-btn">
          + Buat Ticket
        </Link>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="p-3 px-4 flex flex-col gap-3">
          <AppSearchField placeholder="Cari subject atau customer..." action="/crm/tickets" />
          <div className="flex gap-1.5 flex-wrap">
            {["", "open", "in_progress", "resolved", "closed"].map((s) => (
              <Link key={s} href={`/crm/tickets?status=${s}`} className={`filter-chip ${params.status === s || (!params.status && !s) ? "active" : ""}`}>
                {s ? statusLabel(s) : "Semua"}
              </Link>
            ))}
          </div>
        </div>

        <TicketTable data={data} />
      </div>
    </div>
  )
}
