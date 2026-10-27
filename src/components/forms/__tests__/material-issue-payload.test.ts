import { describe, it, expect, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"

/**
 * Pengeluaran Material dari form Inventaris harus membawa tautannya.
 *
 * Audit menemukan `MaterialIssue.workOrderId`/`projectId`/`costCenterId` ada di
 * skema (dan sudah disimpan aksi) tetapi form tak pernah mengirimnya, sehingga
 * setiap pengeluaran material buatan UI orphan: diabaikan laporan Job Order dan
 * jurnalnya kehilangan pusat biaya.
 *
 * Yang dijaga: `buildMaterialIssueFormData` mengirim kolom penaut hanya bila
 * terisi. String kosong berbahaya — `parseFormData` membacanya sebagai
 * `undefined`, yang pada `updateMaterialIssue` berarti "jangan sentuh" sehingga
 * kiriman kosong tak bisa dipakai untuk menghapus tautan secara tak sengaja.
 */

vi.mock("@/lib/db/prisma", () => ({ prisma: {}, TxClient: class {} }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: vi.fn() }))
vi.mock("@/actions/inventory.actions", () => ({
  createMaterialIssue: vi.fn(),
  updateMaterialIssue: vi.fn(),
}))
vi.mock("@/lib/utils/toast", () => ({ showSuccess: vi.fn(), showError: vi.fn() }))
vi.mock("@/lib/quick-add/registry", () => ({ QUICK_ADD: {} }))

import { buildMaterialIssueFormData } from "@/components/forms/material-issue-form"

const items = [
  { itemId: 11, qty: 2, unitCost: 5_000 },
  { itemId: 12, qty: 1, unitCost: 7_500 },
]

describe("buildMaterialIssueFormData", () => {
  it("selalu mengirim gudang, tanggal, dan baris item (tanpa kunci uid)", () => {
    const fd = buildMaterialIssueFormData({
      warehouseId: "3",
      date: "2026-10-17",
      items,
    })

    expect(fd.get("warehouseId")).toBe("3")
    expect(fd.get("date")).toBe("2026-10-17")
    expect(JSON.parse(String(fd.get("items")))).toEqual(
      items.map((it) => ({ ...it, scrapQty: 0, scrapReasonCode: null, scrapNote: null })),
    )
  })

  it("mengirim pusat biaya, perintah kerja, dan proyek bila terisi", () => {
    const fd = buildMaterialIssueFormData({
      warehouseId: "3",
      date: "2026-10-17",
      costCenterId: "4",
      workOrderId: "7",
      projectId: "9",
      items,
    })

    expect(fd.get("costCenterId")).toBe("4")
    expect(fd.get("workOrderId")).toBe("7")
    expect(fd.get("projectId")).toBe("9")
  })

  it("tidak mengirim kolom penaut kosong (bukan string kosong)", () => {
    const fd = buildMaterialIssueFormData({
      warehouseId: "3",
      date: "2026-10-17",
      costCenterId: "",
      workOrderId: undefined,
      projectId: null,
      items,
    })

    expect(fd.get("costCenterId")).toBeNull()
    expect(fd.get("workOrderId")).toBeNull()
    expect(fd.get("projectId")).toBeNull()
  })
})

describe("buildMaterialIssueFormData — scrap per baris (F-008 UI)", () => {
  it("membawa scrapQty/alasan/catatan per baris ke payload items", () => {
    const fd = buildMaterialIssueFormData({
      warehouseId: "3",
      date: "2026-10-17",
      items: [
        { itemId: 11, qty: 2, unitCost: 5_000, scrapQty: 0.3, scrapReasonCode: "salah_potong", scrapNote: "salah ukur" },
        { itemId: 12, qty: 1, unitCost: 7_500 },
      ],
    })
    expect(JSON.parse(String(fd.get("items")))).toEqual([
      { itemId: 11, qty: 2, unitCost: 5_000, scrapQty: 0.3, scrapReasonCode: "salah_potong", scrapNote: "salah ukur" },
      { itemId: 12, qty: 1, unitCost: 7_500, scrapQty: 0, scrapReasonCode: null, scrapNote: null },
    ])
  })

  it("string alasan/catatan kosong menjadi null (tanpa scrap)", () => {
    const fd = buildMaterialIssueFormData({
      warehouseId: "3",
      date: "2026-10-17",
      items: [{ itemId: 11, qty: 2, unitCost: 5_000, scrapQty: 0, scrapReasonCode: "", scrapNote: "  " }],
    })
    expect(JSON.parse(String(fd.get("items")))).toEqual([
      { itemId: 11, qty: 2, unitCost: 5_000, scrapQty: 0, scrapReasonCode: null, scrapNote: null },
    ])
  })

  it("form merender input qty scrap + alasan terstruktur per baris", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/components/forms/material-issue-form.tsx"),
      "utf8",
    )
    expect(source).toMatch(/Qty scrap baris/)
    expect(source).toMatch(/Alasan scrap baris/)
    expect(source).toMatch(/SCRAP_REASON_LABELS/)
    expect(source).toMatch(/validateScrapInput/)
  })
})

describe("field tautan di form pengeluaran material", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/components/forms/material-issue-form.tsx"),
    "utf8",
  )

  it("menerima workOrderId dari prop defaultWorkOrderId (jalur 'buat dari' segmen path)", () => {
    expect(source).toMatch(/defaultWorkOrderId/)
    expect(source).toMatch(/String\(defaultWorkOrderId\)/)
    expect(source).not.toMatch(/searchParams\.get\("workOrderId"\)/)
  })

  it("mengirim ketiga kolom penaut lewat buildMaterialIssueFormData", () => {
    expect(source).toMatch(/buildMaterialIssueFormData\(\{[\s\S]*?costCenterId,[\s\S]*?workOrderId,[\s\S]*?projectId,/)
  })
})
