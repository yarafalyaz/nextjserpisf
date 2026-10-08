import { prisma, TxClient } from "@/lib/db/prisma"

/**
 * BOM revision resolution (PRD FAB-02 / MOD-04).
 *
 * A product keeps an editable working BOM in `Product.materials` and a series
 * of frozen, versioned revisions in `BomRevision` / `BomRevisionMaterial`.
 * When a production order is created, it must pin the revision that is in force
 * at that moment so later edits to the master BOM cannot silently change the
 * basis of an already-released order.
 *
 * Resolution order:
 *   1. The `released` revision for the product (the latest one released).
 *   2. If none has been released yet, fall back to the product's working BOM
 *      (`ProductMaterial`) with `revisionId = null`. This keeps existing
 *      products working without forcing every product to be revised first.
 *
 * The returned lines are the per-unit quantities; callers multiply by order qty.
 */
export interface EffectiveBomLine {
  itemId: number
  qtyPerUnit: number
}

export interface EffectiveBom {
  revisionId: number | null
  revisionNo: number | null
  lines: EffectiveBomLine[]
}

export async function resolveEffectiveBom(
  productId: number,
  client: TxClient | typeof prisma = prisma,
): Promise<EffectiveBom> {
  const released = await client.bomRevision.findFirst({
    where: { productId, status: "released" },
    orderBy: { revisionNo: "desc" },
    include: { materials: true },
  })

  if (released) {
    return {
      revisionId: released.id,
      revisionNo: released.revisionNo,
      lines: released.materials.map((m) => ({
        itemId: m.itemId,
        qtyPerUnit: Number(m.qty),
      })),
    }
  }

  const working = await client.productMaterial.findMany({
    where: { productId },
    select: { itemId: true, qty: true },
  })
  return {
    revisionId: null,
    revisionNo: null,
    lines: working.map((m) => ({ itemId: m.itemId, qtyPerUnit: Number(m.qty) })),
  }
}
