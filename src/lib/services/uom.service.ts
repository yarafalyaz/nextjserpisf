import { Prisma } from "@prisma/client"

type Tx = Prisma.TransactionClient

/**
 * Multi-UoM conversion.
 *
 * Stock is always kept in the item's BASE unit (Item.unitOfMeasure). Documents
 * may transact in an alternate unit defined in UomConversion (factorToBase:
 * how many base units one alternate unit equals, e.g. 1 BOX = 12 PCS → 12).
 *
 * toBaseQty converts an entered quantity in `uom` to the base quantity.
 */
export async function toBaseFactor(tx: Tx, itemId: number, uom: string | null | undefined): Promise<number> {
  if (!uom) return 1
  const item = await tx.item.findUnique({ where: { id: itemId }, select: { unitOfMeasure: true } })
  // Entering in the base unit (or unknown) → factor 1.
  if (!item || uom === item.unitOfMeasure) return 1
  const conv = await tx.uomConversion.findUnique({
    where: { itemId_code: { itemId, code: uom } },
    select: { factorToBase: true },
  })
  const factor = conv ? Number(conv.factorToBase) : 1
  return factor > 0 ? factor : 1
}

/** Convert a quantity entered in `uom` to base units. */
export async function toBaseQty(tx: Tx, itemId: number, uom: string | null | undefined, qty: number): Promise<number> {
  const factor = await toBaseFactor(tx, itemId, uom)
  return qty * factor
}
