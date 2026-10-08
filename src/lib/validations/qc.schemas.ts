import { z } from "zod"

const optionalString = (max: number) =>
  z.string().max(max).optional().or(z.literal("").transform(() => undefined))

const optionalPositiveId = () =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().positive().optional(),
  )

// ==================== QC CHECKLIST ====================

export const QC_CHECKLIST_TYPES = ["incoming", "in_process", "final"] as const
export const QC_ITEM_METHODS = ["visual", "measure", "torque", "test", "functional"] as const

export const createQcChecklistSchema = z.object({
  code: optionalString(100),
  name: z.string().min(1, "Nama checklist wajib diisi").max(200),
  checklistType: z.enum(QC_CHECKLIST_TYPES, { message: "Jenis checklist tidak valid" }),
  productId: optionalPositiveId(),
})

export const updateQcChecklistSchema = z.object({
  code: optionalString(100),
  name: z.string().min(1, "Nama checklist wajib diisi").max(200),
  checklistType: z.enum(QC_CHECKLIST_TYPES, { message: "Jenis checklist tidak valid" }),
  productId: optionalPositiveId(),
})

export type CreateQcChecklistInput = z.infer<typeof createQcChecklistSchema>

// ==================== QC CHECKLIST ITEMS (dynamic rows) ====================

const checklistItemRowSchema = z.object({
  itemName: z.string().min(1, "Nama item wajib diisi").max(200),
  method: z.enum(QC_ITEM_METHODS, { message: "Metode tidak valid" }).default("visual"),
  spec: optionalString(200),
  isRequired: z.boolean().default(true),
})

export interface ChecklistItemRow {
  itemName: string
  method: string
  spec?: string
  isRequired: boolean
}

/**
 * Validate the parallel arrays posted by the checklist form
 * (`itemName[]`, `itemMethod[]`, `itemSpec[]`, `itemRequired[]`). Blank rows are
 * dropped (the form always renders one empty row); a partially-filled row is a
 * hard error rather than silently discarded.
 */
export function parseChecklistItems(
  names: string[],
  methods: string[],
  specs: string[],
  required: string[],
): { success: true; data: ChecklistItemRow[] } | { success: false; error: string } {
  const rows: ChecklistItemRow[] = []
  const errors: string[] = []

  for (let i = 0; i < names.length; i++) {
    const name = (names[i] ?? "").trim()
    if (name === "") continue // blank row

    const parsed = checklistItemRowSchema.safeParse({
      itemName: name,
      method: (methods[i] ?? "visual").trim() || "visual",
      spec: (specs[i] ?? "").trim() || undefined,
      isRequired: (required[i] ?? "true").trim() !== "false",
    })
    if (!parsed.success) {
      errors.push(`Baris #${i + 1}: ${parsed.error.issues.map((iss) => iss.message).join(", ")}`)
      continue
    }
    rows.push(parsed.data)
  }

  if (errors.length > 0) return { success: false, error: "Validasi gagal: " + errors.join("; ") }
  return { success: true, data: rows }
}

// ==================== QC INSPECTION ====================

export const createQcInspectionSchema = z.object({
  checklistId: z.coerce.number().int().positive("Checklist wajib dipilih"),
  inspectionType: z.enum(QC_CHECKLIST_TYPES, { message: "Jenis inspeksi tidak valid" }),
  referenceType: z.enum(["WorkOrder", "ProductionOrder", "GoodsReceipt"], {
    message: "Jenis referensi tidak valid",
  }),
  referenceId: z.coerce.number().int().positive("Dokumen referensi tidak valid"),
  notes: optionalString(2000),
})

/**
 * Validate the parallel arrays of an inspection submission:
 * `resultItemId[]`, `resultValue[]`, `resultNote[]`. Each row references a
 * checklist item id present on the inspection's checklist; the action verifies
 * membership. Returns the parsed rows keyed by checklistItemId.
 */
export function parseInspectionResults(
  itemIds: string[],
  results: string[],
  measured: string[],
  notes: string[],
): { success: true; data: { checklistItemId: number; result: string; measuredValue?: string; notes?: string }[] } | { success: false; error: string } {
  const rows: { checklistItemId: number; result: string; measuredValue?: string; notes?: string }[] = []
  const errors: string[] = []

  for (let i = 0; i < itemIds.length; i++) {
    const rawId = (itemIds[i] ?? "").trim()
    if (rawId === "") continue
    const id = Number(rawId)
    if (!Number.isInteger(id) || id <= 0) {
      errors.push(`Baris hasil #${i + 1}: item checklist tidak valid`)
      continue
    }
    const result = ((results[i] ?? "").trim() || "na").toLowerCase()
    if (!["pass", "fail", "na"].includes(result)) {
      errors.push(`Baris hasil #${i + 1}: hasil harus pass/fail/na`)
      continue
    }
    rows.push({
      checklistItemId: id,
      result,
      measuredValue: (measured[i] ?? "").trim() || undefined,
      notes: (notes[i] ?? "").trim() || undefined,
    })
  }

  if (errors.length > 0) return { success: false, error: "Validasi gagal: " + errors.join("; ") }
  return { success: true, data: rows }
}

// ==================== NONCONFORMANCE ====================

export const NONCONFORMANCE_RESPONSIBILITIES = ["internal", "vendor", "customer"] as const
export const NONCONFORMANCE_SEVERITIES = ["minor", "major", "critical"] as const

export const createNonconformanceSchema = z.object({
  inspectionId: optionalPositiveId(),
  referenceType: z.enum(["WorkOrder", "ProductionOrder", "GoodsReceipt"], {
    message: "Jenis referensi tidak valid",
  }),
  referenceId: z.coerce.number().int().positive("Dokumen referensi tidak valid"),
  defectDescription: z.string().min(1, "Deskripsi cacat wajib diisi").max(4000),
  cause: optionalString(4000),
  responsibility: z.enum(NONCONFORMANCE_RESPONSIBILITIES).default("internal"),
  severity: z.enum(NONCONFORMANCE_SEVERITIES).default("minor"),
})

export const resolveNonconformanceSchema = z.object({
  status: z.enum(["rework", "rework_done", "rejected", "closed"], { message: "Status tidak valid" }),
  resolution: optionalString(4000),
  reworkCost: z.coerce.number().min(0).max(1_000_000_000).default(0),
  reworkHours: z.coerce.number().min(0).max(100_000).default(0),
})
