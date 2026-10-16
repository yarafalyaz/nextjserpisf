import { describe, expect, it } from "vitest"

import {
  HR_ALL_ACCESS_ROLES,
  RESERVED_ROLE_NAMES,
  WAREHOUSE_ALL_ACCESS_ROLES,
  isReservedRoleName,
} from "../role-names"
import { ROLES } from "@/lib/setup/base-data"

/**
 * Kode memberi akses istimewa langsung berdasarkan NAMA role (semua gudang, semua
 * karyawan, bypass total). Daftarnya dulu ditulis ulang di `warehouse-scope.ts` dan
 * `hr-scope.ts`, dan memuat nama yang tidak pernah di-seed (`warehouse_manager`,
 * `logistics`, `hr`, `hr_manager`) sehingga cabangnya mati tanpa ada yang menyadari.
 * Tes ini menguncinya: satu sumber, dan hanya nama role yang benar-benar ada.
 */
describe("nama role istimewa", () => {
  it("akses lintas-gudang hanya memakai role yang benar-benar di-seed", () => {
    for (const role of WAREHOUSE_ALL_ACCESS_ROLES) {
      expect(ROLES).toContain(role)
    }
  })

  it("akses lintas-karyawan (HR) hanya memakai role yang benar-benar di-seed", () => {
    for (const role of HR_ALL_ACCESS_ROLES) {
      expect(ROLES).toContain(role)
    }
  })

  it("tidak ada lagi nama role mati di daftar akses", () => {
    const dead = ["warehouse_manager", "logistics", "hr", "hr_manager"]
    const allAccess = [...WAREHOUSE_ALL_ACCESS_ROLES, ...HR_ALL_ACCESS_ROLES]
    expect(allAccess.filter((role) => dead.includes(role))).toEqual([])
  })

  it("menolak nama role yang dicadangkan (case-insensitive, spasi dirapikan)", () => {
    for (const name of RESERVED_ROLE_NAMES) {
      expect(isReservedRoleName(name)).toBe(true)
      expect(isReservedRoleName(name.toUpperCase())).toBe(true)
      expect(isReservedRoleName(`  ${name}  `)).toBe(true)
    }
  })

  it("mengizinkan nama role biasa", () => {
    expect(isReservedRoleName("supervisor_bengkel")).toBe(false)
    expect(isReservedRoleName("auditor")).toBe(false)
  })

  it("super_admin selalu dicadangkan dan selalu punya akses penuh", () => {
    expect(isReservedRoleName("super_admin")).toBe(true)
    expect(WAREHOUSE_ALL_ACCESS_ROLES).toContain("super_admin")
    expect(HR_ALL_ACCESS_ROLES).toContain("super_admin")
  })
})
