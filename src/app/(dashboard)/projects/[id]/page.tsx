export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, Button, BackButton } from "@/components/ui/page-header"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id: Number(id) },
    include: {
      customer: true,
      customerVehicle: {
        include: { vehicle: { include: { variant: { include: { model: { include: { brand: true } } } } } } },
      },
      items: true,
      stages: {
        orderBy: { sortOrder: "asc" },
        include: { progress: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
      logs: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  })

  if (!project) notFound()

  // Fetch linked work order if exists
  const workOrder = project.workOrderId
    ? await prisma.workOrder.findUnique({ where: { id: project.workOrderId }, select: { id: true, documentNo: true, status: true } })
    : null

  const [quotations, invoices] = await Promise.all([
    prisma.quotation.findMany({
      where: { customerId: project.customerId, deletedAt: null },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
    prisma.salesInvoice.findMany({
      where: { customerId: project.customerId, deletedAt: null },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
  ])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Proyek: ${project.name}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Projects", href: "/projects" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={project.status} />}
        actions={
          <>
            <Button href={`/projects/${project.id}/edit`} variant="secondary"><Pencil size={14} /> Edit</Button>
            <BackButton href="/projects" />
          </>
        }
      />

      <DetailTabs
        ariaLabel="Project detail tabs"
        tabs={[
          {
            id: "info",
            label: "Info",
            content: (
              <DetailCard>
                {project.documentNo && (
                  <DetailField label="No. Dokumen" value={project.documentNo} mono />
                )}
                <DetailField label="Nama Proyek" value={project.name} />
                <DetailField
                  label="Customer"
                  value={<Link href={`/master/customers/${project.customer.id}`}>{project.customer.name}</Link>}
                />
                <DetailField label="Status" value={<StatusChip status={project.status} />} />
                <DetailField label="Tanggal Mulai" value={project.startDate ? formatDate(project.startDate) : "-"} />
                <DetailField label="Tanggal Selesai" value={project.endDate ? formatDate(project.endDate) : "-"} />
                <DetailField label="Dibuat" value={formatDate(project.createdAt)} />
                {project.customerVehicle && (
                  <DetailField
                    label="Kendaraan"
                    value={`${project.customerVehicle.licensePlate || "-"} — ${[project.customerVehicle.vehicle.variant?.model?.brand?.name, project.customerVehicle.vehicle.variant?.model?.name, project.customerVehicle.vehicle.variant?.name].filter(Boolean).join(" ") || "-"}`}
                  />
                )}
                {workOrder && (
                  <DetailField
                    label="Work Order"
                    value={<Link href={`/manufacturing/work-orders/${workOrder.id}`} className="text-primary hover:underline font-mono">{workOrder.documentNo}</Link>}
                  />
                )}
                {project.description && (
                  <DetailField label="Deskripsi" value={<span className="whitespace-pre-wrap">{project.description}</span>} colSpan="full" />
                )}
                {project.notes && (
                  <DetailField label="Catatan" value={project.notes} colSpan="full" />
                )}
              </DetailCard>
            ),
          },
          {
            id: "items",
            label: "Items",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Items</h2>
                </div>
                <div className="p-4 px-5">
                  {project.items.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada item</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Deskripsi</DetailTableTh>
                        <DetailTableTh align="right">Qty</DetailTableTh>
                        <DetailTableTh align="right">Biaya</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {project.items.map((item) => (
                          <DetailTableRow key={item.id}>
                            <DetailTableTd>{item.description || `Item #${item.itemId}`}</DetailTableTd>
                            <DetailTableTd align="right">{Number(item.qty)}</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(item.cost))}</DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "stages",
            label: "Stages",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Tahapan</h2>
                </div>
                <div className="p-4 px-5">
                  {project.stages.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada tahapan</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Nama</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                        <DetailTableTh align="right">Progress</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {project.stages.map((stage) => (
                          <DetailTableRow key={stage.id}>
                            <DetailTableTd>{stage.name}</DetailTableTd>
                            <DetailTableTd><StatusChip status={stage.status} /></DetailTableTd>
                            <DetailTableTd align="right">{stage.progress[0]?.percentage ?? 0}%</DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "quotations",
            label: `Quotations (${quotations.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat Penawaran</h2>
                  <Link href={`/sales/quotations?search=${project.customer.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {quotations.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada quotation</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh align="right">Total</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {quotations.map((q) => (
                          <DetailTableRow key={q.id}>
                            <DetailTableTd className="font-mono"><Link href={`/sales/quotations/${q.id}`}>{q.documentNo}</Link></DetailTableTd>
                            <DetailTableTd>{formatDate(q.date)}</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(q.grandTotal))}</DetailTableTd>
                            <DetailTableTd><StatusChip status={q.status} /></DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "invoices",
            label: `Invoices (${invoices.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Tagihan & Pembayaran</h2>
                  <Link href={`/sales/invoices?search=${project.customer.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {invoices.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada invoice</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>No. Dokumen</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                        <DetailTableTh align="right">Total</DetailTableTh>
                        <DetailTableTh align="right">Terbayar</DetailTableTh>
                        <DetailTableTh>Status</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {invoices.map((inv) => (
                          <DetailTableRow key={inv.id}>
                            <DetailTableTd className="font-mono"><Link href={`/sales/invoices/${inv.id}`}>{inv.documentNo}</Link></DetailTableTd>
                            <DetailTableTd>{formatDate(inv.date)}</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(inv.grandTotal))}</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(inv.paidAmount))}</DetailTableTd>
                            <DetailTableTd><StatusChip status={inv.status} /></DetailTableTd>
                          </DetailTableRow>
                        ))}
                      </DetailTableBody>
                    </DetailTable>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: "logs",
            label: "Logs",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Log Aktivitas</h2>
                </div>
                <div className="p-4 px-5">
                  {project.logs.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada log</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Aksi</DetailTableTh>
                        <DetailTableTh>Catatan</DetailTableTh>
                        <DetailTableTh>Tanggal</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {project.logs.map((log) => (
                          <DetailTableRow key={log.id}>
                            <DetailTableTd>{log.action}</DetailTableTd>
                            <DetailTableTd>{log.notes || "-"}</DetailTableTd>
                            <DetailTableTd>{formatDate(log.createdAt)}</DetailTableTd>
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
