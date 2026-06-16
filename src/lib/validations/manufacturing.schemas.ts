import { z } from "zod"

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const optionalNumber = () => z.coerce.number().optional()

// ==================== PRODUCT (BOM) ====================

export const createProductSchema = z.object({
  name: z.string().min(1, "Nama produk wajib diisi").max(255),
  code: optionalString(100),
  description: optionalString(1000),
  vehicleBrandId: optionalNumber(),
  vehicleModelId: optionalNumber(),
})

export type CreateProductInput = z.infer<typeof createProductSchema>

export const updateProductSchema = z.object({
  name: z.string().min(1, "Nama produk wajib diisi").max(255),
  code: optionalString(100),
  description: optionalString(1000),
  vehicleBrandId: optionalNumber(),
  vehicleModelId: optionalNumber(),
})

export type UpdateProductInput = z.infer<typeof updateProductSchema>

// ==================== PRODUCTION ORDER ====================

export const createProductionOrderSchema = z.object({
  productId: z.coerce.number().int().min(1, "Produk wajib dipilih"),
  qty: z.coerce.number().min(1, "Qty minimal 1"),
  startDate: optionalString(30),
  endDate: optionalString(30),
  notes: optionalString(1000),
})

export type CreateProductionOrderInput = z.infer<typeof createProductionOrderSchema>

export const updateProductionOrderSchema = z.object({
  productId: z.coerce.number().int().min(1, "Produk wajib dipilih"),
  qty: z.coerce.number().min(1, "Qty minimal 1"),
  startDate: optionalString(30),
  endDate: optionalString(30),
  notes: optionalString(1000),
})

export type UpdateProductionOrderInput = z.infer<typeof updateProductionOrderSchema>

// ==================== PRODUCT MATERIALS (BOM rows) ====================
// Dynamic material rows posted as parallel arrays of form fields
// `materialItemId[]` and `materialQty[]` (read via formData.getAll, so they
// are NOT captured by parseFormData's forEach — they must be validated
// separately). Each (itemId, qty) pair is a BOM line.
//
// We validate them server-side because the create/update paths only checked
// `> 0` after a blind Number() cast — an editor with `create_products` /
// `edit_products` could push a non-existent or non-integer itemId (opaque FK
// 500), a fractional/negative qty (poisons BOM totals that propagate to
// production-order material consumption + standard-cost rollups), or a qty
// above any sane limit. Mirrors the finance/inventory update-action fixes that
// closed the same class of Zod-bypass.

export const materialRowSchema = z.object({
  itemId: z.coerce.number().int().positive("Material item tidak valid"),
  qty: z.coerce.number().positive("Qty material harus > 0").max(1_000_000, "Qty terlalu besar"),
})

export type MaterialRow = z.infer<typeof materialRowSchema>

/**
 * Validate + normalise the parallel `materialItemId[]` / `materialQty[]` arrays
 * posted by the product (BOM) form. Returns the de-duped, validated rows, or a
 * joined error string when any row is malformed (so the action can reject
 * before touching the DB instead of letting a bad cast through).
 *
 * Blank/zero rows are dropped (the form always renders one empty row), matching
 * the legacy `.filter(m => m.itemId > 0 && m.qty > 0)` behaviour — but a row
 * that is *partially* filled (e.g. itemId set, qty negative) is now a hard
 * validation error rather than being silently discarded.
 */
export function parseMaterialRows(
  itemIds: string[],
  qtys: string[],
): { success: true; data: MaterialRow[] } | { success: false; error: string } {
  const merged = new Map<number, number>()
  const errors: string[] = []

  for (let i = 0; i < itemIds.length; i++) {
    const rawId = (itemIds[i] ?? "").trim()
    const rawQty = (qtys[i] ?? "").trim()

    // Blank row OR rows where either side is "0" → skip. The form template
    // always renders one empty row, and the legacy `.filter(m => m.itemId > 0
    // && m.qty > 0)` silently dropped any "0" pair (treating it as
    // user-emptied). Preserving that semantics so an editor who half-fills a
    // row then types "0" instead of clearing it still gets the row dropped,
    // not a validation error.
    if (rawId === "" || rawQty === "" || rawId === "0" || rawQty === "0") continue

    const r = materialRowSchema.safeParse({ itemId: rawId, qty: rawQty })
    if (!r.success) {
      errors.push(`Baris material #${i + 1}: ${r.error.issues.map((iss) => iss.message).join(", ")}`)
      continue
    }
    merged.set(r.data.itemId, (merged.get(r.data.itemId) ?? 0) + r.data.qty)
  }

  if (errors.length > 0) {
    return { success: false, error: "Validasi gagal: " + errors.join("; ") }
  }
  return { success: true, data: Array.from(merged, ([itemId, qty]) => ({ itemId, qty })) }
}
