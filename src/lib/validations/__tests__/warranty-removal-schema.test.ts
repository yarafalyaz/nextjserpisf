import { describe, expect, it } from "vitest"

import { recordInstalledPartRemovalSchema } from "../warranty.schemas"

// Penjaga langsung skema catat-lepas (LOW t_bcb5fc08): alasan kosong/spasi
// wajib ditolak di gerbang bentuk, bukan hanya guard service.
describe("recordInstalledPartRemovalSchema — alasan wajib", () => {
  const base = { installedPartId: 3, qtyRemoved: 1 }

  it("alasan kosong ditolak", () => {
    const r = recordInstalledPartRemovalSchema.safeParse({ ...base, removalReason: "" })
    expect(r.success).toBe(false)
  })

  it("alasan hanya spasi ditolak (trim sebelum min)", () => {
    const r = recordInstalledPartRemovalSchema.safeParse({ ...base, removalReason: "   " })
    expect(r.success).toBe(false)
  })

  it("alasan terisi lolos; spasi tepi ter-trim", () => {
    const r = recordInstalledPartRemovalSchema.safeParse({
      ...base,
      removalReason: "  Diganti part baru  ",
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.removalReason).toBe("Diganti part baru")
  })
})
