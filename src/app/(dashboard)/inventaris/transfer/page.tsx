import { Plus, ArrowLeftRight, Clock, Truck, CheckCircle2 } from "@/components/ui/fontawesome-icons";
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

  const [transfers, total, statusGroups, unreceivedQueue] = await Promise.all([
    prisma.inventoryTransfer.findMany({
      where,
      include: { sourceWarehouse: true, destinationWarehouse: true },
      take,
      skip: (page - 1) * pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.inventoryTransfer.count({ where }),
    prisma.inventoryTransfer.groupBy({
      by: ["status"],
      where: { ...(scopeClause.length > 0 && { AND: scopeClause }), deletedAt: null },
      _count: { _all: true },
    }),
    getInventoryTransferUnreceivedQueue(),
  ])

  const counts: Record<string, number> = {
    all: statusGroups.reduce((acc, curr) => acc + curr._count._all, 0),
    draft: 0,
    in_transit: 0,
    completed: 0,
  }
  for (const group of statusGroups) {
    if (group.status in counts) {
      counts[group.status] = group._count._all
    }
  }

  const tableData = toPlain(transfers)

  const statusChips = ["", ...INVENTORY_TRANSFER_VALID_DB_STATUSES].map((dbStatusKey) => {
    const urlStatus = dbStatusKey ? statusToIndo[dbStatusKey] || dbStatusKey : ""
    const targetPath = urlStatus
      ? `/inventaris/transfer/status/${urlStatus}`
      : "/inventaris/transfer"
    const isActive = activeUrlStatus === urlStatus
    const count = dbStatusKey ? (counts[dbStatusKey] ?? 0) : counts.all

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
          {count}
        </span>
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Transfer Stok Antar Gudang
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Pengiriman barang antar lokasi fasilitas, pemantauan barang dalam perjalanan (in-transit), dan bukti serah terima.
          </p>
        </div>
        <CanCreate permission="create_inventory_transfers">
          <Link
            href="/inventaris/transfer/tambah"
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs cursor-pointer"
            id="create-transfer-btn"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Buat Transfer</span>
          </Link>
        </CanCreate>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Transfer
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
              {counts.all}
            </span>
            <ArrowLeftRight className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Seluruh riwayat perpindahan</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Konsep (Draft)
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 font-mono tabular-nums">
              {counts.draft}
            </span>
            <Clock className="size-4 text-amber-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Menunggu persetujuan pengiriman</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Dalam Perjalanan
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-primary font-mono tabular-nums">
              {counts.in_transit}
            </span>
            <Truck className="size-4 text-primary/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Telah keluar dari gudang asal</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Selesai Diterima
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              {counts.completed}
            </span>
            <CheckCircle2 className="size-4 text-emerald-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Telah masuk ke gudang tujuan</span>
        </div>
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
