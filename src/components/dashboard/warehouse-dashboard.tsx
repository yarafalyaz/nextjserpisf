import { prisma } from "@/lib/db/prisma"
import { getWarehouseScope } from "@/lib/auth/warehouse-scope"
import { formatDate } from "@/lib/utils/format"
import Link from "next/link"
import {
  Package,
  ScanBarcode,
  BarChart3,
  Scale,
  ArrowLeftRight,
  Wrench,
  Grid3X3,
  AlertTriangle,
  ArrowUpRight,
  Building2,
  PackageCheck,
} from "lucide-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card"
import { Button } from "@/components/ui/shadcn/button"
import { Badge } from "@/components/ui/shadcn/badge"
import { StatCard } from "@/components/ui/empty-state"

type LowStockItem = { id: number; name: string; sku: string; qtyOnHand: number; minStock: number }

async function getWarehouseData(user: { id: string; roles: string[] }) {
  // Putaran 77: dashboard gudang wajib menghormati WarehouseScope. Jalur lama
  // menampilkan mutasi/penerimaan/jumlah SEMUA gudang ke pemegang peran
  // `warehouse` — termasuk yang scope dokumennya `none` (tanpa penugasan) —
  // membocorkan nama gudang lain dan aktivitas lintas gudang.
  const scope = await getWarehouseScope(user)

  if (scope.kind === "none") {
    return {
      lowStockItems: [] as LowStockItem[],
      lowStockCount: 0,
      recentMoves: [],
      warehouseCount: 0,
      pendingReceipts: 0,
      totalItems: 0,
    }
  }

  const scoped = scope.kind === "assigned"
  const warehouseIds = scoped ? scope.warehouseIds : []

  const [recentMoves, pendingReceipts] = await Promise.all([
    prisma.stockMove.findMany({
      where: { status: "posted", ...(scoped ? { warehouseId: { in: warehouseIds } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        item: { select: { name: true, sku: true } },
        warehouse: { select: { name: true } },
      },
    }),
    prisma.goodsReceipt.count({
      where: { status: "draft", ...(scoped ? { warehouseId: { in: warehouseIds } } : {}) },
    }),
  ])

  const warehouseCount = scoped
    ? warehouseIds.length
    : await prisma.warehouse.count({ where: { isActive: true, deletedAt: null } })

  if (!scoped) {
    // Putaran 88: total kartu dari COUNT terpisah — daftar tetap sampel 8.
    const [lowStockItems, lowStockCountRows, totalItems] = await Promise.all([
      prisma.$queryRaw<LowStockItem[]>`
        SELECT id, name, sku, qty_on_hand as qtyOnHand, min_stock as minStock
        FROM items
        WHERE is_active = true
          AND min_stock > 0
          AND qty_on_hand <= min_stock
          AND deleted_at IS NULL
        ORDER BY qty_on_hand ASC
        LIMIT 8
      `,
      prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM items
        WHERE is_active = true
          AND min_stock > 0
          AND qty_on_hand <= min_stock
          AND deleted_at IS NULL
      `,
      prisma.item.count({ where: { isActive: true, deletedAt: null } }),
    ])
    const lowStockCount = Number(lowStockCountRows[0]?.count ?? 0)
    return { lowStockItems, lowStockCount, recentMoves, warehouseCount, pendingReceipts, totalItems }
  }

  // Stok per gudang kanonis = sisa InventoryLayer per (item, gudang);
  // minimum efektif = override ItemWarehouseSetting.minStock, warisi
  // Item.minStock bila NULL (BR-ROP-01). Item.qty_on_hand global TIDAK
  // boleh dipakai menyaring per gudang.
  const [layers, settings, totalRows] = await Promise.all([
    prisma.inventoryLayer.groupBy({
      by: ["itemId"],
      where: { warehouseId: { in: warehouseIds }, remaining: { gt: 0 } },
      _sum: { remaining: true },
    }),
    prisma.itemWarehouseSetting.findMany({
      where: { warehouseId: { in: warehouseIds } },
      select: { itemId: true, minStock: true },
    }),
    prisma.inventoryLayer.findMany({
      where: { warehouseId: { in: warehouseIds } },
      select: { itemId: true },
      distinct: ["itemId"],
    }),
  ])

  const minByItem = new Map<number, number>()
  for (const s of settings) {
    if (s.minStock != null) minByItem.set(s.itemId, Number(s.minStock))
  }
  const qtyByItem = new Map<number, number>()
  for (const l of layers) {
    qtyByItem.set(l.itemId, Number(l._sum.remaining ?? 0))
  }
  const candidateIds = [...new Set([...qtyByItem.keys(), ...minByItem.keys()])]
  const items = candidateIds.length
    ? await prisma.item.findMany({
        where: { id: { in: candidateIds }, isActive: true, deletedAt: null },
        select: { id: true, name: true, sku: true, minStock: true },
      })
    : []
  const lowStockAll: LowStockItem[] = items
    .map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      qtyOnHand: qtyByItem.get(item.id) ?? 0,
      minStock: minByItem.get(item.id) ?? Number(item.minStock),
    }))
    .filter((row) => row.minStock > 0 && row.qtyOnHand <= row.minStock)
    .sort((a, b) => a.qtyOnHand - b.qtyOnHand)
  // Putaran 88: kartu menampilkan total penuh; daftar tetap 8 teratas.
  const lowStockItems = lowStockAll.slice(0, 8)

  return {
    lowStockItems,
    lowStockCount: lowStockAll.length,
    recentMoves,
    warehouseCount,
    pendingReceipts,
    totalItems: totalRows.length,
  }
}

export default async function WarehouseDashboard({
  user,
}: {
  user: { id: string; roles: string[] }
}) {
  const data = await getWarehouseData(user)
  const today = new Date().toLocaleDateString("id-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  const quickLinks = [
    { label: "Scan Barang", href: "/inventaris/scan", icon: ScanBarcode, desc: "Scan barang" },
    { label: "Mutasi Stok", href: "/inventaris/mutasi-stok", icon: BarChart3, desc: "Pergerakan stok" },
    { label: "Penyesuaian", href: "/inventaris/penyesuaian", icon: Scale, desc: "Penyesuaian stok" },
    { label: "Transfer", href: "/inventaris/transfer", icon: ArrowLeftRight, desc: "Transfer stok" },
    { label: "Pengeluaran", href: "/inventaris/pengeluaran-material", icon: Wrench, desc: "Pengeluaran material" },
    { label: "Rak", href: "/inventaris/rak", icon: Grid3X3, desc: "Kelola rak" },
  ]

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="px-4 text-xs text-muted-foreground lg:px-6">{today}</div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 px-4 lg:grid-cols-4 lg:px-6">
            <StatCard label="Total Item" value={data.totalItems} icon={<Package className="size-5" />} />
            <StatCard label="Stok Menipis" value={data.lowStockCount} icon={<AlertTriangle className="size-5" />} trend="down" />
            <StatCard label="Gudang" value={data.warehouseCount} icon={<Building2 className="size-5" />} />
            <StatCard label="Penerimaan Menunggu" value={data.pendingReceipts} icon={<PackageCheck className="size-5" />} />
          </div>

          {/* Low stock + Recent moves */}
          <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6">
            {/* Low stock */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="size-4 text-amber-500" />
                  Stok Menipis
                </CardTitle>
                <CardDescription>Item dengan stok di bawah minimum</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/master/barang">Semua</Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y border-t">
                  {data.lowStockItems.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                      Semua stok aman
                    </p>
                  ) : (
                    data.lowStockItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.sku}</p>
                        </div>
                        <Badge
                          variant="outline"
                          className="shrink-0 border-transparent bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                        >
                          {Number(item.qtyOnHand)} / {Number(item.minStock)}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recent stock moves */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <BarChart3 className="size-4 text-primary" />
                  Mutasi Stok Terbaru
                </CardTitle>
                <CardDescription>8 pergerakan stok terakhir</CardDescription>
                <CardAction>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/inventaris/mutasi-stok">
                      Semua <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y border-t">
                  {data.recentMoves.length === 0 ? (
                    <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                      Belum ada mutasi stok
                    </p>
                  ) : (
                    data.recentMoves.map((move) => (
                      <div key={move.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{move.item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {move.warehouse?.name || "-"} — {move.moveType || "-"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs tabular-nums font-medium">
                            {Number(move.qty)} {move.item.sku}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatDate(move.createdAt, { format: "short" })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Links */}
          <div className="px-4 lg:px-6">
            <h2 className="mb-3 text-sm font-semibold">Menu Cepat</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex flex-col items-center gap-1.5 rounded-lg border p-4 text-center transition-colors hover:bg-accent"
                >
                  <link.icon className="size-5 text-primary" />
                  <span className="text-xs font-medium">{link.label}</span>
                  <span className="text-[10px] text-muted-foreground">{link.desc}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
