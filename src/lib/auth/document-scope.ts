import "server-only"
import { prisma } from "@/lib/db/prisma"
import { auth } from "@/lib/auth/auth"
import { assertWarehouseAccessMulti, getWarehouseScope } from "@/lib/auth/warehouse-scope"

/**
 * Dokumen yang dibatasi gudang: jenis, delegate Prisma, dan kolom gudangnya.
 *
 * Satu sumber untuk SEMUA permukaan yang menyajikan dokumen — lampiran
 * (`attachment-permissions.ts`) maupun cetak (`api/print`) — supaya keduanya
 * tidak bisa berbeda aturan. Tanggal/kolomnya dijaga oleh
 * src/__tests__/document-scope-parity.test.ts.
 *
 * Kuncinya memakai bentuk normalized (snake_case). Pemanggil dari route cetak
 * menormalkan `goods-receipt` → `goods_receipt` lebih dulu.
 */
export const WAREHOUSE_SCOPED_DOCUMENTS: Record<string, { model: string; fields: string[] }> = {
  material_issue: { model: "materialIssue", fields: ["warehouseId"] },
  goods_receipt: { model: "goodsReceipt", fields: ["warehouseId"] },
  inventory_transfer: { model: "inventoryTransfer", fields: ["sourceWarehouseId", "destinationWarehouseId"] },
  stock_adjustment: { model: "stockAdjustment", fields: ["warehouseId"] },
}

/**
 * Bolehkah sesi ini melihat dokumen yang dibatasi gudang?
 *
 * Dokumen di luar tabel di atas tidak dibatasi → selalu `true` (dicek lebih dulu,
 * sehingga pemanggil yang menyajikan semua jenis dokumen cukup memanggil fungsi
 * ini untuk semuanya). Untuk dokumen yang dibatasi: fail-closed — sesi tanpa
 * penugasan gudang yang cocok, atau yang tidak bisa dibaca, ditolak.
 */
export async function canAccessWarehouseScopedDocument(
  normalizedType: string,
  documentId: number,
  session: { user?: { id?: string | number | null; roles?: unknown } } | null,
): Promise<boolean> {
  const entry = WAREHOUSE_SCOPED_DOCUMENTS[normalizedType]
  if (!entry) return true
  if (!session?.user?.id || !Number.isSafeInteger(documentId) || documentId <= 0) return false

  const model = (prisma as unknown as Record<string, { findUnique?: (args: unknown) => Promise<Record<string, unknown> | null> }>)[entry.model]
  if (!model?.findUnique) return false

  const select = Object.fromEntries([["id", true], ...entry.fields.map((field) => [field, true])])
  const document = await model.findUnique({ where: { id: documentId }, select })
  if (!document) return false

  try {
    const scope = await getWarehouseScope({
      id: String(session.user.id),
      roles: Array.isArray(session.user.roles) ? (session.user.roles as string[]) : [],
    })
    const warehouseIds = entry.fields
      .map((field) => document[field])
      .filter((value): value is number => Number.isInteger(value))
    if (warehouseIds.length !== entry.fields.length) return false
    assertWarehouseAccessMulti(scope, warehouseIds)
    return true
  } catch {
    return false
  }
}

/**
 * Varian untuk halaman (Server Component): mengambil sesi sendiri sehingga
 * pemanggil cukup menulis satu baris — `if (!(await canView…)) notFound()`.
 * Dipakai halaman detail/ubah dokumen ber-skop agar batasnya sama dengan
 * lampiran dan cetak.
 */
export async function canViewWarehouseScopedDocument(
  normalizedType: string,
  documentId: number,
): Promise<boolean> {
  return canAccessWarehouseScopedDocument(normalizedType, documentId, await auth())
}
