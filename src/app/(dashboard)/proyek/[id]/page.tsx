export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil, DollarSign, Activity, AlertCircle, Wrench, Shield } from "lucide-react"
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

  // Hitung ringkasan finansial proyek
  const totalQuotation = quotations.reduce((sum, q) => sum + Number(q.grandTotal), 0)
  const totalCost = project.items.reduce((sum, item) => sum + (Number(item.qty) * Number(item.cost)), 0)
  const estimatedProfit = totalQuotation - totalCost
  const profitMarginPercent = totalQuotation > 0 ? (estimatedProfit / totalQuotation) * 100 : 0

  // Cari tahapan aktif saat ini
  const activeStage = project.stages.find(s => s.status === "active") || project.stages[0]
  const overallProgress = project.stages.length > 0 
    ? Math.round(project.stages.reduce((sum, s) => sum + (s.progress[0]?.percentage ?? 0), 0) / project.stages.length)
    : 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Proyek: ${project.name}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Projects", href: "/proyek" },
          { label: "Detail" },
        ]}
        badge={<StatusChip status={project.status} />}
        actions={
          <>
            <Button href={`/proyek/${project.id}/ubah`} variant="secondary"><Pencil size={14} /> Edit</Button>
            <BackButton href="/proyek" />
          </>
        }
      />

      {/* Modern Premium Dashboard Widgets (WOW Visual) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Widget 1: Progress Lingkaran / Progres Fisik Mobil */}
        <div className="bg-surface rounded-2xl border border-default shadow-sm p-5 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Activity className="size-28 text-foreground" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted">Progres Pengerjaan</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">Fisik Mobil</span>
          </div>
          <div className="flex items-center gap-5 my-4">
            <div className="relative size-16 shrink-0 flex items-center justify-center rounded-full bg-primary/5 border border-primary/20 text-xl font-black text-primary">
              {overallProgress}%
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{activeStage?.name || "Tahap Awal"}</p>
              <p className="text-xs text-muted">Tahapan aktif saat ini dari {project.stages.length} fase</p>
            </div>
          </div>
          <div className="w-full bg-default/40 rounded-full h-1.5 overflow-hidden">
            <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${overallProgress}%` }} />
          </div>
        </div>

        {/* Widget 2: Kartu Mobil Premium */}
        <div className="bg-surface rounded-2xl border border-default shadow-sm p-5 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <Wrench className="size-28 text-foreground" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted">Profil Mobil Target</span>
            {project.customerVehicle?.licensePlate && (
              <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md border border-foreground bg-foreground text-background shadow-sm">
                {project.customerVehicle.licensePlate}
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
              <p className="text-xs text-muted mt-0.5">
                Varian: {project.customerVehicle.vehicle.variant?.name || "-"} | Tahun: {project.customerVehicle.year || "-"}
              </p>
              <p className="text-xs text-muted mt-1">
                Warna: <span className="inline-block size-2 rounded-full border border-default" style={{ backgroundColor: project.customerVehicle.color || "#000" }} /> {project.customerVehicle.color || "-"}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 my-4 text-muted">
              <AlertCircle size={16} />
              <span className="text-sm">Tidak ada kendaraan terhubung</span>
            </div>
          )}
          <div className="text-xs text-muted-secondary border-t border-default/50 pt-2 flex items-center gap-1.5">
            <Shield size={13} className="text-success" /> Pemilik: {project.customer.name}
          </div>
        </div>

        {/* Widget 3: Ringkasan Margin / P&L Proyek */}
        <div className="bg-gradient-to-br from-surface to-surface-secondary rounded-2xl border border-default shadow-sm p-5 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <DollarSign className="size-28 text-foreground" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted">Ringkasan Finansial</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-success-soft text-success-soft-foreground">Live Margin</span>
          </div>
          <div className="my-3">
            <div className="flex justify-between items-baseline">
              <p className="text-2xl font-black text-foreground">{formatCurrency(estimatedProfit)}</p>
              <span className="text-xs font-bold text-success">+{profitMarginPercent.toFixed(1)}%</span>
            </div>
            <p className="text-xs text-muted mt-0.5">Estimasi Keuntungan Bersih Proyek</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs border-t border-default/50 pt-2">
            <div>
              <span className="text-muted block">Penawaran:</span>
              <span className="font-semibold text-foreground">{formatCurrency(totalQuotation)}</span>
            </div>
            <div>
              <span className="text-muted block">Bahan & Komponen:</span>
              <span className="font-semibold text-danger">{formatCurrency(totalCost)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main detail content tabs */}
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
                    value={`${project.customerVehicle.licensePlate || "-"} — ${[project.customerVehicle.vehicle.variant?.model?.brand?.name, project.customerVehicle.vehicle.variant?.model?.name, project.customerVehicle.vehicle.variant?.name].filter(Boolean).join(" ") || "-"}`}
                  />
                )}
                {workOrder && (
                  <DetailField
                    label="Work Order"
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
            label: "Stages & Progress",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Timeline & Tahapan Pengerjaan Fisik</h2>
                </div>
                <div className="p-4 px-5">
                  {project.stages.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Belum ada tahapan</p>
                  ) : (
                    <div className="relative border-l-2 border-primary/20 ml-4 my-2 flex flex-col gap-6">
                      {project.stages.map((stage, idx) => {
                        const isStageActive = stage.status === "active"
                        const isStageDone = stage.status === "completed"
                        const currentPercent = stage.progress[0]?.percentage ?? 0

                        return (
                          <div key={stage.id} className="relative pl-7">
                            {/* Line Dot Indicator */}
                            <span className={`absolute -left-[9px] top-1.5 size-4 rounded-full border-2 transition-all flex items-center justify-center ${
                              isStageDone ? "bg-success border-success" : 
                              isStageActive ? "bg-primary border-primary animate-pulse" : "bg-surface border-default-hover"
                            }`}>
                              {isStageDone && <span className="size-1 rounded-full bg-white" />}
                            </span>
                            <div className="flex justify-between flex-wrap gap-2">
                              <div>
                                <h3 className={`text-sm font-bold ${isStageActive ? "text-primary" : "text-foreground"}`}>
                                  {stage.name}
                                </h3>
                                <p className="text-xs text-muted mt-0.5">
                                  {isStageDone ? "Tahapan Selesai" : isStageActive ? "Sedang Dikerjakan" : "Menunggu Antrean"}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  isStageDone ? "bg-success-soft text-success-soft-foreground" :
                                  isStageActive ? "bg-primary-soft text-primary-soft-foreground" : "bg-default-soft text-default-soft-foreground"
                                }`}>
                                  {stage.status.toUpperCase()}
                                </span>
                                <span className="text-sm font-semibold">{currentPercent}%</span>
                              </div>
                            </div>
                            
                            {/* Horizontal Mini Bar */}
                            <div className="w-full bg-default/30 rounded-full h-1 mt-3.5">
                              <div className={`h-full rounded-full ${isStageDone ? "bg-success" : "bg-primary"}`} style={{ width: `${currentPercent}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
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
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted">Tidak ada item</p>
                  ) : (
                    <DetailTable>
                      <DetailTableHead>
                        <DetailTableTh>Deskripsi / Material</DetailTableTh>
                        <DetailTableTh align="right">Qty</DetailTableTh>
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
