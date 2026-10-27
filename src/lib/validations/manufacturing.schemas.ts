import { z } from "zod"
import "./zod-locale";
import { dateOnly } from "@/lib/validations/finance.schemas";
import { parseLocaleNumber } from "@/lib/utils/parse-money";

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

/**
 * Tanggal date-only opsional untuk jadwal produksi / revisi BOM.
 *
 * Sebelumnya `optionalString(30)`: "2026-02-30" lolos zod lalu
 * `new Date(...)` di aksi menggulirkannya diam-diam ke 2 Mar. Kini
 * `dateOnly` menolak tanggal tak-kalender; aksi mengonversi lewat
 * `wibDateToUtcMidnight`.
 */
const optionalDate = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  dateOnly.optional(),
);

const optionalNumber = () => z.coerce.number().optional()
const optionalPositiveId = () => z.preprocess(
  (value) => value === "" || value === null ? undefined : value,
  z.coerce.number().int().positive().optional(),
)

/**
 * Tautan ke dokumen sumber (`workOrderId`) yang datang dari form/URL.
 *
 * Sebelumnya `workOrderId` divalidasi sebagai string bebas: nilai `"abc"` lolos
 * zod, lalu `Number("abc")` menjadi NaN dan hanya meledak sebagai galat FK di
 * Prisma (pesan tak berguna bagi pengguna). Sekarang nilai kosong → undefined
 * dan nilai lain wajib id positif; `"abc"` ditolak sebelum menyentuh database.
 */
const optionalSourceId = () => z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce.number().int().positive("Dokumen sumber tidak valid").optional(),
)

// ==================== PRODUCT (BOM) ====================

export const createProductSchema = z.object({
  name: z.string().min(1, "Nama produk wajib diisi").max(255),
  code: optionalString(100),
  description: optionalString(1000),
  vehicleBrandId: optionalNumber(),
  vehicleModelId: optionalNumber(),
  inventoryItemId: optionalPositiveId(),
})

export const updateProductSchema = z.object({
  name: z.string().min(1, "Nama produk wajib diisi").max(255),
  code: optionalString(100),
  description: optionalString(1000),
  vehicleBrandId: optionalNumber(),
  vehicleModelId: optionalNumber(),
  inventoryItemId: optionalPositiveId(),
})

// ==================== PRODUCTION ORDER ====================

export const createProductionOrderSchema = z.object({
  productId: z.coerce.number().int().min(1, "Produk wajib dipilih"),
  qty: z.coerce.number().min(1, "Qty minimal 1"),
  workOrderId: optionalSourceId(),
  startDate: optionalDate,
  endDate: optionalDate,
  notes: optionalString(1000),
})

export const updateProductionOrderSchema = z.object({
  productId: z.coerce.number().int().min(1, "Produk wajib dipilih"),
  qty: z.coerce.number().min(1, "Qty minimal 1"),
  workOrderId: optionalSourceId(),
  startDate: optionalDate,
  endDate: optionalDate,
  notes: optionalString(1000),
})

/**
 * Qty BOM/revisi: string berformat Indonesia ("1,5", "1.000", "1.000,5")
 * dinormalisasi lewat parser repo sebelum koersi zod. z.coerce.number()
 * mentah membaca "1,5" -> NaN (ditolak pesan zod menyesatkan) dan "1.000"
 * -> 1 (menyusut diam-diam). String tak terbaca -> null -> gerbang number
 * menolak. itemId tetap strict (id bukan qty; "1.000" bukan id sah).
 */
const localeQty = () =>
  z.preprocess(
    (v) => (typeof v === "string" ? parseLocaleNumber(v) : v),
    z.coerce.number().positive("Qty material harus > 0").max(1_000_000, "Qty terlalu besar"),
  )

// ==================== BOM REVISION ====================
// A revision is a frozen snapshot of the product's working BOM
// (Product.materials). Creating one snapshots the current lines; releasing it
// supersedes the previous released revision. Lines are only editable while the
// revision is still draft.

