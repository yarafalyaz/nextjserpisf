export const dynamic = "force-dynamic"

import { toPlain } from "@/lib/utils/serialization"
import { safeJsonParse } from "@/lib/utils/safe-parse"
import { prisma } from "@/lib/db/prisma"
import { parsePagination } from "@/lib/utils/pagination"
import { requirePermission, hasPermission } from "@/lib/auth/permissions"
import Link from "next/link"
import { redirect } from "next/navigation"
import { AppSearchField } from "@/components/ui/search-field"
import { ItemTable } from "./_components/item-table"
import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"
import { Button } from "@/components/ui/button"
import { FormSelect } from "@/components/ui/form-select"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Barang" }

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ cari?: string; category?: string; stok?: string; halaman?: string; pageSize?: string }>
}) {
  return renderItemsPage(searchParams)
}

export async function renderItemsPage(
  searchParams: Promise<{ cari?: string; category?: string; stok?: string; halaman?: string; pageSize?: string }>,
  lowStockOnly = false,
) {
  await requirePermission("view_items")
  const canCreate = await hasPermission("create_items")

  const params = await searchParams

  // Rute lama ?stok=menipis pindah ke /master/barang/stokmenipis.
  if (params.stok === "menipis") redirect("/master/barang/stokmenipis")

  const { page, pageSize, take } = parsePagination(params)

  // Prisma tak bisa banding kolom-vs-kolom (qty_on_hand <= min_stock);
  // mode stok menipis pakai raw query dengan kondisi sama persis seperti
  // cron notifikasi (is_active, min_stock>0, qty<=min, tak terhapus).
  const lowStockCond = lowStockOnly ? "AND i.min_stock > 0 AND i.qty_on_hand <= i.min_stock" : ""
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/%/g, "\\%").replace(/_/g, "\\_")
  const searchCond = params.cari
    ? `AND (i.sku LIKE '%${esc(params.cari)}%' ESCAPE '\\' OR i.name LIKE '%${esc(params.cari)}%' ESCAPE '\\')`
    : ""
  const catId = Number(params.category)
  const catCond = params.category && !Number.isNaN(catId) ? `AND i.category_id = ${catId}` : ""

  const where = {
    isActive: true,
    deletedAt: null,
    ...(params.cari && {
      OR: [
        { sku: { contains: params.cari } },
        { name: { contains: params.cari } },
      ],
    }),
    ...(params.category && { categoryId: Number(params.category) }),
  }

  const [rawItems, categories, lowStockRows] = await Promise.all([
    lowStockOnly
      ? prisma.$queryRawUnsafe<
          Array<{
            id: number; slug: string; sku: string; name: string; image: string | null
            category: { id: number; name: string } | null | string
            warehouse: { name: string } | null | string; rack: { name: string } | null | string
            rack_row: { name: string } | null | string
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
        )
      : prisma.item.findMany({
          where,
          include: { category: true, warehouse: true, rack: true, rackRow: true },
          orderBy: { createdAt: "desc" },
          take,
          skip: (page - 1) * pageSize,
        }),
    prisma.itemCategory.findMany({ orderBy: { name: "asc" } }),
    lowStockOnly
      ? prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(*) AS count FROM items i
           WHERE i.is_active = true AND i.deleted_at IS NULL
           ${lowStockCond} ${searchCond} ${catCond}`,
        )
      : Promise.resolve(null),
  ])

  const total = lowStockOnly
    ? Number(lowStockRows?.[0]?.count ?? 0)
    : await prisma.item.count({ where })

  // JSON_OBJECT driver mariadb datang sebagai string — parse via helper
  // kontrak-null (safe-parse sudah di allowlist guard silent-failure).
  const asObj = <T,>(v: unknown): T | null => {
    if (v == null) return null
    if (typeof v === "object") return v as T
    const o = safeJsonParse<Record<string, unknown>>(String(v))
    if (!o || Object.values(o).every((x) => x == null)) return null
    return o as T
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
    rackRow: asObj<{ name: string }>(
      "rackRow" in item && item.rackRow != null
        ? item.rackRow
        : "rack_row" in item
          ? item.rack_row
          : null,
    ),
    qtyOnHand: Number(item.qtyOnHand),
    minStock: Number(item.minStock),
    price: Number(item.price),
  }))

  const tableData = toPlain(items)
  const action = lowStockOnly ? "/master/barang/stokmenipis" : "/master/barang"


  return (
    <div className="flex flex-col gap-6">
      <AppBreadcrumbs items={lowStockOnly
        ? [{ label: "Dasbor", href: "/" }, { label: "Data Master", href: "/master" }, { label: "Barang", href: "/master/barang" }, { label: "Stok Menipis" }]
        : [{ label: "Dasbor", href: "/" }, { label: "Data Master", href: "/master" }, { label: "Barang" }]} />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">{lowStockOnly ? "Stok Menipis" : "Barang"}</h1>
        <div className="flex items-center gap-2">
          {lowStockOnly && (
            <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
              Stok menipis ({total})
            </span>
          )}
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
        toolbar={<AppSearchField placeholder="Cari SKU atau nama barang..." action={action} />}
        filters={
          <form className="flex gap-2 flex-wrap" action={action}>
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
