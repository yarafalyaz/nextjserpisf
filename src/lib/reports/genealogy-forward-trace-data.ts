/**
 * Loader forward-trace genealogi — satu sumber untuk halaman telusur,
 * mengikuti pola `job-order-data.ts` (loader Prisma + builder murni).
 */

import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"
import {
  buildForwardTrace,
  completedByLabel,
  normalizeTraceQuery,
  type ForwardTraceHit,
} from "@/lib/reports/genealogy-forward-trace"

export interface ForwardTraceResultHit extends ForwardTraceHit {
  outputItemLabel: string
  matchedItemLabels: string[]
  completedByName: string | null
}

export async function loadForwardTrace(queryRaw: string): Promise<{
  query: string
  hits: ForwardTraceResultHit[]
}> {
  const query = normalizeTraceQuery(queryRaw)
  if (!query) return { query, hits: [] }

  // Kandidat dipersempit di DB lewat batchNumber; serialNumbers adalah Json
  // sehingga pencocokan eksaknya dilakukan builder murni (bukan tebakan SQL).
  const rows = await prisma.productionGenealogy.findMany({
    where: {
      materials: {
        some: {
          OR: [{ batchNumber: { contains: query } }, { serialNumbers: { not: Prisma.DbNull } }],
        },
      },
    },
    include: {
      materials: true,
      productionOrder: { select: { documentNo: true, slug: true } },
    },
    orderBy: { completedAt: "desc" },
  })

  const hits = buildForwardTrace({
    query,
    genealogies: rows.map((row) => ({
      productionOrderId: row.productionOrderId,
      productionOrderDocumentNo: row.productionOrder.documentNo,
      productionOrderSlug: row.productionOrder.slug,
      documentNo: row.documentNo,
      outputItemId: row.outputItemId,
      outputQty: Number(row.outputQty),
      outputSerials: row.outputSerials,
      outputBatch: row.outputBatch,
      completedAt: row.completedAt,
      completedBy: row.completedBy,
      materials: row.materials.map((m) => ({
        itemId: m.itemId,
        serialNumbers: m.serialNumbers,
        batchNumber: m.batchNumber,
      })),
    })),
  })
  if (hits.length === 0) return { query, hits: [] }

  const itemIds = [...new Set(hits.flatMap((h) => [h.outputItemId, ...h.matchedItemIds]))]
  const userIds = [...new Set(hits.map((h) => h.completedBy).filter((id): id is number => id != null))]
  const [items, users] = await Promise.all([
    prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, sku: true, name: true } }),
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: number; name: string }[]),
  ])
  const itemById = new Map(items.map((i) => [i.id, i]))
  const userNameById = new Map(users.map((u) => [u.id, u.name]))
  const itemLabel = (id: number) => {
    const item = itemById.get(id)
    return item ? `${item.sku} — ${item.name}` : `Barang #${id}`
  }

  return {
    query,
    hits: hits.map((h) => ({
      ...h,
      outputItemLabel: itemLabel(h.outputItemId),
      matchedItemLabels: h.matchedItemIds.map(itemLabel),
      completedByName: completedByLabel(h.completedBy, userNameById),
    })),
  }
}
