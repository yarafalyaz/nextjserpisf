import { TxClient } from "@/lib/db/prisma"

/**
 * Production genealogy (PRD line 369 / REP-13).
 *
 * Records, on production-order completion, the finished unit and the materials
 * consumed to build it. Enables forward traceability (a source lot/serial → the
 * finished goods it ended up in) and backward traceability (a finished serial →
 * what it was built from, by whom, when).
 *
 * Written inside the completion transaction so a completed order always has
 * exactly one genealogy record (unique on productionOrderId). Idempotent under
 * a retried completion: the unique constraint + the status claim mean the second
 * attempt never reaches here.
 */

export interface GenealogyMaterialLine {
  itemId: number
  qty: number
  unitCost: number
  totalCost: number
}

export async function recordProductionGenealogy(
  tx: TxClient,
  input: {
    productionOrderId: number
    documentNo: string
    outputItemId: number
    outputQty: number
    outputSerials: string[]
    outputBatch: string | null
    unitCost: number
    totalCost: number
    completedBy: number | null
    materials: GenealogyMaterialLine[]
  },
): Promise<void> {
  await tx.productionGenealogy.create({
    data: {
      productionOrderId: input.productionOrderId,
      documentNo: input.documentNo,
      outputItemId: input.outputItemId,
      outputQty: input.outputQty,
      outputSerials: input.outputSerials.length ? input.outputSerials : undefined,
      outputBatch: input.outputBatch,
      unitCost: input.unitCost,
      totalCost: input.totalCost,
      completedBy: input.completedBy,
      completedAt: new Date(),
      materials: {
        create: input.materials.map((m) => ({
          itemId: m.itemId,
          qty: m.qty,
          unitCost: m.unitCost,
          totalCost: m.totalCost,
        })),
      },
    },
  })
}
