import { NextResponse } from "next/server"

/**
 * Standard API error response shape.
 *
 * Every API route should return this shape so the frontend (and any
 * client SDK) can reliably read error codes and messages:
 *
 *   { error: { code: "NOT_FOUND", message: "Dokumen tidak ditemukan" } }
 *
 * HTTP status codes carry the semantics; `code` is a stable, uppercased,
 * English identifier safe for programmatic branching. `message` is the
 * user-facing, localized string.
 */

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"

const STATUS_MAP: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
}

interface ApiErrorBody {
  error: {
    code: ApiErrorCode
    message: string
  }
}

/**
 * Create a standardized error response.
 *
 * @example
 *   return apiError("NOT_FOUND", "Dokumen tidak ditemukan")
 *   return apiError("FORBIDDEN") // message defaults to the code name
 */
export function apiError(
  code: ApiErrorCode,
  message?: string,
  init?: ResponseInit,
): NextResponse<ApiErrorBody> {
  const status = STATUS_MAP[code] ?? 500
  return NextResponse.json(
    { error: { code, message: message ?? code } },
    { status, ...init },
  )
}

/**
 * Standard success response wrapper for consistency.
 *
 * @example
 *   return apiOk({ data: item, total: 1 })
 */
export function apiOk<T>(data: T, init?: ResponseInit): NextResponse<{ data: T }> {
  return NextResponse.json({ data }, init)
}
