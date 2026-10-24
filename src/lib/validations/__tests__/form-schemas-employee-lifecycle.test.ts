import { describe, it, expect } from "vitest"
import { employeeSchema } from "@/lib/validations/form.schemas"

const base = { name: "Budi", joinDate: "2026-01-05" }

describe("employeeSchema lifecycle F-085-S", () => {
  it("tanggal berhenti tanpa alasan ditolak pesan persis server", () => {
    const r = employeeSchema.safeParse({ ...base, employmentEndedAt: "2026-10-15", endReason: "" })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues.map((i) => i.message)).toContain("Tanggal berhenti dan alasan berhenti wajib diisi bersamaan")
  })
  it("alasan tanpa tanggal berhenti ditolak", () => {
    const r = employeeSchema.safeParse({ ...base, employmentEndedAt: "", endReason: "resigned" })
    expect(r.success).toBe(false)
  })
  it("pasangan lengkap lolos; keduanya kosong lolos", () => {
    expect(employeeSchema.safeParse({ ...base, employmentEndedAt: "2026-10-15", endReason: "resigned" }).success).toBe(true)
    expect(employeeSchema.safeParse({ ...base }).success).toBe(true)
  })
})
