// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

import type { Root } from "react-dom/client"
import { SupplierClaimAgingCard } from "../supplier-claim-aging-card"
import { renderCard, unmountCard, clearRenderedCards } from "./card-test-utils"
import {
  buildSupplierClaimAging,
  type SupplierClaimAgingInput,
} from "@/lib/reports/supplier-claim-aging"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

const NOW = new Date("2026-10-24T05:00:00.000Z") // 12:00 WIB
const TODAY = getWibTodayUtcDate(NOW)
const day = (offset: number) => new Date(TODAY.getTime() + offset * 86_400_000)

function input(over: Partial<SupplierClaimAgingInput> = {}): SupplierClaimAgingInput {
  return {
    claimId: 1,
    claimStatus: "closed",
    supplierClaimStatus: "sent",
    supplierClaimAt: day(-45),
    supplierClaimRefNo: "REF-1",
    vendorId: 7,
    vendorName: "Vendor Uji",
    purchaseReturnId: 9,
    purchaseReturnDocumentNo: "PR-009",
    purchaseReturnStatus: "draft",
    coverageId: 11,
    itemId: 31,
    itemName: "Item Uji",
    itemSku: "SKU-1",
    serialNumber: "SN-1",
    customerId: 21,
    customerName: "Pelanggan Uji",
    customerVehicleId: 41,
    plateNumber: "B 1234 CD",
    vehicleName: "Kendaraan Uji",
    reportedAt: day(-50),
    ...over,
  }
}

describe("SupplierClaimAgingCard F-2026-10-24-095-S BR-SUPP-11", () => {
  let root: Root | undefined
  afterEach(() => {
    if (root) unmountCard(root)
    root = undefined
    clearRenderedCards()
  })

  it("judul/notice verbatim + baris ditempel apa adanya dari builder (umur 45, ember 31-60)", () => {
    const aging = buildSupplierClaimAging([input({})], { now: NOW })
    const rendered = renderCard(<SupplierClaimAgingCard aging={aging} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(
      rendered.container.querySelector('[aria-label="Aging Klaim Supplier Terbuka"]'),
    ).not.toBeNull()
    expect(text).toContain("Aging Klaim Supplier Terbuka")
    expect(text).toContain(
      "Daftar ini membaca status klaim supplier yang masih terbuka; tidak mengubah status klaim supplier atau klaim pelanggan, dan tidak memposting jurnal recovery.",
    )
    expect(text).toContain("1 klaim terbuka")
    expect(text).toContain("tertua 45 hari")
    const badges = [...rendered.container.querySelectorAll("span.rounded-full")].map(
      (el) => el.textContent,
    )
    expect(badges).toEqual(["Terkirim ke supplier"])
    expect(text).toContain("45 hari")
    expect(text).toContain("31-60 hari")
    expect(text).toContain("Vendor Uji")
    expect(text).toContain("Item Uji")
    expect(text).toContain("SKU-1")
    expect(text).toContain("SN-1")
    expect(text).toContain("REF-1")
    expect(text).toContain("Retur PR-009")
    expect(text).toContain("Pelanggan Uji")
    expect(text).toContain("B 1234 CD")
    const detail = [...rendered.container.querySelectorAll("a")].find(
      (a) => a.getAttribute("href") === "/produksi/garansi/1",
    )
    expect(detail).not.toBeUndefined()
  })

  it("tanpa tanggal: label verbatim + umur em-dash, tanpa mutasi/telepon/WA", () => {
    const aging = buildSupplierClaimAging(
      [input({ supplierClaimStatus: "drafted", supplierClaimAt: null })],
      { now: NOW },
    )
    const rendered = renderCard(<SupplierClaimAgingCard aging={aging} />)
    root = rendered.root
    const text = rendered.container.textContent ?? ""
    expect(text).toContain("Draf klaim supplier")
    expect(text).toContain("Tanpa tanggal klaim supplier")
    expect(text).toContain("Tanpa tanggal")
    expect(text).not.toContain("wa.me")
    expect(text).not.toContain("Kirim")
    expect(rendered.container.querySelector("form")).toBeNull()
    expect(rendered.container.querySelector("button")).toBeNull()
  })

  it("kosong: teks kosong verbatim", () => {
    const aging = buildSupplierClaimAging([], { now: NOW })
    const rendered = renderCard(<SupplierClaimAgingCard aging={aging} />)
    root = rendered.root
    expect(rendered.container.textContent ?? "").toContain(
      "Tidak ada klaim supplier terbuka saat ini.",
    )
  })
})
