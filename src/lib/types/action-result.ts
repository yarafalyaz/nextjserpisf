/**
 * Standard server action response types.
 * All actions should return ActionResult for consistency.
 */
export type ActionSuccess<T = undefined> = T extends undefined
  ? { success: true }
  : { success: true; data: T }

export type ActionError = {
  success: false
  error: string
}

export type ActionResult<T = undefined> = ActionSuccess<T> | ActionError

/** Helper to create success responses */
export function ok(): { success: true }
export function ok<T>(data: T): { success: true; data: T }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ok(data?: any): { success: true } | { success: true; data: any } {
  if (data !== undefined) return { success: true, data }
  return { success: true }
}

/** Helper to create error responses */
export function fail(error: string): ActionError {
  return { success: false, error }
}
