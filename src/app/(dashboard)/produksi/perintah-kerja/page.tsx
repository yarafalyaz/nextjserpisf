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
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"

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

  const [queue, load, loadPlan, centers, canEditCenters, closeoutQueue, canCloseWorkOrder, canCloseProductionOrder, operationQueue] =
    await Promise.all([
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

  const tableData = toPlain(workOrders)

  const statusChips = ["", ...WORK_ORDER_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus
      ? `/produksi/perintah-kerja/status/${urlStatus}`
      : "/produksi/perintah-kerja"
    const isActive = activeUrlStatus === urlStatus

    return (
      <Link
        key={dbStatusKey}
        href={withListParams(targetPath, params, { halaman: undefined })}
        className={`filter-chip ${isActive ? "active" : ""}`}
      >
        {dbStatusKey ? statusLabel(dbStatusKey) : "Semua"}
      </Link>
    )
  })

  const currentActionPath = activeUrlStatus
    ? `/produksi/perintah-kerja/status/${activeUrlStatus}`
    : "/produksi/perintah-kerja"

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={
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
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Perintah Kerja</h1>
        <CanCreate permission="create_work_orders">
          <Link
            href="/produksi/perintah-kerja/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            id="create-wo-btn"
          >
            + Buat Perintah Kerja
          </Link>
        </CanCreate>
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
