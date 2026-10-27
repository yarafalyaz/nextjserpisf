export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { formatDate, formatCurrency } from "@/lib/utils/format"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil, Activity, AlertCircle, Wrench, Shield } from "lucide-react"
import { DetailTabs } from "@/components/ui/detail-tabs"
import { StatusChip } from "@/components/ui/status-chip"
import { PageHeader, BackButton } from "@/components/ui/page-header"
import { Button } from "@/components/ui/button"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { Progress } from "@/components/ui/shadcn/progress"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/shadcn/alert"
import { ProjectPlDetailCard } from "@/components/reports/project-pl-detail-card"
import { ProjectBudgetCard } from "@/components/reports/project-budget-card"
import { ProjectEarnedValueCard } from "@/components/reports/project-earned-value-card"
import { ProjectBudgetEditor } from "./_components/project-budget-editor"
import { loadProjectPlForProject } from "@/lib/reports/project-pl-data"
import { loadProjectBudgetForProject } from "@/lib/reports/project-budget-data"
import { loadProjectEarnedValueForProject } from "@/lib/reports/project-earned-value-data"

import type { Metadata } from "next"

import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { initializeProjectStages } from "@/actions/project.actions"
import { ProjectStages } from "../_components/project-stages"
import { ProjectLogForm } from "./_components/project-log-form"
import { resolveEntity } from "@/lib/utils/resolve-entity"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

