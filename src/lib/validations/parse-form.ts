import type { ZodType } from "zod"

/**
 * Extracts all entries from a FormData object into a plain object,
 * coercing values as needed for Zod validation:
 * - Empty strings → undefined
 * - "true"/"false" → boolean
 * - Numeric strings → number
 */
function formDataToObject(formData: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {}

  formData.forEach((value, field) => {
    // Skip File values — only process string entries
    if (typeof value !== "string") return

    const trimmed = value.trim()

    // Empty string → undefined (lets Zod optional() work correctly)
    if (trimmed === "") {
      obj[field] = undefined
      return
    }

    // Boolean coercion
    if (trimmed === "true" || trimmed === "on") {
      obj[field] = true
      return
    }
    if (trimmed === "false" || trimmed === "off") {
      obj[field] = false
      return
    }

    // Numeric values are intentionally left as strings here. Schemas that
    // expect numbers use z.coerce.number(), which converts safely at parse
    // time. Guessing the type here corrupted string identifiers — postal
    // codes ("40123"), bank account numbers, bare NPWP — by turning them into
    // numbers that string schemas then rejected, and risked silent precision
    // loss on 16-digit NIK values above Number.MAX_SAFE_INTEGER.
    obj[field] = trimmed
  })

  return obj
}

/**
 * Parse FormData against a Zod schema.
 * Returns validated data on success, or a joined error string on failure.
 */
export function parseFormData<T>(
  schema: ZodType<T>,
  formData: FormData,
): { success: true; data: T } | { success: false; error: string } {
  const raw = formDataToObject(formData)
  const result = schema.safeParse(raw)

  if (result.success) {
    return { success: true, data: result.data }
  }

  const fieldErrors = result.error.issues.map(
    (issue) => `${issue.path.join(".")}: ${issue.message}`,
  )

  return {
    success: false,
    error: "Validasi gagal: " + fieldErrors.join("; "),
  }
}
