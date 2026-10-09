export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil, DollarSign, Activity, AlertCircle, Wrench, Shield } from "lucide-react"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { Progress } from "@/components/ui/shadcn/progress"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/shadcn/alert"

import type { Metadata } from "next"

import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { initializeProjectStages } from "@/actions/project.actions"
import { ProjectStages } from "../_components/project-stages"

export const metadata: Metadata = { title: "Proyek" }

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermission("view_projects")

  const { id } = await params
  const numId = Number(id)
  if (Number.isNaN(numId)) notFound()

  const project = await prisma.project.findUnique({
    where: { id: numId },
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

  // Auto-initialize stages on detail view if empty and user has edit permission
  let stages = project.stages
  const canEdit = await hasPermission("edit_projects")
  if (stages.length === 0 && canEdit) {
    try {
      await initializeProjectStages(project.id)
      stages = await prisma.projectStage.findMany({
        where: { projectId: numId },
        orderBy: { sortOrder: "asc" },
        include: { progress: { orderBy: { createdAt: "desc" }, take: 1 } },
      })
    } catch (e) {
      console.error("[ProjectDetailPage] Failed to auto-initialize stages:", e)
    }
  }

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

  // Hitung ringkasan finansial proyek
  const totalQuotation = quotations.reduce((sum, q) => sum + Number(q.grandTotal), 0)
  const totalCost = project.items.reduce((sum, item) => sum + (Number(item.qty) * Number(item.cost)), 0)
  const estimatedProfit = totalQuotation - totalCost
  const profitMarginPercent = totalQuotation > 0 ? (estimatedProfit / totalQuotation) * 100 : 0

  // Cari tahapan aktif saat ini
  const activeStage = stages.find(s => s.status === "in_progress") || stages.find(s => s.status === "pending") || stages[0]
  const overallProgress = stages.length > 0 
    ? Math.round(
        stages.reduce((sum, s) => {
          const recordPercent = s.progress?.[0]?.percentage
          if (recordPercent !== undefined) return sum + recordPercent
          if (s.status === "completed" || s.status === "skipped") return sum + 100
          if (s.status === "in_progress") return sum + 50
          return sum
        }, 0) / stages.length
      )
    : 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Proyek: ${project.name}`}
        breadcrumbs={[
          { label: "Dasbor", href: "/" },
          { label: "Proyek", href: "/proyek" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={project.status} />}
        actions={
          <>
            <CanCreate permission="edit_projects">
              <Button href={`/proyek/${project.id}/ubah`} variant="secondary"><Pencil size={14} /> Ubah</Button>
            </CanCreate>
            <BackButton href="/proyek" />
          </>
        }
      />

      {totalQuotation > 0 && estimatedProfit < 0 && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Proyek diperkirakan rugi</AlertTitle>
          <AlertDescription>
            Total penawaran ({formatCurrency(totalQuotation)}) lebih rendah dari estimasi biaya material ({formatCurrency(totalCost)}). Tinjau kembali harga penawaran atau biaya proyek.
          </AlertDescription>
        </Alert>
      )}

      {/* Modern Premium Dashboard Widgets (WOW Visual) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Widget 1: Progress Lingkaran / Progres Fisik Mobil */}
        <div className="bg-surface rounded-2xl border border-default shadow-sm p-5 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Activity className="size-28 text-foreground" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted-foreground">Progres Pengerjaan</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">Fisik Mobil</span>
          </div>
          <div className="flex items-center gap-5 my-4">
            <div className="relative size-16 shrink-0 flex items-center justify-center rounded-full bg-primary/5 border border-primary/20 text-xl font-black text-primary">
              {overallProgress}%
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{activeStage?.name || "Tahap Awal"}</p>
              <p className="text-xs text-muted-foreground">Tahapan aktif saat ini dari {project.stages.length} fase</p>
            </div>
          </div>
          <Progress value={overallProgress} className="h-1.5" />
        </div>

        {/* Widget 2: Kartu Mobil Premium */}
        <div className="bg-surface rounded-2xl border border-default shadow-sm p-5 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Wrench className="size-28 text-foreground" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted-foreground">Profil Mobil Target</span>
            {project.customerVehicle?.vehicle?.plateNumber && (
              <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md border border-foreground bg-foreground text-background shadow-sm">
                {project.customerVehicle.vehicle.plateNumber}
              </span>
            )}
          </div>
          {project.customerVehicle ? (
            <div className="my-3">
              <p className="text-lg font-bold text-foreground">
                {[
                  project.customerVehicle.vehicle.variant?.model?.brand?.name,
                  project.customerVehicle.vehicle.variant?.model?.name
                ].filter(Boolean).join(" ") || "Mobil Pelanggan"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Varian: {project.customerVehicle.vehicle.variant?.name || "-"} | Tahun: {project.customerVehicle.vehicle.year || "-"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Warna: <span className="inline-block size-2 rounded-full border border-default" style={{ backgroundColor: project.customerVehicle.vehicle.color || "#000" }} /> {project.customerVehicle.vehicle.color || "-"}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 my-4 text-muted-foreground">
              <AlertCircle size={16} />
              <span className="text-sm">Tidak ada kendaraan terhubung</span>
            </div>
          )}
          <div className="text-xs text-muted-foreground-secondary border-t border-default/50 pt-2 flex items-center gap-1.5">
            <Shield size={13} className="text-success" /> Pemilik: {project.customer.name}
          </div>
        </div>

        {/* Widget 3: Ringkasan Margin / P&L Proyek */}
        <div className="bg-gradient-to-br from-surface to-surface-secondary rounded-2xl border border-default shadow-sm p-5 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <DollarSign className="size-28 text-foreground" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted-foreground">Ringkasan Finansial</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-success-soft text-success-soft-foreground">Margin Langsung</span>
          </div>
          <div className="my-3">
            <div className="flex justify-between items-baseline">
              <p className="text-2xl font-black text-foreground">{formatCurrency(estimatedProfit)}</p>
              <span className={`text-xs font-bold ${estimatedProfit < 0 ? "text-danger" : "text-success"}`}>{estimatedProfit >= 0 ? "+" : ""}{profitMarginPercent.toFixed(1)}%</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Estimasi Keuntungan Bersih Proyek</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs border-t border-default/50 pt-2">
            <div>
              <span className="text-muted-foreground block">Penawaran:</span>
              <span className="font-semibold text-foreground">{formatCurrency(totalQuotation)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">Bahan & Komponen:</span>
              <span className="font-semibold text-danger">{formatCurrency(totalCost)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main detail content tabs */}
      <DetailTabs
        ariaLabel="Tab detail proyek"
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
                  label="Pelanggan"
                  value={<Link href={`/master/pelanggan/${project.customer.id}`} className="text-primary hover:underline font-medium">{project.customer.name}</Link>}
                />
                <DetailField label="Status" value={<StatusChip status={project.status} />} />
                <DetailField label="Tanggal Mulai" value={project.startDate ? formatDate(project.startDate) : "-"} />
                <DetailField label="Tanggal Selesai" value={project.endDate ? formatDate(project.endDate) : "-"} />
                <DetailField label="Dibuat" value={formatDate(project.createdAt)} />
                {project.customerVehicle && (
                  <DetailField
                    label="Kendaraan"
                    value={`${project.customerVehicle.vehicle?.plateNumber || "-"} — ${[project.customerVehicle.vehicle.variant?.model?.brand?.name, project.customerVehicle.vehicle.variant?.model?.name, project.customerVehicle.vehicle.variant?.name].filter(Boolean).join(" ") || "-"}`}
                  />
                )}
                {workOrder && (
                  <DetailField
                    label="Perintah Kerja"
                    value={<Link href={`/produksi/perintah-kerja/${workOrder.id}`} className="text-primary hover:underline font-mono">{workOrder.documentNo}</Link>}
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
            id: "stages",
            label: "Tahapan & Progres",
            content: (
              <ProjectStages
                projectId={project.id}
                stages={stages}
                canEdit={canEdit}
              />
            ),
          },
          {
            id: "items",
            label: "Bahan & Komponen",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Bahan & Komponen Fisik Terpakai</h2>
                </div>
                <div className="p-4 px-5">
                  {project.items.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Tidak ada item</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Deskripsi / Material</DetailTableTh>
                        <DetailTableTh align="right">Jml</DetailTableTh>
                        <DetailTableTh align="right">Biaya Satuan</DetailTableTh>
                        <DetailTableTh align="right">Total Biaya</DetailTableTh>
                      </DetailTableHead>
                      <DetailTableBody>
                        {project.items.map((item) => (
                          <DetailTableRow key={item.id}>
                            <DetailTableTd>{item.description || `Item #${item.itemId}`}</DetailTableTd>
                            <DetailTableTd align="right">{Number(item.qty)}</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(item.cost))}</DetailTableTd>
                            <DetailTableTd align="right">{formatCurrency(Number(item.qty) * Number(item.cost))}</DetailTableTd>
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
                  <Link href={`/penjualan/penawaran?cari=${project.customer.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {quotations.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Belum ada penawaran</p>
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
                            <DetailTableTd className="font-mono"><Link href={`/penjualan/penawaran/${q.id}`}>{q.documentNo}</Link></DetailTableTd>
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
                  <Link href={`/penjualan/faktur?cari=${project.customer.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {invoices.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Belum ada invoice</p>
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
                            <DetailTableTd className="font-mono"><Link href={`/penjualan/faktur/${inv.id}`}>{inv.documentNo}</Link></DetailTableTd>
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
            label: "Log",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Log Aktivitas</h2>
                </div>
                <div className="p-4 px-5">
                  {project.logs.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Belum ada log</p>
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
