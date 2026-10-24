import { describe, it, expect } from "vitest"

import {
  buildInstalledPartsRegistry,
  type InstalledPartRegistryInput,
} from "../installed-parts"

/**
 * F-2026-10-22-072-S — builder registri part terpasang. Yang dijaga:
 * - status turunan qtyRemoved verbatim: TERPASANG / SEBAGIAN_DILEPAS /
 *   DILEPAS (falsifikasi: ubah ambang di service → merah di sini),
 * - qtyRemaining = qty - qtyRemoved (tidak negatif),
 * - sourceStatus bukan completed → sourceCancelled (Q-IP-5, baris
 *   tidak dihapus, status lepas tetap berjalan),
 * - kendaraan tanpa part = daftar kosong, bukan error.
 */

const D = (iso: string) => new Date(iso)

function part(over: Partial<InstalledPartRegistryInput> = {}): InstalledPartRegistryInput {
  return {
    id: 1, itemId: 100, itemName: "Aki 12V", itemSku: "AKI-12",
    serialNumber: "SN-1", qty: 1, qtyRemoved: 0,
    installedAt: D("2026-01-10"), warrantyExpiresAt: D("2027-01-10"),
    removedAt: null, removalReason: null, replacedByInstalledPartId: null,
    sourceStatus: "completed", sourceWorkOrderId: 10, sourceProjectId: null,
    ...over,
  }
}

describe("buildInstalledPartsRegistry", () => {
  it("qtyRemoved 0 → TERPASANG, activeCount menghitungnya", () => {
    const r = buildInstalledPartsRegistry({ parts: [part()] })
    expect(r.rows[0]).toMatchObject({ status: "TERPASANG", statusLabel: "TERPASANG", qtyRemaining: 1 })
    expect(r.activeCount).toBe(1)
    expect(r.total).toBe(1)
  })

  it("lepas sebagian → SEBAGIAN_DILEPAS + sisa benar", () => {
    const r = buildInstalledPartsRegistry({ parts: [part({ qty: 4, qtyRemoved: 1 })] })
    expect(r.rows[0]).toMatchObject({ status: "SEBAGIAN_DILEPAS", qtyRemaining: 3 })
    expect(r.activeCount).toBe(0)
  })

  it("lepas penuh → DILEPAS + removedAt/alasan diteruskan", () => {
    const r = buildInstalledPartsRegistry({
      parts: [part({ qty: 2, qtyRemoved: 2, removedAt: D("2026-03-01"), removalReason: "Diganti baru" })],
    })
    expect(r.rows[0]).toMatchObject({
      status: "DILEPAS", qtyRemaining: 0, removalReason: "Diganti baru",
    })
    expect(r.rows[0].removedAt?.toISOString().slice(0, 10)).toBe("2026-03-01")
  })

  it("sumber tidak lagi completed → sourceCancelled, status lepas tidak berubah (Q-IP-5)", () => {
    const r = buildInstalledPartsRegistry({ parts: [part({ sourceStatus: "cancelled" })] })
    expect(r.rows[0]).toMatchObject({ sourceCancelled: true, status: "TERPASANG" })
  })

  it("tanpa coverage → warrantyExpiresAt null diteruskan", () => {
    const r = buildInstalledPartsRegistry({ parts: [part({ warrantyExpiresAt: null })] })
    expect(r.rows[0].warrantyExpiresAt).toBeNull()
  })

  it("kendaraan tanpa part: daftar kosong jujur, bukan error", () => {
    expect(buildInstalledPartsRegistry({ parts: [] })).toEqual({ rows: [], total: 0, activeCount: 0 })
  })

  it("urut tanggal pasang terbaru dulu", () => {
    const r = buildInstalledPartsRegistry({
      parts: [part({ id: 1, installedAt: D("2026-01-01") }), part({ id: 2, installedAt: D("2026-02-01") })],
    })
    expect(r.rows.map((x) => x.id)).toEqual([2, 1])
  })
})
