export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteLead } from "@/actions/crm.actions"
import { CONVERTIBLE_STATUSES } from "@/lib/validations/crm.schemas"
import { ConvertLeadButton, AddLeadActivityForm } from "../_components/lead-actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Leads" }

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_leads")
  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const lead = await prisma.lead.findUnique({
    where: { id: numId },
    include: {
      activities: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  })

  if (!lead) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Lead: ${lead.name}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "CRM", href: "/crm" },
          { label: "Leads", href: "/crm/leads" },
          { label: lead.name },
        ]}
        badge={<StatusChip status={lead.status} />}
        actions={<>
          <ConvertLeadButton
            leadId={lead.id}
            canConvert={!lead.customerId && (CONVERTIBLE_STATUSES as readonly string[]).includes(lead.status)}
          />
          <Button href={`/crm/leads/${lead.id}/ubah`} variant="secondary"><Pencil size={14} /> Ubah</Button>
          <DeleteButton id={lead.id} action={deleteLead} />
          <BackButton href="/crm/leads" />
        </>}
      />

      <DetailTabs
        ariaLabel="Lead detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <DetailCard>
                <DetailField label="Nama" value={lead.name} />
                <DetailField label="Email" value={lead.email || "-"} />
                <DetailField label="Telepon" value={lead.phone || "-"} />
                <DetailField label="Perusahaan" value={lead.company || "-"} />
                <DetailField label="Sumber" value={lead.source || "-"} />
                <DetailField label="Status" value={<StatusChip status={lead.status} />} />
                {lead.convertedAt && <DetailField label="Dikonversi" value={formatDate(lead.convertedAt)} />}
                {lead.notes && <DetailField label="Catatan" value={lead.notes} colSpan="full" />}
                <DetailField label="Dibuat" value={formatDate(lead.createdAt)} />
              </DetailCard>
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
                <AddLeadActivityForm leadId={lead.id} />
                <div className="p-4 px-5">
                  {lead.activities.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Belum ada aktivitas</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Tipe</DetailTableTh>
                        <DetailTableTh>Subjek</DetailTableTh>
                        <DetailTableTh>Detail</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {lead.activities.map((activity) => (
                          <DetailTableRow key={activity.id}>
                            <DetailTableTd>{activity.type}</DetailTableTd>
                            <DetailTableTd>
                              {activity.type === "status_change"
                                ? `${activity.oldStatus ?? "-"} → ${activity.newStatus ?? "-"}`
                                : (activity.subject || "-")}
                            </DetailTableTd>
                            <DetailTableTd>{activity.description || activity.notes || "-"}</DetailTableTd>
                            <DetailTableTd>{formatDate(activity.createdAt)}</DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
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
