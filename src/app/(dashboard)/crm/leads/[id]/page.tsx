export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { StatusChip } from '@/components/ui/status-chip'
import { DetailTabs } from "@/components/ui/detail-tabs"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteLead } from "@/actions/crm.actions"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const lead = await prisma.lead.findUnique({
    where: { id: Number(id) },
    include: {
      activities: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  })

  if (!lead) notFound()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dashboard", href: "/" },
  { label: "CRM", href: "/crm" },
  { label: "Leads", href: "/crm/leads" },
  { label: "Detail" },
]} />
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-foreground">Lead: {lead.name}</h1>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <StatusChip status={lead.status} />
          <Link href={`/crm/leads/${lead.id}/edit`} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all"><Pencil size={14} className="inline" /> Edit</Link>
          <DeleteButton id={lead.id} action={deleteLead} />
          <Link href="/crm/leads" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-surface-secondary hover:text-foreground transition-all">← Kembali</Link>
        </div>
      </div>

      <DetailTabs
        ariaLabel="Lead detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
                <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Nama</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{lead.name}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Email</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{lead.email || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Telepon</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{lead.phone || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Perusahaan</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{lead.company || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Sumber</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{lead.source || "-"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Status</span>
                    <span className="text-[0.9375rem] text-foreground font-medium"><StatusChip status={lead.status} /></span>
                  </div>
                  {lead.convertedAt && (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Dikonversi</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(lead.convertedAt)}</span>
                    </div>
                  )}
                  {lead.notes && (
                    <div className="flex flex-col gap-1" style={{ gridColumn: "1 / -1" }}>
                      <span className="text-xs font-medium text-muted uppercase tracking-wide">Catatan</span>
                      <span className="text-[0.9375rem] text-foreground font-medium">{lead.notes}</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wide">Dibuat</span>
                    <span className="text-[0.9375rem] text-foreground font-medium">{formatDate(lead.createdAt)}</span>
                  </div>
                </div>
              </div>
            ),
          },
          {
            id: "aktivitas",
            label: "Aktivitas",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Aktivitas Terbaru</h2>
                </div>
                <div className="p-4 px-5">
                  {lead.activities.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada aktivitas</p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th>Tipe</th>
                          <th>Catatan</th>
                          <th>Tanggal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lead.activities.map((activity) => (
                          <tr key={activity.id}>
                            <td>{activity.type}</td>
                            <td>{activity.notes || "-"}</td>
                            <td>{formatDate(activity.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