const bomRevisionLineSchema = z.object({
  itemId: z.coerce.number().int().positive("Material item tidak valid"),
  qty: localeQty(),
  // F-008: allowance scrap global per baris (%), 0–100; field kosong = null
  // (belum dikalibrasi). Murni data master — tanpa dampak jurnal saat diisi.
  scrapPercent: z
    .preprocess(
      (v) => (v == null || (typeof v === "string" && v.trim() === "") ? null : typeof v === "string" ? parseLocaleNumber(v) : v),
      z.coerce.number().min(0, "Persen scrap allowance minimal 0").max(100, "Persen scrap allowance maksimal 100").nullable(),
    )
    .default(null),
})

export const createBomRevisionSchema = z.object({
  productId: z.coerce.number().int().positive("Produk wajib dipilih"),
  effectiveDate: optionalDate,
  notes: optionalString(1000),
})

export const updateBomRevisionSchema = z.object({
  effectiveDate: optionalDate,
  notes: optionalString(1000),
})

/** Validate the parallel `revisionItemId[]` / `revisionQty[]` arrays of a draft
 * revision edit. Same shape/behaviour as parseMaterialRows. */
export function parseRevisionRows(
  itemIds: string[],
  qtys: string[],
  scrapPercents: string[] = [],
): { success: true; data: { itemId: number; qty: number; scrapPercent: number | null }[] } | { success: false; error: string } {
  const merged = new Map<number, { qty: number; scrapPercent: number | null }>()
  const errors: string[] = []

  for (let i = 0; i < itemIds.length; i++) {
    const rawId = (itemIds[i] ?? "").trim()
    const rawQty = (qtys[i] ?? "").trim()
    if (rawId === "" || rawQty === "" || rawId === "0" || rawQty === "0") continue

    const r = bomRevisionLineSchema.safeParse({ itemId: rawId, qty: rawQty, scrapPercent: scrapPercents[i] })
    if (!r.success) {
      errors.push(`Baris #${i + 1}: ${r.error.issues.map((iss) => iss.message).join(", ")}`)
      continue
    }
    merged.set(r.data.itemId, { qty: (merged.get(r.data.itemId)?.qty ?? 0) + r.data.qty, scrapPercent: r.data.scrapPercent })
  }

  if (errors.length > 0) {
    return { success: false, error: "Validasi gagal: " + errors.join("; ") }
  }
  return { success: true, data: Array.from(merged, ([itemId, m]) => ({ itemId, qty: m.qty, scrapPercent: m.scrapPercent })) }
}

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
  qty: localeQty(),
})

export type MaterialRow = z.infer<typeof materialRowSchema>

// ==================== WORK CENTER (F-2026-10-22-090-S) ====================
// Master stasiun kerja papan beban rencana. capacityHoursPerDay Decimal(15,2)
// > 0; parallelStations Int >= 1. Keunikan nama aktif ditegakkan aksi server
// lewat normalizedName (Q-LP-5), bukan zod.

export const workCenterSchema = z.object({
  name: z.string().trim().min(1, "Nama stasiun wajib diisi").max(150, "Nama stasiun maksimal 150 karakter"),
  capacityHoursPerDay: z.coerce
    .number({ error: "Kapasitas jam per hari wajib diisi" })
    .positive("Kapasitas jam per hari harus lebih dari 0")
    .max(24, "Kapasitas jam per hari maksimal 24"),
  parallelStations: z.coerce
    .number({ error: "Jumlah stasiun paralel wajib diisi" })
    .int("Jumlah stasiun paralel harus bilangan bulat")
    .min(1, "Jumlah stasiun paralel minimal 1")
    .max(100, "Jumlah stasiun paralel maksimal 100"),
  sortOrder: z.coerce.number().int("Urutan tampil harus bilangan bulat").min(0).optional(),
  isActive: z.boolean().optional(),
})

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
