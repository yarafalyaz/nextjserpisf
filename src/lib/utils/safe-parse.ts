/**
 * Safe parsing utilities for form data and JSON.
 * Prevents NaN from entering the database and handles malformed JSON gracefully.
 */

/**
 * Safely parse a number from form data. Returns null if invalid.
 *
 * Hanya notasi desimal murni (opsional tanda +/-, digit, satu titik desimal) —
 * pola repo (/^[0-9]+$/ di route workflow/print/attachments/notifications dan
 * parseId invoice-exchange). Number() mentah menerima "0x10"->16, "1e3"->1000,
 * "0b101"->5, " 5"->5, ""->0: ID/nominal tak terduga lolos ke query.
 */
const DECIMAL_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/
export function safeNumber(value: FormDataEntryValue | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "string") {
    // Tanpa trim: " 5"/"5 " bukan notasi desimal murni — Number() mentah
    // menerimanya menjadi 5. Konsisten dengan /^[0-9]+$/ di route + parseId.
    if (!DECIMAL_RE.test(value)) return null
  }
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return num
}

/**
 * Safely parse a required number. Throws if invalid.
 */
export function requireNumber(value: FormDataEntryValue | null | undefined, fieldName: string): number {
  const num = safeNumber(value)
  if (num === null) {
    throw new Error(`Field "${fieldName}" harus berupa angka yang valid`)
  }
  return num
}

/**
 * Safely parse a positive integer (for IDs). Returns null if invalid.
 *
 * Desimal murni tanpa tanda/titik — "0x10"/"1e3"/"0b101"/" 5"/"+5"/"10.0"
 * ditolak (sebelumnya lolos Number() menjadi 16/1000/5/5/10/10).
 */
export function safeId(value: FormDataEntryValue | null | undefined): number | null {
  if (typeof value === "string" && !/^[0-9]+$/.test(value)) return null
  const num = safeNumber(value)
  if (num === null || num <= 0 || !Number.isInteger(num)) return null
  return num
}

/**
 * Safely parse a required ID. Throws if invalid.
 */
export function requireId(value: FormDataEntryValue | null | undefined, fieldName: string): number {
  const id = safeId(value)
  if (id === null) {
    throw new Error(`Field "${fieldName}" harus berupa ID yang valid`)
  }
  return id
}

/**
 * Safely parse a required string. Throws if empty.
 */
export function requireString(value: FormDataEntryValue | null | undefined, fieldName: string): string {
  const trimmed = typeof value === "string" ? value.trim() : ""
  if (!trimmed) {
    throw new Error(`Field "${fieldName}" wajib diisi`)
  }
  return trimmed
}

/**
 * Safely parse JSON. Returns null if invalid.
 */
export function safeJsonParse<T = unknown>(value: string | null | undefined): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

/**
 * Safely parse required JSON. Throws if invalid.
 */
export function requireJsonParse<T = unknown>(value: string | null | undefined, fieldName: string): T {
  const result = safeJsonParse<T>(value)
  if (result === null) {
    throw new Error(`Field "${fieldName}" berisi JSON yang tidak valid`)
  }
  return result
}

interface BasicItem {
  itemId: number
  qty: number
}

/**
 * Safely parse JSON array of items, filter out invalid itemIds/quantities,
 * and return typed, cleaned item objects.
 */
function isValidItem(item: unknown): item is Record<string, unknown> {
  if (typeof item !== "object" || item === null) return false
  const record = item as Record<string, unknown>
  return (
    typeof record.itemId === "number" &&
    Number.isFinite(record.itemId) &&
    record.itemId > 0 &&
    typeof record.qty === "number" &&
    Number.isFinite(record.qty) &&
    record.qty > 0
  )
}

export function parseValidItems(itemsJson: string | null | undefined): BasicItem[] {
  const items = safeJsonParse<unknown[]>(itemsJson) ?? []
  return items
    .filter(isValidItem)
    .map((item) => ({
      itemId: Number(item.itemId),
      qty: Number(item.qty),
    }))
}
