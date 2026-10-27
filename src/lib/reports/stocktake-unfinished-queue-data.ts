/**
 * Loader read-only antrean sesi opname belum selesai per tahap
 * (F-2026-10-27-090-S / 090-B, tanpa migrasi/kolom baru).
 *
 * Fail-closed SEBELUM query (BR-STQ-11, Q-STQ-3): gerbang
 * `view_stock_opname` persis halaman daftar existing (tanpa key
 * baru), lalu saringan `getWarehouseScope` — `all` semua gudang,
 * `assigned` hanya gudang tertugaskan, `none` nol baris tanpa
 * query. Daftar sesi existing TIDAK diubah oleh loader ini.
 *
 * Populasi query mengecualikan `posted`; builder menyaring ulang
 * dan menampung status asing ke ember tertanda (BR-STQ-01).
 * Select daftar-putih: TIDAK membaca `updatedAt` (dilarang jadi
 * acuan umur, BR-STQ-03), `countedBy`/`approvedBy` (BR-STQ-09),
 * atau kolom qty/variance tersimpan baris (BR-STQ-07) ke payload.
 *
 * Anti-N+1 (BR-STQ-08): satu query sesi + SATU query massal
 * `StocktakeLine` untuk semua sesi — bukan query baris per sesi.
 *
 * Baca-saja mutlak (BR-STQ-10): hanya findMany; tidak memanggil
 * snapshot/save/approve/post sesi dan tidak menulis status/kolom.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getWarehouseScope } from "@/lib/auth/warehouse-scope"
import {
  buildStocktakeUnfinishedQueue,
  type StocktakeUnfinishedInput,
  type StocktakeUnfinishedLineInput,
  type StocktakeUnfinishedQueue,
} from "@/lib/reports/stocktake-unfinished-queue"

export interface StocktakeUnfinishedQueueOptions {
  now?: Date
}

export async function getStocktakeUnfinishedQueue(
  options: StocktakeUnfinishedQueueOptions = {},
): Promise<StocktakeUnfinishedQueue> {
  const user = await requirePermission("view_stock_opname")
  const scope = await getWarehouseScope(user)
  const now = options.now ?? new Date()

  if (scope.kind === "none") return buildStocktakeUnfinishedQueue([], now)

  const scopedWhere =
    scope.kind === "all" ? {} : { warehouseId: { in: scope.warehouseIds } }

  const sessions = await prisma.stocktakeSession.findMany({
    where: { status: { not: "posted" }, ...scopedWhere },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      status: true,
      warehouseId: true,
      date: true,
      snapshotAt: true,
      approvedAt: true,
      createdAt: true,
      warehouse: { select: { code: true, name: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })

  const ids = sessions.map((s) => s.id)
  const lines =
    ids.length > 0
      ? await prisma.stocktakeLine.findMany({
          where: { sessionId: { in: ids } },
          select: { sessionId: true, systemQty: true, count1: true, count2: true },
        })
      : []

  const linesBySession = new Map<number, StocktakeUnfinishedLineInput[]>()
  for (const line of lines) {
    const arr = linesBySession.get(line.sessionId) ?? []
    arr.push({
      systemQty: Number(line.systemQty),
      count1: line.count1 == null ? null : Number(line.count1),
      count2: line.count2 == null ? null : Number(line.count2),
    })
    linesBySession.set(line.sessionId, arr)
  }

  const inputs: StocktakeUnfinishedInput[] = sessions.map((s) => ({
    sessionId: s.id,
    slug: s.slug,
    documentNo: s.documentNo,
    status: s.status,
    warehouseId: s.warehouseId,
    warehouseCode: s.warehouse?.code ?? null,
    warehouseName: s.warehouse?.name ?? null,
    date: s.date,
    createdAt: s.createdAt,
    snapshotAt: s.snapshotAt,
    approvedAt: s.approvedAt,
    lines: linesBySession.get(s.id) ?? [],
  }))

  return buildStocktakeUnfinishedQueue(inputs, now)
}
