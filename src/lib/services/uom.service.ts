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
  // Missing/non-positive conversion → factor 1 with an EXPLICIT warning (never
  // silent). Throwing here would break legitimate flows: the sales editor
  // allows inline quick-add of a new UoM master without a per-item conversion
  // row, and legacy rows may reference a deleted conversion. The caller must
  // treat the resulting qty as unconverted-entered-unit.
  const factor = conv ? Number(conv.factorToBase) : NaN
  if (!conv || !(factor > 0)) {
    console.warn(
      `[uom] konversi ${uom} untuk item #${itemId} ${!conv ? "tidak ditemukan" : `tidak valid (${String(conv?.factorToBase)})`} — qty dihitung 1:1 dalam satuan dasar ${item.unitOfMeasure}. Daftarkan konversi UoM item tersebut.`,
    )
    return 1
  }
  return factor
}

/** Convert a quantity entered in `uom` to base units. */
export async function toBaseQty(tx: Tx, itemId: number, uom: string | null | undefined, qty: number): Promise<number> {
  const factor = await toBaseFactor(tx, itemId, uom)
  return qty * factor
}
