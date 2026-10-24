// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { createElement } from "react"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import { EmployeeLifecycleAttentionCard } from "../employee-lifecycle-attention-card"
import {
  mountInto,
  unmount,
  withContainer,
} from "@/components/forms/__tests__/form-a11y-test-utils"
import type { EmployeeLifecycleAttentionRow } from "@/lib/reports/employee-lifecycle"

const row: EmployeeLifecycleAttentionRow = {
  employeeId: 7,
  name: "Budi Uji",
  kind: "contractExpiring",
  label: "Kontrak berakhir <= 30 hari",
  employmentStatus: "PKWT",
  employmentStatusLabel: "Kontrak (PKWT)",
  contractEndDate: new Date("2026-11-05T00:00:00.000Z"),
  employmentEndedAt: null,
  endReason: null,
  endReasonLabel: null,
  isActive: true,
}

describe("EmployeeLifecycleAttentionCard — F-2026-10-22-085-S", () => {
  it("render label §6 + status server apa adanya, tanpa nominal", () => {
    withContainer((container) => {
      const root = mountInto(container, createElement(EmployeeLifecycleAttentionCard, { rows: [row] }))
      const text = container.textContent ?? ""
      expect(text).toContain("Perhatian Siklus Hidup Karyawan")
      expect(text).toContain("Budi Uji")
      expect(text).toContain("Kontrak berakhir <= 30 hari")
      expect(text).toContain("Kontrak (PKWT)")
      expect(container.querySelector('a[href="/master/karyawan/7"]')).not.toBeNull()
      expect(text).not.toContain("Rp")
      expect(text.toLowerCase()).not.toContain("kompensasi")
      unmount(root, container)
    })
  })

  it("kosong: teks kosong jelas, tanpa tabel", () => {
    withContainer((container) => {
      const root = mountInto(container, createElement(EmployeeLifecycleAttentionCard, { rows: [] }))
      expect(container.textContent).toContain("Tidak ada karyawan yang memerlukan perhatian siklus hidup.")
      expect(container.querySelector("table")).toBeNull()
      unmount(root, container)
    })
  })

  it("error loader tampil verbatim role=alert", () => {
    withContainer((container) => {
      const root = mountInto(container, createElement(EmployeeLifecycleAttentionCard, { rows: [], error: "Gagal memuat perhatian" }))
      const alert = container.querySelector('[role="alert"]')
      expect(alert?.textContent).toBe("Gagal memuat perhatian")
      unmount(root, container)
    })
  })
})
