import { hasPermission } from "./permissions"

/**
 * Visibilitas field nominal sensitif.
 *
 * Izin modul (view_employees, view_items) menentukan siapa boleh MEMBUKA
 * record; gerbang ini menentukan siapa boleh MELIHAT nominalnya. Masking
 * terjadi di server (loader/action membuang field) — bukan sekadar
 * menyembunyikan input di UI. super_admin lolos lewat hasPermission
 * seperti biasa.
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
