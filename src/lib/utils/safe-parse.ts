/**
 * Safe parsing utilities for form data and JSON.
 * Prevents NaN from entering the database and handles malformed JSON gracefully.
 */

/**
 * Safely parse a number from form data. Returns null if invalid.
 */
export function safeNumber(value: FormDataEntryValue | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
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
 */
export function safeId(value: FormDataEntryValue | null | undefined): number | null {
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
