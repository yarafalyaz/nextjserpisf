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

  it("weeklyInstallment opsional: tanpa bintang dekoratif, hint terhubung aria-describedby, tidak wajib", () => {
    withContainer((container) => {
      const root = mountInto(container, <EmployeeLoanForm employees={employees} />)
      const form = container.querySelector("form")!
      expect(labelTexts(form)).toEqual(
        expect.arrayContaining(["Cicilan Mingguan (Perjanjian Tertulis, Rp)"]),
      )
      const input = container.querySelector("#weeklyInstallment")!
      expect(input.getAttribute("required")).toBeNull()
      expect(input.getAttribute("aria-describedby")).toBe("weeklyInstallment-hint")
      const hint = container.querySelector("#weeklyInstallment-hint")!
      expect(hint.textContent).toContain("WEEKLY")
      // Tetap 3 bintang: mingguan bukan field wajib.
      expect(decorativeStars(form).length).toBe(3)
      // Hidden submit field kosong: skema memetakan "" -> null (HIGH-1).
      expect(container.querySelector<HTMLInputElement>('input[name="weeklyInstallment"]')!.value).toBe("")
      unmount(root, container)
    })
  })

  it("mode ubah: weeklyInstallment tersimpan tampil apa adanya dari loan", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <EmployeeLoanForm employees={employees} loan={{ ...loan, weeklyInstallment: 25000 }} />,
      )
      expect(container.querySelector<HTMLInputElement>("#weeklyInstallment")!.value).toBe("25.000")
      expect(container.querySelector<HTMLInputElement>('input[name="weeklyInstallment"]')!.value).toBe("25000")
      unmount(root, container)
    })
  })

  it("HIGH-1: FormData form baru mingguan kosong lolos skema sebagai null; 0 eksplisit tetap gagal", async () => {
    const { employeeLoanSchema } = await import("@/lib/validations/hrm.schemas")
    const { parseFormData } = await import("@/lib/validations/parse-form")
    function loanFormData(container: HTMLElement) {
      const formData = new FormData()
      formData.set("employeeId", "1")
      for (const [name, input] of Object.entries({
        loanDate: container.querySelector<HTMLInputElement>('input[name="loanDate"]')!,
        totalAmount: container.querySelector<HTMLInputElement>('input[name="totalAmount"]')!,
        monthlyInstallment: container.querySelector<HTMLInputElement>('input[name="monthlyInstallment"]')!,
        weeklyInstallment: container.querySelector<HTMLInputElement>('input[name="weeklyInstallment"]')!,
      })) {
        formData.set(name, input?.value ?? "")
      }
      return formData
    }
    await new Promise<void>((resolve) => {
      withContainer((container) => {
        const root = mountInto(container, <EmployeeLoanForm employees={employees} />)
        const filled = loanFormData(container)
        filled.set("loanDate", "2026-10-01")
        filled.set("totalAmount", "1000000")
        filled.set("monthlyInstallment", "100000")
        expect(filled.get("weeklyInstallment")).toBe("")
        const empty = parseFormData(employeeLoanSchema, filled)
        expect(empty.success).toBe(true)
        if (empty.success) expect(empty.data.weeklyInstallment).toBeNull()

        filled.set("weeklyInstallment", "0")
        const zero = parseFormData(employeeLoanSchema, filled)
        expect(zero.success).toBe(false)
        if (!zero.success) expect(zero.error).toContain("Cicilan mingguan harus lebih dari 0")

        filled.set("weeklyInstallment", "25000")
        const valued = parseFormData(employeeLoanSchema, filled)
        expect(valued.success).toBe(true)
        if (valued.success) expect(valued.data.weeklyInstallment).toBe(25000)
        unmount(root, container)
        resolve()
      })
    })
  })
})
