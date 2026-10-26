import { hasPermission } from "./permissions"

/**
 * Visibilitas field nominal sensitif.
 *
 * Izin modul (view_employees, view_items) menentukan siapa boleh MEMBUKA
 * record; gerbang ini menentukan siapa boleh MELIHAT nominalnya. Masking
 * terjadi di server (loader/action membuang field) — bukan sekadar
 * menyembunyikan input di UI. super_admin lolos lewat hasPermission
 * seperti biasa.
 *
 * ponytail: helper cost/identity milik K3 menyusul di file ini; sekarang
 * hanya gerbang gaji yang dipakai salary-adjustment.actions (K1 HCMS).
 */
export async function canViewSalaryAmounts(): Promise<boolean> {
  return hasPermission("view_salary_amounts")
}
