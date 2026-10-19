// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { EmployeeLoanForm } from "../employee-loan-form"
import {
  mountInto, unmount, withContainer, decorativeStars, labelTexts, combobox,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)
vi.mock("@/actions/hrm.actions", () => ({
  createEmployeeLoan: vi.fn().mockResolvedValue({ success: true }),
  updateEmployeeLoan: vi.fn().mockResolvedValue({ success: true }),
}))

const employees = [{ id: 1, name: "Budi" }, { id: 2, name: "Ani" }]
const loan = {
  id: 9, employeeId: 1, loanDate: "2026-10-01", totalAmount: 1000000,
  monthlyInstallment: 100000, remainingAmount: 900000, status: "active", notes: null,
}

describe("EmployeeLoanForm — a11y wiring", () => {
  it("form aria-label tambah + aria-busy false; karyawan aria-required; bintang dekoratif aria-hidden", () => {
    withContainer((container) => {
      const root = mountInto(container, <EmployeeLoanForm employees={employees} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah pinjaman karyawan")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(combobox(container).getAttribute("aria-required")).toBe("true")
      expect(container.querySelector("#totalAmount")!.getAttribute("required")).not.toBeNull()
      expect(container.querySelector("#monthlyInstallment")!.getAttribute("required")).not.toBeNull()
      expect(decorativeStars(form).length).toBe(3)
      expect(labelTexts(form)).toEqual(expect.arrayContaining([
        "Karyawan *", "Jumlah Pinjaman (Rp) *", "Cicilan per Bulan (Rp) *",
      ]))
      unmount(root, container)
    })
  })

  it("mode ubah: aria-label ubah pinjaman karyawan", () => {
    withContainer((container) => {
      const root = mountInto(container, <EmployeeLoanForm employees={employees} loan={loan} />)
      expect(container.querySelector("form")!.getAttribute("aria-label")).toBe("Formulir ubah pinjaman karyawan")
      unmount(root, container)
    })
  })
})
