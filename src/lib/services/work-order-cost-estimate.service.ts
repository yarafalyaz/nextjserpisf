import { Prisma } from "@prisma/client"
import { safeAdd, safeMultiply } from "@/lib/utils/math"

/**
 * F-2026-10-22-084-S: snapshot estimasi biaya per job, sekali saat start.
 *
 * Idempoten (BR-EST-02): bila baris sudah ada → return existing, tanpa tulis.
 * Turunan (BR-EST-03a): material = Σ qty × Item.standardCost
 * (fallback Item.cost bila standardCost 0; BR-EST-09: baris tanpa keduanya
 * dilewati, bukan 0). Kategori lain null ("belum dianggarkan", BR-EST-07).
 * Tanpa quotation disetujui → baris tetap lahir, material null + notes jujur.
 */
type Tx = Prisma.TransactionClient

const APPROVED = new Set(["accepted", "approved", "converted"])

export async function snapshotWorkOrderCostEstimateTx(
  tx: Tx,
  workOrderId: number,
  userId?: number | null,
) {
  const existing = await tx.workOrderCostEstimate.findFirst({
    where: { workOrderId },
  })
  if (existing) return existing

  const wo = await tx.workOrder.findUniqueOrThrow({
    where: { id: workOrderId },
    select: { quotationId: true },
  })

  let material: number | null = null
  let quotationId: number | null = null
  let notes: string | undefined

  const quotation =
    wo.quotationId !== null
      ? await tx.quotation.findUnique({
          where: { id: wo.quotationId },
          select: {
            id: true,
            status: true,
            sections: {
              select: {
                items: {
                  select: { itemId: true, qty: true },
                  orderBy: { id: "asc" },
                },
              },
            },
          },
        })
      : null

  if (quotation && APPROVED.has(quotation.status)) {
    quotationId = quotation.id
    const lines = quotation.sections.flatMap((s) => s.items)
    const itemIds = [...new Set(lines.map((l) => l.itemId).filter((id): id is number => id !== null))]
    const items =
      itemIds.length > 0
        ? await tx.item.findMany({
            where: { id: { in: itemIds } },
            select: { id: true, standardCost: true, cost: true },
          })
        : []
    const byId = new Map(items.map((i) => [i.id, i]))
    let sum: number | null = null
    let usedFallback = false
    for (const line of lines) {
      if (line.itemId === null) continue // baris bebas: dilewati, bukan 0
      const master = byId.get(line.itemId)
      if (!master) continue
      const std = Number(master.standardCost ?? 0)
      const cost = Number(master.cost ?? 0)
      const unit = std > 0 ? std : cost > 0 ? cost : null
      if (unit === null) continue
      if (std <= 0) usedFallback = true
      const row = safeMultiply(Number(line.qty ?? 0), unit, 2)
      sum = sum === null ? row : safeAdd(sum, row, 2)
    }
    material = sum
    notes =
      sum === null
        ? "estimasi material tidak bisa diturunkan — isi manual"
        : usedFallback
          ? "sebagian baris memakai Item.cost (fallback standardCost=0)"
          : undefined
  } else {
    notes = "WO tanpa quotation disetujui — estimasi material belum bisa diturunkan"
  }

  return tx.workOrderCostEstimate.create({
    data: {
      workOrderId,
      quotationId,
      source: "derived",
      materialCost: material === null ? null : new Prisma.Decimal(material),
      laborCost: null,
      overheadCost: null,
      serviceCost: null,
      subcontractCost: null,
      otherCost: null,
      // ponytail: material satu-satunya kategori terisi; total = material.
      // Perluas saat kategori manual masuk (BR-EST-10/11 butuh vonis).
      totalEstimate: material === null ? null : new Prisma.Decimal(material),
      notes,
      lockedAt: new Date(),
      createdBy: userId ?? null,
    },
  })
}
