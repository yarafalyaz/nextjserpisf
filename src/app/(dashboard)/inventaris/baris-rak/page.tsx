export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import Link from "next/link"
import { RackRowTable } from "./_components/rack-row-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { CanCreate } from "@/components/auth/can-create"
import { Plus, Grid3X3, Layers } from "@/components/ui/fontawesome-icons"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
export const metadata: Metadata = { title: "Baris Rak (Bin Location)" }

export default async function RackRowsPage({
  searchParams,
}: {
  searchParams: Promise<{
    cari?: string
    halaman?: string
    pageSize?: string
  }>
}) {
  await requirePermission("view_racks")

  const params = await searchParams
  const cari = params.cari?.trim()

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...(cari && {
      OR: [
        { name: { contains: cari } },
        { code: { contains: cari } },
        { rack: { name: { contains: cari } } },
        { rack: { code: { contains: cari } } },
        { rack: { warehouse: { name: { contains: cari } } } },
      ],
    }),
  }

  const [rackRows, total, allRackRowsCount, allRacksCount, allActiveStockMoves] =
    await Promise.all([
      prisma.rackRow.findMany({
        where,
        include: {
          rack: {
            include: {
              warehouse: { select: { id: true, name: true, slug: true, code: true } },
            },
          },
        },
        take,
        skip: (page - 1) * pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.rackRow.count({ where }),
      prisma.rackRow.count(),
      prisma.rack.count(),
      prisma.stockMove.groupBy({
        by: ["rackRowId", "itemId", "impact"],
        where: {
          rackRowId: { not: null },
          status: "posted",
        },
        _sum: { qty: true },
      }),
    ])

  // Calculate active SKU count per rackRowId across warehouse
  const rowItemNetQty = new Map<string, number>()
  for (const move of allActiveStockMoves) {
    if (!move.rackRowId) continue
    const key = `${move.rackRowId}:${move.itemId}`
    const prev = rowItemNetQty.get(key) ?? 0
    const delta = Number(move._sum.qty || 0)
    rowItemNetQty.set(key, move.impact === "IN" ? prev + delta : prev - delta)
  }

  const skuCountByRow = new Map<number, number>()
  for (const [key, qty] of rowItemNetQty.entries()) {
    if (qty > 0) {
      const [rowIdStr] = key.split(":")
      const rowId = Number(rowIdStr)
      skuCountByRow.set(rowId, (skuCountByRow.get(rowId) ?? 0) + 1)
    }
  }

  const occupiedRowsCount = skuCountByRow.size
  const emptyRowsCount = Math.max(0, allRackRowsCount - occupiedRowsCount)

  const enrichedRows = rackRows.map((r) => ({
    ...r,
    activeSkuCount: skuCountByRow.get(r.id) ?? 0,
  }))

  const tableData = toPlain(enrichedRows)

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs
        items={[
          { label: "Dasbor", href: "/" },
          { label: "Inventaris", href: "/inventaris" },
          { label: "Rak", href: "/inventaris/rak" },
          { label: "Baris Rak" },
        ]}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Rak & Lokasi Bin Gudang
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 text-pretty">
            Manajemen terpadu topologi penyimpanan fisik gudang: struktur lorong rak induk dan titik koordinat baris bin.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CanCreate permission="create_warehouses">
            <Link
              href="/inventaris/rak/tambah"
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer shadow-2xs"
              id="create-rack-shortcut-btn"
            >
              <Plus className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span>Tambah Rak</span>
            </Link>
          </CanCreate>
          <CanCreate permission="manage_inventory">
            <Link
              href="/inventaris/baris-rak/tambah"
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 min-h-11 sm:min-h-9 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer shadow-2xs"
              id="create-rack-row-btn"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              <span>Tambah Baris Rak (Bin)</span>
            </Link>
          </CanCreate>
        </div>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Baris Rak / Bin
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-foreground">
              {allRackRowsCount}
            </span>
            <span className="text-xs text-muted-foreground">titik simpan</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Baris Terisi Stok
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
              {occupiedRowsCount}
            </span>
            <span className="text-xs text-muted-foreground">lokasi aktif</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Baris Kosong
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-amber-600 dark:text-amber-400">
              {emptyRowsCount}
            </span>
            <span className="text-xs text-muted-foreground">siap penempatan</span>
          </div>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Rak Induk
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight tabular-nums text-primary">
              {allRacksCount}
            </span>
            <span className="text-xs text-muted-foreground">unit rak</span>
          </div>
        </div>
      </div>

      {/* Unified WMS Segmented View Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div
          role="tablist"
          aria-label="Mode tampilan lokasi penyimpanan"
          className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-1 text-xs self-start"
        >
          <Link
            href="/inventaris/rak"
            role="tab"
            aria-selected={false}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <Grid3X3 className="size-3.5" aria-hidden="true" />
            <span>Struktur Rak Induk</span>
            <span className="ml-0.5 rounded bg-muted px-1.5 py-0.2 font-mono text-[11px] text-muted-foreground tabular-nums">
              {allRacksCount}
            </span>
          </Link>
          <Link
            href="/inventaris/baris-rak"
            role="tab"
            aria-selected={true}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-md font-semibold bg-card text-foreground shadow-2xs transition-colors cursor-pointer"
          >
            <Layers className="size-3.5 text-primary" aria-hidden="true" />
            <span>Semua Baris Rak / Bin</span>
            <span className="ml-0.5 rounded bg-primary/10 px-1.5 py-0.2 font-mono text-[11px] font-semibold text-primary tabular-nums">
              {allRackRowsCount}
            </span>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Menampilkan daftar seluruh koordinat baris bin lintas gudang beserta status okupansi stoknya.
        </p>
      </div>

      <RackRowTable data={tableData} total={total} page={page} pageSize={pageSize} />
    </div>
  )
}
