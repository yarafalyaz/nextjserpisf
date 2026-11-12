export const dynamic = "force-dynamic"

import { StockMoveImpact } from "@prisma/client"
import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { withListParams } from "@/lib/utils/list-href"
import { requirePermission } from "@/lib/auth/permissions"
import { getWarehouseScope } from "@/lib/auth/warehouse-scope"
import { AppSearchField } from "@/components/ui/search-field"
import Link from "next/link"
import { Boxes, ArrowDown, ArrowUp } from "@/components/ui/fontawesome-icons"
import { StockMoveTable } from "./_components/stock-move-table"
import { resolveReferenceSlugs, referenceSlugKey } from "@/lib/services/reference-slug.service"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Mutasi Stok" }

export default async function StockMovesPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; dampak?: string 
  halaman?: string
  pageSize?: string}>
}) {
  const user = await requirePermission("view_stock_moves")
  const scope = await getWarehouseScope({ id: user.id, roles: user.roles ?? [] })
  // ROUND5-SCOPE: daftar hanya menampilkan dokumen gudang dalam cakupan.
  const scopeWhere = scope.kind === "assigned"
    ? { warehouseId: { in: scope.warehouseIds } }
    : scope.kind === "none"
      ? { warehouseId: { in: [] as number[] } }
      : {}

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

  const where = {
    ...scopeWhere,
    ...(params.cari && {
      OR: [
        { documentNo: { contains: params.cari } },
        { item: { name: { contains: params.cari } } },
        { warehouse: { name: { contains: params.cari } } },
      ],
    }),
    ...(params.dampak === "masuk" ? { impact: StockMoveImpact.IN } : {}),
    ...(params.dampak === "keluar" ? { impact: StockMoveImpact.OUT } : {}),
  }

  const [rawMoves, total, impactGroups] = await Promise.all([
    prisma.stockMove.findMany({
      where,
      include: { item: true, warehouse: true },
      take,
      skip: (page - 1) * pageSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.stockMove.count({ where }),
    prisma.stockMove.groupBy({
      by: ["impact"],
      where: scopeWhere,
      _count: { id: true },
    }),
  ])

  const counts: Record<string, number> = {
    all: impactGroups.reduce((acc, curr) => acc + (curr._count?.id ?? 0), 0),
    masuk: 0,
    keluar: 0,
  }
  for (const group of impactGroups) {
    if (group.impact === StockMoveImpact.IN) {
      counts.masuk = group._count?.id ?? 0
    } else if (group.impact === StockMoveImpact.OUT) {
      counts.keluar = group._count?.id ?? 0
    }
  }

  // AC-INV-009: slug kanonis dokumen sumber untuk tautan referensi di tabel.
  const referenceSlugs = await resolveReferenceSlugs(rawMoves)
  const tableData = toPlain(rawMoves).map((move) => ({
    ...move,
    referenceSlug: move.referenceId != null
      ? referenceSlugs.get(referenceSlugKey(move)) ?? null
      : null,
  }))

  const dampakFilter = (() => {
    const items: { label: string; url: string; check: string; count: number }[] = [
      { label: "Semua", url: "", check: "", count: counts.all },
      { label: "Masuk", url: "masuk", check: "masuk", count: counts.masuk },
      { label: "Keluar", url: "keluar", check: "keluar", count: counts.keluar },
    ]
    return (
      <div className="flex gap-1.5 flex-wrap">
        {items.map((item) => {
          const isActive = params.dampak === item.check || (!params.dampak && !item.check)
          return (
            <Link
              key={item.label}
              href={withListParams("/inventaris/mutasi-stok", params, { dampak: item.url || undefined, halaman: undefined })}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                isActive
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span>{item.label}</span>
              <span
                className={`inline-flex items-center justify-center px-1.5 py-0.2 rounded-full text-2xs font-mono tabular-nums ${
                  isActive
                    ? "bg-primary text-primary-foreground font-bold"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {item.count}
              </span>
            </Link>
          )
        })}
      </div>
    )
  })()

  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[
        { label: "Dasbor", href: "/" },
        { label: "Inventaris", href: "/inventaris" },
        { label: "Mutasi Stok" },
      ]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between pb-2 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance">
            Pergerakan & Mutasi Stok (Stock Moves)
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
            Buku besar fisik logistik, riwayat penambahan dan pengurangan kuantitas inventaris gudang secara realtime.
          </p>
        </div>
      </div>

      {/* Executive KPI Metric Strip Standar ERP */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border rounded-lg border border-border bg-card shadow-2xs overflow-hidden">
        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Total Pergerakan
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-foreground font-mono tabular-nums">
              {counts.all}
            </span>
            <Boxes className="size-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Seluruh mutasi tercatat</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Barang Masuk (IN)
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
              {counts.masuk}
            </span>
            <ArrowDown className="size-4 text-emerald-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Penerimaan & penyesuaian masuk</span>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Barang Keluar (OUT)
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 font-mono tabular-nums">
              {counts.keluar}
            </span>
            <ArrowUp className="size-4 text-amber-500/70" aria-hidden="true" />
          </div>
          <span className="text-2xs text-muted-foreground">Pengiriman, konsumsi & retur</span>
        </div>
      </div>

      <StockMoveTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={<AppSearchField placeholder="Cari no. dokumen, barang, atau gudang..." action="/inventaris/mutasi-stok" />}
        filters={<div className="flex gap-1.5 flex-wrap">{dampakFilter}</div>}
      />
    </div>
  )
}
