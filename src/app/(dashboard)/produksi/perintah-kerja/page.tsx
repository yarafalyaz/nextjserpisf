export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { WorkOrderTable } from "./_components/work-order-table"
import { WorkOrderQueueCard } from "@/components/reports/work-order-queue-card"
import { getWorkOrderQueue } from "@/lib/reports/work-order-queue-data"
import { WorkshopCloseoutQueueCard } from "@/components/reports/workshop-closeout-queue-card"
import { getWorkshopCloseoutQueue } from "@/lib/reports/workshop-closeout-queue-data"
import { WorkOrderLoadCard } from "@/components/reports/work-order-load-card"
import { getWorkOrderLoad } from "@/lib/reports/work-order-load-data"
import { WorkCenterLoadPlanCard } from "@/components/reports/work-center-load-plan-card"
import { getWorkCenterLoadPlan, getWorkCenters } from "@/lib/reports/work-center-load-plan-data"
import { WorkOrderOperationQueueSection } from "./_components/work-order-operation-queue"
import { getWorkOrderOperationQueue } from "@/lib/reports/work-order-operation-queue-data"
import { WorkCenterMaster } from "@/components/manufacturing/work-center-master"
import { hasPermission } from "@/lib/auth/permissions"
import { CanCreate } from "@/components/auth/can-create"
import { PageHeader } from "@/components/ui/page-header"
import { Plus, ClipboardList, Clock, CheckCircle2, FileText } from "@/components/ui/fontawesome-icons"
import { formatNumber } from "@/lib/utils/format"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Perintah Kerja" }

export const WORK_ORDER_VALID_DB_STATUSES = [
  "draft",
  "in_progress",
  "completed",
] as const

export interface WorkOrdersPageProps {
  statusParam?: string
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}

export async function renderWorkOrdersPage({
  statusParam,
  searchParams,
}: WorkOrdersPageProps) {
  await requirePermission("view_work_orders")

  const params = await searchParams

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/produksi/perintah-kerja/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  const validUrlStatuses = WORK_ORDER_VALID_DB_STATUSES.map(
    (s) => statusToIndo[s] || s,
  )

  if (statusParam && !validUrlStatuses.includes(statusParam)) {
    notFound()
  }

  const activeUrlStatus = statusParam ?? ""
  const dbStatus = activeUrlStatus ? indoToStatus[activeUrlStatus] || activeUrlStatus : undefined

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
        { customer: { name: { contains: params.cari } } },
      ],
    }),
    ...(dbStatus && { status: dbStatus }),
  }

  const workOrders = await prisma.workOrder.findMany({
    where,
    include: { customer: true },
    orderBy: { createdAt: "desc" },
    take,
    skip: (page - 1) * pageSize,
  })

  const total = await prisma.workOrder.count({ where })

  const [
    countsByStatus,
    queue,
    load,
    loadPlan,
    centers,
    canEditCenters,
    closeoutQueue,
    canCloseWorkOrder,
    canCloseProductionOrder,
    operationQueue,
  ] = await Promise.all([
    prisma.workOrder.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    getWorkOrderQueue(),
    getWorkOrderLoad(),
    getWorkCenterLoadPlan(),
    getWorkCenters(),
    hasPermission("edit_work_orders"),
    getWorkshopCloseoutQueue(),
    hasPermission("complete_work_orders"),
    // Izin tutup PO = izin server closeProductionOrder (edit_production_orders);
    // tidak ada complete_production_orders di katalog. Server tetap penegak.
    hasPermission("edit_production_orders"),
    getWorkOrderOperationQueue(),
  ])

  const statusCountMap = countsByStatus.reduce<Record<string, number>>((acc, curr) => {
    acc[curr.status] = curr._count._all
    return acc
  }, {})
  const totalAllOrders = countsByStatus.reduce((acc, curr) => acc + curr._count._all, 0)

  const tableData = toPlain(workOrders)

  const statusChips = ["", ...WORK_ORDER_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus
      ? `/produksi/perintah-kerja/status/${urlStatus}`
      : "/produksi/perintah-kerja"
    const isActive = activeUrlStatus === urlStatus
    const count = dbStatusKey ? (statusCountMap[dbStatusKey] ?? 0) : totalAllOrders

    return (
      <Link
        key={dbStatusKey}
        href={withListParams(targetPath, params, { halaman: undefined })}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
          isActive
            ? "border-primary bg-primary/10 text-primary font-semibold"
            : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <span>{dbStatusKey ? statusLabel(dbStatusKey) : "Semua"}</span>
        <span
          className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-2xs font-mono tabular-nums ${
            isActive
              ? "bg-primary text-primary-foreground font-bold"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {formatNumber(count)}
        </span>
      </Link>
    )
  })

  const currentActionPath = activeUrlStatus
    ? `/produksi/perintah-kerja/status/${activeUrlStatus}`
    : "/produksi/perintah-kerja"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Perintah Kerja"
        subtitle="Manajemen dan eksekusi perintah kerja manufaktur dan perakitan bengkel"
        breadcrumbs={
          activeUrlStatus
            ? [
                { label: "Dasbor", href: "/" },
                { label: "Manufaktur", href: "/produksi" },
                { label: "Perintah Kerja", href: "/produksi/perintah-kerja" },
                { label: statusLabel(dbStatus ?? activeUrlStatus) },
              ]
            : [
                { label: "Dasbor", href: "/" },
                { label: "Manufaktur", href: "/produksi" },
                { label: "Perintah Kerja" },
              ]
        }
        actions={
          <CanCreate permission="create_work_orders">
            <Link
              href="/produksi/perintah-kerja/tambah"
              className="inline-flex min-h-11 sm:min-h-9 items-center justify-center gap-1.5 px-3.5 py-2 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
              id="create-wo-btn"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              <span>Buat Perintah Kerja</span>
            </Link>
          </CanCreate>
        }
      />

      {/* ERP Unified Metric Strip (Non-Floating Linear Standard) */}
      <div
        className="grid grid-cols-1 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs sm:grid-cols-4"
        aria-label="Ringkasan status perintah kerja"
      >
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total WO</span>
            <ClipboardList className="size-4 text-primary/70" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(totalAllOrders)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Seluruh arsip perintah kerja</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Konsep</span>
            <FileText className="size-4 text-amber-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(statusCountMap["draft"] ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Menunggu rilis & jadwal</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Dalam Proses</span>
            <Clock className="size-4 text-blue-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(statusCountMap["in_progress"] ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Sedang dikerjakan di bengkel</p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Selesai</span>
            <CheckCircle2 className="size-4 text-emerald-500/80" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {formatNumber(statusCountMap["completed"] ?? 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Pekerjaan rampung</p>
        </div>
      </div>

      <WorkOrderQueueCard queue={queue} />

      <WorkOrderOperationQueueSection queue={operationQueue} />

      <WorkshopCloseoutQueueCard
        queue={closeoutQueue}
        canCloseWorkOrder={canCloseWorkOrder}
        canCloseProductionOrder={canCloseProductionOrder}
      />

      <WorkOrderLoadCard load={load} />

      <WorkCenterLoadPlanCard plan={loadPlan} />

      {canEditCenters ? <WorkCenterMaster centers={centers} /> : null}

      <WorkOrderTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <AppSearchField
            placeholder="Cari no. dokumen atau pelanggan..."
            action={currentActionPath}
          />
        }
        filters={<div className="flex gap-1.5 flex-wrap">{statusChips}</div>}
      />
    </div>
  )
}

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  return renderWorkOrdersPage({ searchParams })
}
