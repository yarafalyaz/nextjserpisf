export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteLead } from "@/actions/crm.actions"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Leads" }

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
                <div className="p-4 px-5">
                  {lead.activities.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Belum ada aktivitas</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Tipe</DetailTableTh>
                        <DetailTableTh>Catatan</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {lead.activities.map((activity) => (
                          <DetailTableRow key={activity.id}>
                            <DetailTableTd>{activity.type}</DetailTableTd>
                            <DetailTableTd>{activity.notes || "-"}</DetailTableTd>
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
