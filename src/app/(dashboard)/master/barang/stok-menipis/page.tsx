export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { AppSearchField } from "@/components/ui/search-field"
import { ItemTable } from "../_components/item-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Button } from "@/components/ui/button"
import { FormSelect } from "@/components/ui/form-select"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Stok Menipis" }

export default async function LowStockItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; category?: string; halaman?: string; pageSize?: string }>
}) {
  await requirePermission("view_items")
  const canCreate = await hasPermission("create_items")

  const params = await searchParams

  const { page, pageSize, take } = parsePagination(params)

  // Prisma tak bisa banding kolom-vs-kolom (qty_on_hand <= min_stock);
  // pakai raw query dengan kondisi sama persis seperti cron notifikasi
  // (is_active, min_stock>0, qty<=min, tak terhapus).
  const lowStockCond = "AND i.min_stock > 0 AND i.qty_on_hand <= i.min_stock"
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/%/g, "\\%").replace(/_/g, "\\_")
  const searchCond = params.cari
    ? `AND (i.sku LIKE '%${esc(params.cari)}%' ESCAPE '\\' OR i.name LIKE '%${esc(params.cari)}%' ESCAPE '\\')`
    : ""
  const catId = Number(params.category)
  const catCond = params.category && !Number.isNaN(catId) ? `AND i.category_id = ${catId}` : ""

  const [rawItems, categories] = await Promise.all([
    prisma.$queryRawUnsafe<
      Array<{
        id: number; slug: string; sku: string; name: string; image: string | null
        category: { id: number; name: string } | null
        warehouse: { name: string } | null; rack: { name: string } | null
        rackRow: { name: string } | null
        qtyOnHand: number; minStock: number; price: number
      }>
    >(
      `SELECT i.id, i.slug, i.sku, i.name, i.image,
        JSON_OBJECT('id', c.id, 'name', c.name) AS category,
        JSON_OBJECT('name', w.name) AS warehouse,
        JSON_OBJECT('name', r.name) AS rack,
        JSON_OBJECT('name', rr.name) AS rack_row,
        i.qty_on_hand AS qtyOnHand, i.min_stock AS minStock, i.price
       FROM items i
       LEFT JOIN item_categories c ON c.id = i.category_id
       LEFT JOIN warehouses w ON w.id = i.default_warehouse_id
       LEFT JOIN racks r ON r.id = i.default_rack_id
       LEFT JOIN rack_rows rr ON rr.id = i.default_rack_row_id
       WHERE i.is_active = true AND i.deleted_at IS NULL
       ${lowStockCond} ${searchCond} ${catCond}
       ORDER BY i.created_at DESC LIMIT ${take} OFFSET ${(page - 1) * pageSize}`,
    ),
    prisma.itemCategory.findMany({ orderBy: { name: "asc" } }),
  ])

  const total = Number(
    (
      await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) AS count FROM items i
         WHERE i.is_active = true AND i.deleted_at IS NULL
         ${lowStockCond} ${searchCond} ${catCond}`,
      )
    )[0]?.count ?? 0,
  )

  // JSON_OBJECT driver mariadb datang sebagai string — parse aman.
  const asObj = <T,>(v: unknown): T | null => {
    if (v == null) return null
    if (typeof v === "object") return v as T
    try {
      const o = JSON.parse(String(v)) as Record<string, unknown>
      return Object.values(o).every((x) => x == null) ? null : (o as T)
    } catch {
      return null
    }
  }

  const items = rawItems.map((item) => ({
    id: item.id,
    slug: item.slug,
    sku: item.sku,
    name: item.name,
    image: item.image,
    category: asObj<{ id: number; name: string }>(item.category),
    warehouse: asObj<{ name: string }>(item.warehouse),
    rack: asObj<{ name: string }>(item.rack),
    rackRow: asObj<{ name: string }>(item.rackRow),
    qtyOnHand: Number(item.qtyOnHand),
    minStock: Number(item.minStock),
    price: Number(item.price),
  }))

  const tableData = toPlain(items)


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={[{ label: "Dasbor", href: "/" }, { label: "Data Master", href: "/master" }, { label: "Barang", href: "/master/barang" }, { label: "Stok Menipis" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Stok Menipis</h1>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
            Stok menipis ({total})
          </span>
          {canCreate && (
            <Link href="/master/barang/tambah" id="create-item-btn" className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              + Tambah Barang
            </Link>
          )}
        </div>
      </div>

      <ItemTable
        data={tableData}
        total={total}
        page={page}
        pageSize={pageSize}
        toolbar={<AppSearchField placeholder="Cari SKU atau nama barang..." action="/master/barang/stok-menipis" />}
        filters={
          <form className="flex gap-2 flex-wrap" action="/master/barang/stok-menipis">
            <FormSelect
              name="category"
              defaultValue={params.category || ""}
              placeholder="Semua Kategori"
              className="min-w-[180px]"
              options={[
                { value: "", label: "Semua Kategori" },
                ...categories.map((cat) => ({ value: String(cat.id), label: cat.name })),
              ]}
            />
            <Button type="submit">Filter</Button>
          </form>
        }
      />
    </div>
  )
}
