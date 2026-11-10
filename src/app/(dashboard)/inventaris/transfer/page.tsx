export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import { requirePermission } from "@/lib/auth/permissions"
import { getWarehouseScope } from "@/lib/auth/warehouse-scope"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { statusLabel, statusToIndo, indoToStatus } from "@/lib/utils/status-labels"
import { AppSearchField } from "@/components/ui/search-field"
import { TransferTable } from "./_components/transfer-table"
import { InventoryTransferUnreceivedQueueCard } from "@/components/reports/inventory-transfer-unreceived-queue-card"
import { getInventoryTransferUnreceivedQueue } from "@/lib/reports/inventory-transfer-unreceived-queue-data"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Transfer Stok" }

export const INVENTORY_TRANSFER_VALID_DB_STATUSES = [
  "draft",
  "in_transit",
  "completed",
] as const

export interface InventoryTransfersPageProps {
  statusParam?: string
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}

export async function renderInventoryTransfersPage({
  statusParam,
  searchParams,
}: InventoryTransfersPageProps) {
  const user = await requirePermission("view_inventory_transfers")
  const scope = await getWarehouseScope({ id: user.id, roles: user.roles ?? [] })
  // ROUND5-SCOPE: transfer terlihat bila gudang asal ATAU tujuan dalam cakupan.
  const scopeClause =
    scope.kind === "assigned"
      ? [{ OR: [{ sourceWarehouseId: { in: scope.warehouseIds } }, { destinationWarehouseId: { in: scope.warehouseIds } }] }]
      : scope.kind === "none"
        ? [{ sourceWarehouseId: { in: [] as number[] } }]
        : []

  const params = await searchParams

  if (!statusParam && params.status) {
    const targetStatus = params.status
    const query = new URLSearchParams()
    if (params.cari) query.set("cari", params.cari)
    if (params.halaman) query.set("halaman", params.halaman)
    if (params.pageSize) query.set("pageSize", params.pageSize)
    const qs = query.toString()
    redirect(`/inventaris/transfer/status/${targetStatus}${qs ? `?${qs}` : ""}`)
  }

  const validUrlStatuses = INVENTORY_TRANSFER_VALID_DB_STATUSES.map(
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
      ],
    }),
    ...(dbStatus && { status: dbStatus }),
    ...(scopeClause.length > 0 && { AND: scopeClause }),
  }

  const [transfers, total, unreceivedQueue] = await Promise.all([
    prisma.inventoryTransfer.findMany({
      where,
      include: { sourceWarehouse: true, destinationWarehouse: true },
      take,
      skip: (page - 1) * pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.inventoryTransfer.count({ where }),
    getInventoryTransferUnreceivedQueue(),
  ])

  const tableData = toPlain(transfers)

  const statusChips = ["", ...INVENTORY_TRANSFER_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus
      ? `/inventaris/transfer/status/${urlStatus}`
      : "/inventaris/transfer"
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
    ? `/inventaris/transfer/status/${activeUrlStatus}`
    : "/inventaris/transfer"

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={
          activeUrlStatus
            ? [
                { label: "Dasbor", href: "/" },
                { label: "Inventaris", href: "/inventaris" },
                { label: "Transfer", href: "/inventaris/transfer" },
                { label: statusLabel(dbStatus ?? activeUrlStatus) },
              ]
            : [
                { label: "Dasbor", href: "/" },
                { label: "Inventaris", href: "/inventaris" },
                { label: "Transfer" },
              ]
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Transfer Inventaris</h1>
        <CanCreate permission="create_inventory_transfers">
          <Link
            href="/inventaris/transfer/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all"
            id="create-transfer-btn"
          >
            + Buat Transfer
          </Link>
        </CanCreate>
      </div>

      <InventoryTransferUnreceivedQueueCard queue={unreceivedQueue} />

      <TransferTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={
          <AppSearchField
            placeholder="Cari no. dokumen..."
            action={currentActionPath}
          />
        }
        filters={<div className="flex gap-1.5 flex-wrap">{statusChips}</div>}
      />
    </div>
  )
}

export default async function InventoryTransfersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  return renderInventoryTransfersPage({ searchParams })
}