export const metadata: Metadata = { title: "Proyek" }

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  await requirePermission("view_projects")

  const { slug } = await params

  const projectInclude = {
    customer: true,
    customerVehicle: {
      include: { vehicle: { include: { variant: { include: { model: { include: { brand: true } } } } } } },
    },
    items: true,
    stages: {
      orderBy: { sortOrder: "asc" as const },
      include: { progress: { orderBy: { createdAt: "desc" as const }, take: 1 } },
    },
    logs: { orderBy: { createdAt: "desc" as const }, take: 10 },
  }

  const project = await resolveEntity(
    { segment: slug, fallbackWhere: {} },
    {
      bySlug: (s) => prisma.project.findFirst({ where: { slug: s }, include: projectInclude }),
      byId: (id) => prisma.project.findUnique({ where: { id }, include: projectInclude }),
    },
  )

  if (!project) notFound()

  // Auto-initialize stages on detail view if empty and user has edit permission
  let stages = project.stages
  let stagesInitError: string | null = null
  const canEdit = await hasPermission("edit_projects")
  const canManageBudget = await hasPermission("manage_projects")
  if (stages.length === 0 && canEdit) {
    try {
      const init = await initializeProjectStages(project.id)
      // Hasilnya dulu dibuang; kegagalan pun tampil sebagai "belum ada tahapan"
      // tanpa cara mengulang. Simpan pesannya supaya terlihat di UI.
      if (!init.success) stagesInitError = "error" in init ? init.error : "Tahapan default gagal dibuat."
      stages = await prisma.projectStage.findMany({
        where: { projectId: project.id },
        orderBy: { sortOrder: "asc" },
        include: { progress: { orderBy: { createdAt: "desc" }, take: 1 } },
      })
    } catch (e) {
      console.error("[ProjectDetailPage] Failed to auto-initialize stages:", e)
      stagesInitError ??= "Gagal memuat tahapan proyek."
    }
  }

  // Fetch linked work order if exists
  const workOrder = project.workOrderId
    ? await prisma.workOrder.findUnique({ where: { id: project.workOrderId }, select: { id: true, slug: true, documentNo: true, status: true } })
    : null

  // F-2026-10-21-029: penawaran proyek ini = quotation ber-projectId proyek
  // (bukan lagi semua quotation pelanggan yang tercampur antar proyek).
  // Ringkasan uang proyek dibaca dari builder tunggal `loadProjectPlForProject`
  // — UI tidak mengagregasi invoice/material/beban sendiri.
  const [quotations, invoices, projectPl, projectBudget, projectEarnedValue] = await Promise.all([
    prisma.quotation.findMany({
      where: { projectId: project.id, deletedAt: null },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
    prisma.salesInvoice.findMany({
      where: { projectId: project.id, deletedAt: null },
      take: 10,
      orderBy: { createdAt: "desc" },
    }),
    loadProjectPlForProject(project.id),
    loadProjectBudgetForProject(project.id),
    loadProjectEarnedValueForProject(project.id),
  ])

  // Usulan revisi terbuka: log rab_revision_proposed terbaru yang belum
  // diputuskan (details.proposalLogId di log rab_revision/rab_revision_rejected).
  // Id log tidak diekspos builder riwayat — dibaca langsung di boundary RSC.
  const pendingProposal = projectBudget?.isLocked
    ? await (async () => {
        const [proposals, settledLogs] = await Promise.all([
          prisma.projectLog.findMany({
            where: { projectId: project.id, action: "rab_revision_proposed" },
            select: { id: true, notes: true, details: true },
            orderBy: { createdAt: "desc" },
          }),
          prisma.projectLog.findMany({
            where: { projectId: project.id, action: { in: ["rab_revision", "rab_revision_rejected"] } },
            select: { details: true },
          }),
        ])
        const settled = new Set(
          settledLogs
            .map((l) => (l.details as { proposalLogId?: unknown } | null)?.proposalLogId)
            .filter((v): v is number => typeof v === "number"),
        )
        const open = proposals.find((p) => !settled.has(p.id))
        if (!open) return null
        const details = (open.details ?? {}) as { changes?: unknown; reason?: unknown }
        return {
          logId: open.id,
          reason: typeof details.reason === "string" ? details.reason : (open.notes ?? ""),
          changesJson: JSON.stringify(details.changes ?? []),
        }
      })()
    : null

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
              <Button href={entityEditHref("/proyek", project)} variant="secondary"><Pencil size={14} /> Ubah</Button>
            </CanCreate>
            <BackButton href="/proyek" />
          </>
        }
      />

      {projectPl && projectPl.profit < 0 && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Proyek rugi menurut L/R proyek</AlertTitle>
          <AlertDescription>
            Laba (rugi) proyek dari builder L/R ({formatCurrency(projectPl.profit)}) negatif: pendapatan invoice diakui {formatCurrency(projectPl.revenue)} di bawah total biaya {formatCurrency(projectPl.totalCost)}. Tinjau kembali harga penawaran atau biaya proyek.
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
          <div className="flex flex-wrap items-center justify-between gap-4">
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
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="text-sm font-semibold text-muted-foreground">Profil Mobil Target</span>
            {project.customerVehicle?.plateNumber && (
              <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded-md border border-foreground bg-foreground text-background shadow-sm">
                {project.customerVehicle.plateNumber}
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
                Warna: <span className="inline-block size-2 rounded-full border border-default" style={{ backgroundColor: project.customerVehicle.color || "var(--muted-foreground)" }} /> {project.customerVehicle.color || "-"}
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

        {/* Widget 3: Ringkasan L/R Proyek (builder tunggal F-029) */}
        {projectPl ? (
          <ProjectPlDetailCard pl={projectPl} />
        ) : (
          <div className="bg-surface rounded-2xl border border-default shadow-sm p-5">
            <span className="text-sm font-semibold text-muted-foreground">Laba Rugi Proyek</span>
            <p className="mt-3 text-sm text-muted-foreground">Belum ada data laba rugi untuk proyek ini</p>
          </div>
        )}
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
                  value={<Link href={entityHref("/master/pelanggan", project.customer)} className="text-primary hover:underline font-medium">{project.customer.name}</Link>}
                />
                <DetailField label="Status" value={<StatusChip status={project.status} />} />
                <DetailField label="Tanggal Mulai" value={project.startDate ? formatDate(project.startDate) : "-"} />
                <DetailField label="Tanggal Selesai" value={project.endDate ? formatDate(project.endDate) : "-"} />
                <DetailField label="Dibuat" value={formatDate(project.createdAt)} />
                {project.customerVehicle && (
                  <DetailField
                    label="Kendaraan"
                    value={`${project.customerVehicle.plateNumber || "-"} — ${[project.customerVehicle.vehicle.variant?.model?.brand?.name, project.customerVehicle.vehicle.variant?.model?.name, project.customerVehicle.vehicle.variant?.name].filter(Boolean).join(" ") || "-"}`}
                  />
                )}
                {workOrder && (
                  <DetailField
                    label="Perintah Kerja"
                    value={<Link href={entityHref("/produksi/perintah-kerja", workOrder)} className="text-primary hover:underline font-mono">{workOrder.documentNo}</Link>}
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
              <>
                {stagesInitError && (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertTitle>Tahapan default gagal dibuat otomatis</AlertTitle>
                    <AlertDescription>
                      {stagesInitError} Buka ulang halaman ini atau buat tahapan manual.
                    </AlertDescription>
                  </Alert>
                )}
                <ProjectStages
                  projectId={project.id}
                  stages={stages}
                  canEdit={canEdit}
                />
              </>
            ),
          },
          {
            id: "items",
            label: "Bahan & Komponen",
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
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
            id: "budget",
            label: "RAB",
            content: projectBudget ? (
              <>
                <ProjectBudgetCard budget={projectBudget} />
                <ProjectEarnedValueCard earnedValue={projectEarnedValue} />
                <ProjectBudgetEditor
                  projectId={project.id}
                  items={project.items.map((it) => ({ id: it.id, projectStageId: it.projectStageId, category: it.category, description: it.description, qty: Number(it.qty), cost: Number(it.cost), sortOrder: it.sortOrder }))}
                  stages={stages.map((s) => ({ id: s.id, name: s.name }))}
                  quotations={quotations.filter((q) => ["accepted", "approved", "converted"].includes(q.status)).map((q) => ({ id: q.id, documentNo: q.documentNo, grandTotal: Number(q.grandTotal) }))}
                  isLocked={projectBudget.isLocked}
                  canEdit={canEdit}
                  canManage={canManageBudget}
                  pendingProposal={pendingProposal}
                />
              </>
            ) : (
              <div className="bg-surface rounded-xl border border-default shadow-sm p-5">
                <span className="text-sm font-semibold text-muted-foreground">RAB vs Realisasi</span>
                <p className="mt-3 text-sm text-muted-foreground">Belum ada data RAB untuk proyek ini</p>
              </div>
            ),
          },
          {
            id: "quotations",
            label: `Penawaran (${quotations.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
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
                            <DetailTableTd className="font-mono"><Link href={entityHref("/penjualan/penawaran", q)}>{q.documentNo}</Link></DetailTableTd>
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
            label: `Faktur (${invoices.length})`,
            content: (
              <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Tagihan & Pembayaran</h2>
                  <Link href={`/penjualan/faktur?cari=${project.customer.name}`} className="text-[0.8125rem] text-primary font-medium hover:underline">Lihat Semua →</Link>
                </div>
                <div className="p-4 px-5">
                  {invoices.length === 0 ? (
                    <p className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">Belum ada faktur</p>
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
                            <DetailTableTd className="font-mono"><Link href={entityHref("/penjualan/faktur", inv)}>{inv.documentNo}</Link></DetailTableTd>
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
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 px-5 border-b border-default">
                  <h2 className="text-[0.9375rem] font-semibold text-foreground">Log Aktivitas</h2>
                </div>
                <ProjectLogForm projectId={project.id} />
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
