import { prisma } from "@/lib/db/prisma"

/**
 * Resolusi slug massal untuk tautan referensi silang (jurnal, buku besar,
 * kartu stok, mutasi stok).
 *
 * `referenceHref` (lib/utils/format) hanya menerima (referenceType,
 * referenceId) dan dulu selalu membangun URL id numerik — tautan-tautan itu
 * bekerja (resolver halaman menerima id) tetapi tidak pernah berbentuk slug
 * kanonis. Helper ini menyelesaikan slug untuk sekumpulan referensi dalam
 * satu kueri per tipe dokumen, supaya halaman laporan bisa meneruskan slug
 * ke `referenceHref` tanpa N+1.
 */

/** referenceType → delegasi Prisma berkunci slug. Selaras rute referenceHref. */
const MODEL_BY_REFERENCE_TYPE: Record<string, string> = {
  SalesInvoice: "salesInvoice",
  SalesOrder: "salesOrder",
  SalesReturn: "salesReturn",
  SalesPayment: "salesPayment",
  Quotation: "quotation",
  PurchaseOrder: "purchaseOrder",
  PurchaseRequest: "purchaseRequest",
  PurchaseReturn: "purchaseReturn",
  GoodsReceipt: "goodsReceipt",
  GoodsReceiptService: "goodsReceipt",
  GR: "goodsReceipt",
  ProductionOrder: "productionOrder",
  ManufacturingOrder: "productionOrder",
  MaterialIssue: "materialIssue",
  ProductionOrderMaterialIssue: "productionOrder",
  StockAdjustment: "stockAdjustment",
  InventoryTransfer: "inventoryTransfer",
}

export interface ReferenceKey {
  referenceType: string | null | undefined
  referenceId: number | null | undefined
}

/**
 * Kembalikan Map `"<type>:<id>" → slug` untuk referensi yang dokumennya
 * punya slug. Referensi tanpa slug (atau tipe tak dikenal) tidak masuk map —
 * pemanggil jatuh kembali ke id numerik.
 */
export async function resolveReferenceSlugs(
  refs: ReferenceKey[],
): Promise<Map<string, string>> {
  const idsByModel = new Map<string, Set<number>>()
  const modelByKey = new Map<string, string>()

  for (const ref of refs) {
    if (!ref.referenceType || ref.referenceId == null) continue
    const model = MODEL_BY_REFERENCE_TYPE[ref.referenceType]
    if (!model) continue
    const id = Number(ref.referenceId)
    if (!Number.isSafeInteger(id) || id <= 0) continue
    modelByKey.set(`${ref.referenceType}:${id}`, model)
    if (!idsByModel.has(model)) idsByModel.set(model, new Set())
    idsByModel.get(model)!.add(id)
  }

  const slugByModelId = new Map<string, string>()
  await Promise.all(
    [...idsByModel.entries()].map(async ([model, ids]) => {
      const delegate = (prisma as unknown as Record<string, {
        findMany: (args: unknown) => Promise<Array<{ id: number; slug: string | null }>>
      }>)[model]
      if (!delegate?.findMany) return
      const rows = await delegate.findMany({
        where: { id: { in: [...ids] } },
        select: { id: true, slug: true },
      })
      for (const row of rows) {
        if (row.slug) slugByModelId.set(`${model}:${row.id}`, row.slug)
      }
    }),
  )

  const result = new Map<string, string>()
  for (const [key, model] of modelByKey) {
    const id = key.split(":").at(-1)
    const slug = slugByModelId.get(`${model}:${id}`)
    if (slug) result.set(key, slug)
  }
  return result
}

/** Kunci map untuk satu referensi. */
export function referenceSlugKey(ref: ReferenceKey): string {
  return `${ref.referenceType}:${Number(ref.referenceId)}`
}
