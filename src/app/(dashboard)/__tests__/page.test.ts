import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/(dashboard)/page.tsx"),
  "utf8",
)

describe("DashboardPage query proyek (putaran 92)", () => {
  it("kartu dan daftar Mobil di Bengkel sama-sama wajib ber-kendaraan", () => {
    expect(source).toContain(
      "where: { status: { notIn: DONE_STATES }, customerVehicleId: { not: null } }",
    )
    expect(source).toContain(
      "where: { status: { notIn: DONE_STATES }, customerVehicleId: { not: null } },",
    )
  })

  it("selesai bulan ini memakai endDate transisi completed, bukan updatedAt status done yang tak pernah ditulis", () => {
    expect(source).toContain('status: "completed",')
    expect(source).toContain("endDate: { gte: startOfMonth }")
    expect(source).not.toContain('status: { in: ["completed", "done"] }')
    expect(source).not.toContain("updatedAt: { gte: startOfMonth }")
  })
})
