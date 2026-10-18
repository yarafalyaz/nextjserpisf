import { prisma } from "@/lib/db/prisma"

/**
 * Central resolver for the inventory costing method (HPP valuation).
 *
 * Historically three call-sites resolved the method independently with
 * DIFFERENT fallbacks — `"fifo"` in `inventory-fifo.ts` (sale/consume) but
 * `"average"` in `goods-receipt.hook.ts` and `inventory.service.ts` (receive).
 * An item whose method was never set explicitly therefore behaved one way when
 * goods were RECEIVED and another way when they were SOLD, producing
 * inconsistent HPP. This module is the single source of truth so receive and
 * sell always agree.
 *
 * Precedence (highest first):
 *   1. Category method  (existing behaviour — category overrides the item)
 *   2. Item method
 *   3. Company-wide `SystemSetting.costingMethod`
 *   4. `"fifo"` (hard default — the method the business chose)
 *
 * Only `"average"` and `"fifo"` are meaningful; anything else (including a
 * blank/unset value) falls through to the next level, ending at `"fifo"`.
 */
export type CostingMethod = "fifo" | "average"

function normalize(value: string | null | undefined): CostingMethod | null {
  if (!value) return null
  const v = value.toLowerCase()
  if (v === "average") return "average"
  if (v === "fifo") return "fifo"
  return null
}

/**
 * Resolve from already-loaded values (no DB access). Used by call-sites that
 * have the item + category + global setting in hand.
 */
export function resolveCostingMethod(input: {
  categoryMethod?: string | null
  itemMethod?: string | null
  globalMethod?: string | null
}): CostingMethod {
  return (
    normalize(input.categoryMethod) ??
    normalize(input.itemMethod) ??
    normalize(input.globalMethod) ??
    "fifo"
  )
}

/**
 * Minimal prisma surface this service needs — just the settings lookup. Typed
 * structurally so both the full `prisma` client and a transaction client
 * (`Prisma.TransactionClient`) are accepted without a cast at every call-site.
 */
export interface CostingSettingsClient {
  systemSetting: {
    findFirst: (args?: {
      select?: { costingMethod?: boolean }
    }) => Promise<{ costingMethod?: string | null } | null>
  }
}

/**
 * DB helper: read the company-wide default costing method. Callers that already
 * hold a transaction client should pass it so the read happens inside the same
 * transaction.
 *
 * Fail-closed on a CORRUPT value: `null`/blank means "unset" (fall back to
 * `"fifo"`), but a non-blank value that is neither `"fifo"` nor `"average"`
 * throws in Indonesian instead of silently valuing stock the wrong way. The
 * invoice-posting path (`onSalesInvoicePosted` → `consumeFifoLayers`) resolves
 * through here, so an unknown global setting aborts the posting loudly rather
 * than booking HPP under the wrong method. Only a DB read failure falls back
 * to `"fifo"` (degraded, deliberate — see the silent-failure allowlist).
 */
export async function getGlobalCostingMethod(
  client: CostingSettingsClient = prisma as unknown as CostingSettingsClient,
): Promise<CostingMethod> {
  let raw: string | null | undefined
  try {
    const settings = await client.systemSetting.findFirst({
      select: { costingMethod: true },
    })
    raw = settings?.costingMethod
  } catch {
    // Settings table unavailable → fall back to the hard default rather than
    // failing an inventory movement.
    return "fifo"
  }
  const hit = normalize(raw)
  if (hit) return hit
  if (raw != null && raw.trim() !== "") {
    throw new Error(
      `Metode penetapan biaya global "${raw}" tidak dikenal — harus "FIFO" atau "Average". ` +
        `Perbaiki di Pengaturan → Umum sebelum memposting transaksi stok.`,
    )
  }
  return "fifo"
}

/**
 * Convenience: resolve the effective method for an item given its loaded
 * `costingMethod` + `category.costingMethod`, fetching the global default.
 */
export async function resolveCostingMethodForItem(
  item: { costingMethod?: string | null; category?: { costingMethod?: string | null } | null } | null,
  client?: CostingSettingsClient,
): Promise<CostingMethod> {
  const globalMethod = await getGlobalCostingMethod(client)
  return resolveCostingMethod({
    categoryMethod: item?.category?.costingMethod,
    itemMethod: item?.costingMethod,
    globalMethod,
  })
}
