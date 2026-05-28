import { describe, it, expect } from "vitest"

function canCheckIn(existingToday: boolean, isHoliday: boolean, onApprovedLeave: boolean) {
  if (existingToday) return { ok: false, reason: "already_checked_in" }
  if (isHoliday) return { ok: false, reason: "holiday" }
  if (onApprovedLeave) return { ok: false, reason: "approved_leave" }
  return { ok: true as const }
}

function attendanceStatus(nowMinutes: number, startMinutes: number, endMinutes: number) {
  const isLate = nowMinutes > startMinutes
  const lateMinutes = isLate ? nowMinutes - startMinutes : 0
  const isHalfDayAtCheckout = nowMinutes < endMinutes
  return { isLate, lateMinutes, isHalfDayAtCheckout }
}

function payrollNet(params: {
  baseSalary: number
  allowances: number
  deductions: number
  overtimeTotal: number
  appreciationTotal: number
  loanDeduction: number
  lateDeduction: number
}) {
  return (
    params.baseSalary +
    params.allowances +
    params.overtimeTotal +
    params.appreciationTotal -
    params.deductions -
    params.loanDeduction -
    params.lateDeduction
  )
}

describe("HRM parity scenarios", () => {
  it("attendance guard: check-in once/day + holiday + leave", () => {
    expect(canCheckIn(true, false, false)).toEqual({ ok: false, reason: "already_checked_in" })
    expect(canCheckIn(false, true, false)).toEqual({ ok: false, reason: "holiday" })
    expect(canCheckIn(false, false, true)).toEqual({ ok: false, reason: "approved_leave" })
    expect(canCheckIn(false, false, false)).toEqual({ ok: true })
  })

  it("attendance calc: late + half_day", () => {
    const start = 8 * 60
    const end = 17 * 60

    expect(attendanceStatus(8 * 60 + 15, start, end)).toEqual({
      isLate: true,
      lateMinutes: 15,
      isHalfDayAtCheckout: true,
    })

    expect(attendanceStatus(17 * 60 + 5, start, end)).toEqual({
      isLate: true,
      lateMinutes: 545,
      isHalfDayAtCheckout: false,
    })
  })

  it("payroll recalc net after update", () => {
    const net = payrollNet({
      baseSalary: 10_000_000,
      allowances: 500_000,
      deductions: 200_000,
      overtimeTotal: 300_000,
      appreciationTotal: 100_000,
      loanDeduction: 250_000,
      lateDeduction: 50_000,
    })

    expect(net).toBe(10_400_000)
  })

  it("payroll status transitions", () => {
    const canApprove = (status: string) => status === "draft"
    const canMarkPaid = (status: string) => status === "approved"

    expect(canApprove("draft")).toBe(true)
    expect(canApprove("approved")).toBe(false)
    expect(canMarkPaid("approved")).toBe(true)
    expect(canMarkPaid("draft")).toBe(false)
  })
})
