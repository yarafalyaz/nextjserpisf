export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission, requireAuth } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { formatDate } from "@/lib/utils/format"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { StatusChip } from "@/components/ui/status-chip"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { DeleteButton } from "@/components/ui/delete-button"
import { deleteLead } from "@/actions/crm.actions"
import { CONVERTIBLE_STATUSES } from "@/lib/validations/crm.schemas"
import { ConvertLeadButton, AddLeadActivityForm, LeadActivityCompletionButton } from "../_components/lead-actions"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { LEAD_ACTIVITY_TYPE_LABELS, labelFrom, statusLabel } from "@/lib/utils/status-labels"

import type { Metadata } from "next"

import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityEditHref } from "@/lib/utils/entity-url"
import { LeadCustomerVehiclesCard } from "@/components/reports/lead-customer-vehicles-card"

export const metadata: Metadata = { title: "Prospek" }

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_leads")
  const viewer = await requireAuth()
  const { slug } = await params

  const lead = await resolveEntity(
    { segment: slug, fallbackWhere: { deletedAt: null } },
    {
      bySlug: (s, where) =>
        prisma.lead.findFirst({
          where: { slug: s, ...where },
          include: { activities: { orderBy: { createdAt: "desc" }, take: 10 } },
        }),
      byId: (id, where) =>
        prisma.lead.findUnique({
          where: { id, ...where },
          include: { activities: { orderBy: { createdAt: "desc" }, take: 10 } },
        }),
    },
  )

  if (!lead) notFound()

  // F-2026-10-25-008-S (BR-LC-02, AC-LC-F1): tombol penanda selesai hanya
  // untuk pemanggil yang lolos gerbang server yang sama — edit_leads DAN
  // (pemilik lead ATAU manage_leads/super_admin), pola convertLead. Halaman
  // menghitung canAct dari fakta sesi server; komponen tombol tidak menilai
  // kepemilikan sendiri.
  const viewerPermissions: readonly string[] = viewer.permissions ?? []
  const viewerRoles: readonly string[] = viewer.roles ?? []
  const canActOnLeadActivities =
    viewerPermissions.includes("edit_leads") &&
    (viewerRoles.includes("super_admin") ||
      viewerPermissions.includes("manage_leads") ||
      lead.assignedTo === Number(viewer.id))

  // F-2026-10-20-93(a): kendaraan pelanggan tertaut (read-only). Lead belum
  // terkonversi (customerId kosong) tidak punya kendaraan; tampilkan kartu
  // hanya bila pelanggan tertaut ada.
  const linkedCustomer = lead.customerId
    ? await prisma.customer.findUnique({
        where: { id: lead.customerId },
        select: { id: true, slug: true, name: true },
      })
    : null
  const linkedVehicles = linkedCustomer
    ? await prisma.customerVehicle.findMany({
        where: { customerId: linkedCustomer.id },
        select: {
          id: true,
          slug: true,
          plateNumber: true,
          color: true,
          isActive: true,
          vehicle: { select: { name: true, year: true } },
        },
        orderBy: { createdAt: "desc" },
      })
    : []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Prospek: ${lead.name}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "CRM", href: "/crm" },
          { label: "Prospek", href: "/crm/leads" },
          { label: lead.name },
        ]}
        badge={<StatusChip status={lead.status} />}
        actions={<>
          <CanCreate permission="edit_leads">
            <ConvertLeadButton
              leadId={lead.id}
              canConvert={!lead.customerId && (CONVERTIBLE_STATUSES as readonly string[]).includes(lead.status)}
            />
          </CanCreate>
          <CanCreate permission="edit_leads">
            <Button href={entityEditHref("/crm/leads", lead)} variant="secondary"><Pencil size={14} /> Ubah</Button>
          </CanCreate>
          <CanCreate permission="delete_leads">
            <DeleteButton id={lead.id} action={deleteLead} />
          </CanCreate>
          <BackButton href="/crm/leads" />
        </>}
      />

      <DetailTabs
        ariaLabel="Tab detail prospek"
        tabs={[
          {
            id: "info",
            label: "Informasi",
            content: (
              <div className="flex flex-col gap-6">
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
              {linkedCustomer ? (
                <LeadCustomerVehiclesCard
                  customerSlug={linkedCustomer.slug}
                  customerId={linkedCustomer.id}
                  customerName={linkedCustomer.name}
                  vehicles={linkedVehicles.map((vehicle) => ({
                    id: vehicle.id,
                    slug: vehicle.slug,
                    plateNumber: vehicle.plateNumber,
                    vehicleName: vehicle.vehicle?.name ?? null,
                    color: vehicle.color,
                    year: vehicle.vehicle?.year ?? null,
                    isActive: vehicle.isActive,
                  }))}
                />
              ) : null}
              </div>
            ),
          },
          {
            id: "aktivitas",
            label: "Aktivitas",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Aktivitas Terbaru</h2>
                </div>
                <AddLeadActivityForm leadId={lead.id} />
                <div className="p-4 px-5">
                  {lead.activities.length === 0 ? (
                    <EmptyState title="Belum ada aktivitas" />
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Tipe</DetailTableTh>
                        <DetailTableTh>Subjek</DetailTableTh>
                        <DetailTableTh>Detail</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh>Jadwal</DetailTableTh>
                        <DetailTableTh>Aksi</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {lead.activities.map((activity) => {
                          // F-2026-10-25-008-S §6/BR-LC-07: label riwayat
                          // verbatim dari completedAt/scheduledAt server —
                          // UI tidak menentukan status selesai sendiri.
                          const historyLabel = activity.completedAt
                            ? `Selesai ${formatDate(activity.completedAt)}`
                            : activity.scheduledAt
                              ? `Terjadwal ${formatDate(activity.scheduledAt)}`
                              : "-"
                          return (
                            <DetailTableRow key={activity.id}>
                              <DetailTableTd>{labelFrom(LEAD_ACTIVITY_TYPE_LABELS, activity.type)}</DetailTableTd>
                              <DetailTableTd>
                                {activity.type === "status_change"
                                  ? `${statusLabel(activity.oldStatus)} → ${statusLabel(activity.newStatus)}`
                                  : (activity.subject || "-")}
                              </DetailTableTd>
                              <DetailTableTd>{activity.description || activity.notes || "-"}</DetailTableTd>
                              <DetailTableTd>{formatDate(activity.createdAt)}</DetailTableTd>
                              <DetailTableTd>{historyLabel}</DetailTableTd>
                              <DetailTableTd>
                                {activity.scheduledAt || activity.completedAt ? (
                                  <LeadActivityCompletionButton
                                    leadId={lead.id}
                                    activityId={activity.id}
                                    subject={activity.subject}
                                    completedAt={Boolean(activity.completedAt)}
                                    canAct={canActOnLeadActivities}
                                  />
                                ) : null}
                              </DetailTableTd>
                            </DetailTableRow>
                          )
                        })}
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
