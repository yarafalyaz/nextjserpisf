import { describe, it, expect } from "vitest"

import {
  ADMIN_WHITELIST,
  FINANCE_WHITELIST,
  GA_WHITELIST,
  KABENG_WHITELIST,
  KARYAWAN_WHITELIST,
  PERMISSIONS,
  PURCHASING_WHITELIST,
  STAFF_WHITELIST,
  SYSTEM_ADMIN_PERMISSIONS,
  WAREHOUSE_WHITELIST,
} from "../base-data"

/**
 * Ratchet izin sensitif per role bawaan.
 *
 * Whitelist di `base-data.ts` adalah matriks role × permission yang
 * di-seed ke setiap instalasi (dan seed meng-overwrite grant di DB saat
 * dijalankan ulang). Izin "sensitif" — menghapus data, menyetujui
 * dokumen, mem-posting jurnal, memproses payroll, mengelola user/role/
 * pengaturan — hanya boleh dipegang role yang tercantum di
 * `EXPECTED_SENSITIVE` di bawah. Menambah izin sensitif ke whitelist
 * tanpa memperbarui peta ini memerahkan test: pelebaran hak akses harus
 * keputusan yang disadari dan tertinjau, bukan selipan edit biasa.
 *
 * Hanya `super_admin` yang menerima "ALL" by design. `admin` memegang
 * seluruh katalog kecuali izin administrasi sistem (`SYSTEM_ADMIN_PERMISSIONS`)
 * — dikunci oleh test terakhir di file ini.
 */

const SENSITIVE =
  /^(delete_|approve_|post_|process_)|^(manage_users|manage_roles|manage_settings)$/

const WHITELISTS: Record<string, readonly string[]> = {
  staff: STAFF_WHITELIST,
  ga: GA_WHITELIST,
  kepala_bengkel: KABENG_WHITELIST,
  karyawan: KARYAWAN_WHITELIST,
  purchasing: PURCHASING_WHITELIST,
  warehouse: WAREHOUSE_WHITELIST,
  finance: FINANCE_WHITELIST,
}

/** Izin sensitif yang memang sengaja dipegang tiap role bawaan. */
const EXPECTED_SENSITIVE: Record<string, string[]> = {
  staff: [],
  ga: [
    "delete_recruitments",
    "delete_performance",
    "delete_competencies",
    "delete_trainings",
    "delete_succession",
    "delete_assets",
    "delete_asset_brands",
    "delete_asset_categories",
    "delete_asset_transfers",
    "delete_vehicles",
    "delete_vehicle_brands",
    "delete_vehicle_models",
    "delete_vehicle_fitments",
    "approve_leave_requests",
    "delete_leave_requests",
    "delete_projects",
    "delete_holidays",
  ],
  kepala_bengkel: [
    "approve_bom_revisions",
    "approve_leave_requests",
    "approve_overtime_requests",
    "approve_warranty_claims",
  ],
  karyawan: [],
  purchasing: [],
  warehouse: ["process_stock_adjustments"],
  finance: [
    "delete_accounts",
    "post_journals",
    "delete_journals",
    "approve_expenses",
    "approve_journals",
    "delete_expenses",
    "delete_petty_cash",
    "delete_cost_centers",
    "delete_profit_centers",
    "delete_down_payments",
    "process_payroll",
    "delete_loans",
    "delete_taxes",
    "delete_payment_terms",
    "delete_payment_methods",
    "approve_vendor_bills",
    "delete_vendor_bills",
    "approve_vendor_payments",
    "delete_vendor_payments",
    "post_sales_invoices",
    "delete_sales_invoices",
    "approve_sales_invoices",
    "delete_sales_payments",
  ],
}

describe("matriks role bawaan: izin sensitif terkunci", () => {
  it("setiap role hanya memegang izin sensitif yang terdaftar", () => {
    for (const [role, whitelist] of Object.entries(WHITELISTS)) {
      const actual = whitelist.filter((p) => SENSITIVE.test(p)).sort()
      const expected = [...(EXPECTED_SENSITIVE[role] ?? [])].sort()
      expect(
        actual,
        `Izin sensitif role '${role}' berubah. Bila memang disengaja, perbarui EXPECTED_SENSITIVE dengan sadar.`,
      ).toEqual(expected)
    }
  })

  it("tidak ada role bawaan yang mengelola user, role, atau pengaturan sistem", () => {
    for (const [role, whitelist] of Object.entries(WHITELISTS)) {
      const forbidden = whitelist.filter((p) =>
        ["manage_users", "manage_roles", "manage_settings"].includes(p),
      )
      expect(forbidden, `Role '${role}' tidak boleh memegang izin administrasi sistem`).toEqual([])
    }
  })

  it("admin memegang seluruh katalog kecuali izin administrasi sistem", () => {
    const missing = PERMISSIONS.filter((p) => !ADMIN_WHITELIST.includes(p))
    expect(new Set(missing)).toEqual(new Set(SYSTEM_ADMIN_PERMISSIONS))
    expect(ADMIN_WHITELIST).toHaveLength(PERMISSIONS.length - SYSTEM_ADMIN_PERMISSIONS.length)
  })
})
