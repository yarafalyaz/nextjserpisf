import { hasPermission } from "./permissions"

/**
 * Field-level visibility for sensitive amounts.
 *
 * Module permissions (view_employees, view_items) decide who may OPEN a
 * record; these decide who may SEE the money on it. Masking happens on
 * the server (loaders/actions strip the fields) — never by merely hiding
 * inputs in the UI. super_admin bypasses via hasPermission as usual.
 */
export async function canViewSalaryAmounts(): Promise<boolean> {
  return hasPermission("view_salary_amounts")
}

export async function canViewCostAmounts(): Promise<boolean> {
  return hasPermission("view_cost_amounts")
}

export async function canViewSensitiveIdentity(): Promise<boolean> {
  return hasPermission("view_sensitive_identity")
}
