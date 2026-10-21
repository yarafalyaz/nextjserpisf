// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { EmployeeForm } from "../employee-form"
import {
  mountInto,
  unmount,
  withContainer,
  decorativeStars,
  labelTexts,
  assertFormEditLabel,
} from "./form-a11y-test-utils"

vi.mock("next/navigation", async () => (await import("./form-a11y-test-utils")).routerModule)
vi.mock("@/lib/utils/toast", async () => (await import("./form-a11y-test-utils")).toastModule)
vi.mock("@/lib/quick-add/registry", async () => (await import("./form-a11y-test-utils")).quickAddRegistryModule)

vi.mock("@/actions/master.actions", () => ({
  createEmployee: vi.fn().mockResolvedValue({ success: true }),
  updateEmployee: vi.fn().mockResolvedValue({ success: true }),
}))

// AddressPicker memanggil /api/address saat mount; jsdom tanpa server.
vi.mock("@/components/ui/address-picker", () => ({
  AddressPicker: () => null,
}))

const baseProps = { departments: [{ id: 1, name: "Operasional" }], positions: [{ id: 1, name: "Teknisi" }] }

describe("EmployeeForm — a11y wiring", () => {
  it("form tambah: aria-label + aria-busy false, Nama required, bintang dekoratif", () => {
    withContainer((container) => {
      const root = mountInto(container, <EmployeeForm {...baseProps} />)
      const form = container.querySelector("form")!
      expect(form.getAttribute("aria-label")).toBe("Formulir tambah karyawan")
      expect(form.getAttribute("aria-busy")).toBe("false")
      expect(container.querySelector("#name")!.getAttribute("required")).not.toBeNull()
      expect(decorativeStars(form).length).toBe(1)
      expect(labelTexts(form)).toContain("Nama *")
      unmount(root, container)
    })
  })

  it("form ubah: aria-label ubah karyawan", () => {
    withContainer((container) => {
      const root = mountInto(
        container,
        <EmployeeForm
          {...baseProps}
          employee={{
            id: 7,
            employeeNo: "K-007",
            name: "Budi Uji",
            email: null,
            phone: null,
            gender: null,
            dateOfBirth: null,
            maritalStatus: null,
            dependents: null,
            departmentId: null,
            positionId: null,
            joinDate: "2026-01-05",
            paymentFrequency: "MONTHLY",
            baseSalary: 5000000,
          }}
        />,
      )
      assertFormEditLabel(container, "Formulir ubah karyawan")
      unmount(root, container)
    })
  })
})
