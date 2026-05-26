export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { StatusChip } from '@/components/ui/status-chip'
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteTicket } from "@/actions/crm.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function CrmTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const ticket = await prisma.crmTicket.findUnique({
    where: { id: Number(id) },
    include: {
      comments: { orderBy: { createdAt: "desc" } },
    },
  })

  if (!ticket) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "CRM", href: "/crm" },
  { label: "Tickets", href: "/crm/tickets" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Tiket: {ticket.subject}</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <StatusChip status={ticket.status} />
          <StatusChip status={ticket.priority} />
  <div className="flex gap-2">
          <Link href={`/crm/tickets/${ticket.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">Edit</Link>
          <DeleteButton id={ticket.id} action={deleteTicket} />
                  <Link href="/crm/tickets" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Subjek</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{ticket.subject}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Prioritas</span>
            <span className="text-[0.9375rem] text-foreground font-medium"><StatusChip status={ticket.priority} /></span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Status</span>
            <span className="text-[0.9375rem] text-foreground font-medium"><StatusChip status={ticket.status} /></span>
          </div>
          {ticket.customerId && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Customer ID</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{ticket.customerId}</span>
            </div>
          )}
          {ticket.assignedTo && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Ditugaskan ke</span>
              <span className="text-[0.9375rem] text-foreground font-medium">User #{ticket.assignedTo}</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
            <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(ticket.createdAt)}</span>
          </div>
          {ticket.description && (
            <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
              <span className="text-xs font-medium text-muted uppercase tracking-wide">Deskripsi</span>
              <span className="text-[0.9375rem] text-foreground font-medium">{ticket.description}</span>
            </div>
          )}
        </div>
      </div>

      {/* Comments */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-4 px-5 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Komentar</h2>
        </div>
        <div className="p-4 px-5">
          {ticket.comments.length === 0 ? (
            <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada komentar</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Komentar</th>
                  <th>Tanggal</th>
                </tr>
              </thead>
              <tbody>
                {ticket.comments.map((comment) => (
                  <tr key={comment.id}>
                    <td>User #{comment.userId || "-"}</td>
                    <td>{comment.body}</td>
                    <td>{formatDate(comment.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
