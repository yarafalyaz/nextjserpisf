// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

import { BomRevisionImpactCard } from "../bom-revision-impact-card"
import {
  buildBomRevisionImpact,
  type BomRevisionImpact,
} from "@/lib/reports/bom-revision-impact"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"

afterEach(() => {
  clearRenderedCards()
})

function sampleImpact(): BomRevisionImpact {
  return buildBomRevisionImpact({
    workOrders: [
      {
        id: 1,
        documentNo: "WO-001",
        status: "in_progress",
        items: [
          { id: 11, itemId: 100, qty: 5, status: "open" },
          { id: 12, itemId: 101, qty: 2, status: "open" },
        ],
        // 3 dari 5 baris pertama sudah keluar (completed) -> terkunci
        issuedItems: [{ workOrderItemId: 11, itemId: 100, qty: 3 }],
      },
      {
        id: 2,
        documentNo: "WO-002",
        status: "draft",
        items: [{ id: 21, itemId: 100, qty: 4, status: "open" }],
        issuedItems: [],
      },
    ],
    productionOrderCount: 2,
    purchaseOrders: [
      {
        id: 9,
        documentNo: "PO-009",
        status: "ordered",
        workOrderId: 1,
        items: [{ qty: 10, receivedQty: 4 }],
      },
    ],
  })
}

describe("BomRevisionImpactCard F-2026-10-22-068-S AC-BOM68-8", () => {
  it("baris ter-issue berlabel terkunci eksplisit; baris bersih tanpa label (AC-BOM68-6)", () => {
    const { container, root } = renderCard(
      <BomRevisionImpactCard impact={sampleImpact()} currentRevisionNo={2} />,
    )
    const text = container.textContent ?? ""
    expect(container.querySelector('[aria-label="Dampak Revisi BOM Terpasang"]')).not.toBeNull()
    expect(text).toContain("Rev. 2 terpasang")
    expect(text).toContain("WO-001")
    expect(text).toContain("Dalam Proses")
    // angka verbatim builder: keluar 3, belum keluar (5-3)+2=4, baris ter-issue 1
    expect(text).toContain("Sudah ter-issue — terkunci")
    expect(text).toContain("WO-002")
    expect(text).toContain("Belum ada material keluar")
    // tepat satu label terkunci (hanya WO-001)
    expect(text.split("Sudah ter-issue — terkunci").length - 1).toBe(1)
    // ringkasan verbatim builder
    expect(text).toContain("1 perintah kerja sudah punya material keluar")
    expect(text).toContain("2 order produksi memakai revisi ini")
    expect(text).toContain("sisa order pembelian terbuka 6")
    unmountCard(root)
  })

  it("tanpa WO pin: pesan kosong, bukan tabel", () => {
    const impact = buildBomRevisionImpact({
      workOrders: [],
      productionOrderCount: 0,
      purchaseOrders: [],
    })
    const { container, root } = renderCard(
      <BomRevisionImpactCard impact={impact} currentRevisionNo={1} />,
    )
    expect(container.textContent ?? "").toContain(
      "Tidak ada perintah kerja yang memakai revisi BOM ini",
    )
    expect(container.querySelector("table")).toBeNull()
    unmountCard(root)
  })
})
