import { describe, it, expect } from "vitest"
import {
  EMPLOYEE_LOAN_STATUSES,
  EMPLOYEE_LOAN_CHANNEL_LABELS,
  employeeLoanChannel,
  isEmployeeLoanStatus,
} from "../employee-loan-channel"

describe("employeeLoanChannel (Q-LS-3b turunan baca)", () => {
  it("mandiri bila pembuat tertaut tepat ke karyawan pemilik pinjaman", () => {
    expect(employeeLoanChannel({ employeeId: 7, creatorEmployeeId: 7 })).toBe(
      "mandiri",
    )
  })

  it("titipan bila pembuat tertaut ke karyawan lain", () => {
    expect(employeeLoanChannel({ employeeId: 7, creatorEmployeeId: 9 })).toBe(
      "titipan",
    )
  })

  it("titipan bila pembuat tidak tertaut karyawan mana pun", () => {
    expect(
      employeeLoanChannel({ employeeId: 7, creatorEmployeeId: null }),
    ).toBe("titipan")
  })

  it("label kanal verbatim untuk konsumen", () => {
    expect(EMPLOYEE_LOAN_CHANNEL_LABELS).toEqual({
      mandiri: "Pengajuan Mandiri",
      titipan: "Titipan Staf",
    })
  })
})

describe("kosakata status tertutup (Q-LS-4)", () => {
  it("hanya pending/active/rejected/paid_off yang sah", () => {
    expect(EMPLOYEE_LOAN_STATUSES).toEqual([
      "pending",
      "active",
      "rejected",
      "paid_off",
    ])
    for (const status of EMPLOYEE_LOAN_STATUSES) {
      expect(isEmployeeLoanStatus(status)).toBe(true)
    }
  })

  it("status karangan di luar kosakata ditolak", () => {
    for (const status of ["draft", "paid", "cancelled", "PENDING", ""]) {
      expect(isEmployeeLoanStatus(status)).toBe(false)
    }
  })
})
