export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission } from "@/lib/auth/permissions"
import Link from "next/link"
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

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cari?: string 
  halaman?: string
  pageSize?: string}>
}) {
  await requirePermission("view_work_orders")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)
  const dbStatusParam = params.status ? indoToStatus[params.status] : undefined

  const where = {
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
        { customer: { name: { contains: params.cari } } },
      ],
    }),
    ...((dbStatusParam || params.status) && { status: dbStatusParam || params.status }),
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

  const statusChips = ["", "draft", "in_progress", "completed"].map((dbStatus) => {
    const urlStatus = dbStatus ? statusToIndo[dbStatus] || dbStatus : ""
    return (
      <Link
        key={dbStatus}
        href={`/produksi/perintah-kerja${urlStatus ? `?status=${urlStatus}` : ""}`}
        className={`filter-chip ${params.status === urlStatus || (!params.status && !urlStatus) ? "active" : ""}`}
      >
        {dbStatus ? statusLabel(dbStatus) : "Semua"}
      </Link>
    )
  })

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
  { label: "Dasbor", href: "/" },
  { label: "Manufaktur", href: "/produksi" },
  { label: "Perintah Kerja" },
]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Perintah Kerja</h1>
        <CanCreate permission="create_work_orders">
          <Link href="/produksi/perintah-kerja/tambah" className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all" id="create-wo-btn">
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
        toolbar={<AppSearchField placeholder="Cari no. dokumen atau pelanggan..." action="/produksi/perintah-kerja" />}
        filters={<div className="flex gap-1.5 flex-wrap">{statusChips}</div>}
      />
    </div>
  )
}
