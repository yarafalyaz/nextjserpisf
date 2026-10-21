import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Fitment per dokumen (F-2026-10-21-023 lapis aman).
 * Yang dijaga: konfigurasi diturunkan dari rantai master; most-specific
 * menang, seri id terbaru; jasa/tanpa-item dilewati; unknown bukan cocok;
 * loader null bila dokumen tanpa kendaraan; read-only (hanya find*).
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    customerVehicle: { findFirst: vi.fn() },
    vehicleFitmentRule: { findMany: vi.fn() },
    item: { findMany: vi.fn() },
    quotation: { findFirst: vi.fn() },
    workOrder: { findFirst: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import {
  buildFitmentForDocument,
  configurationFromCustomerVehicle,
  evaluateLineFitment,
  FITMENT_FOR_DOCUMENT_NOTICE,
  type FitmentRuleInput,
} from "../fitment-for-document"
import { getQuotationFitment, getWorkOrderFitment } from "../fitment-for-document-data"

const CONFIG = {
  vehicleBrandId: 1,
  vehicleModelId: 10,
  vehicleVariantId: 100,
  year: 2020,
  drivetrain: "4WD",
  transmission: "Manual",
}

function rule(over: Partial<FitmentRuleInput>): FitmentRuleInput {
  return {
    id: 1,
    itemId: 10,
    bomRevisionId: null,
    vehicleBrandId: null,
    vehicleModelId: null,
    vehicleVariantId: null,
    yearFrom: null,
    yearTo: null,
    drivetrain: null,
    transmission: null,
    result: "compatible",
    source: null,
    notes: null,
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.item.findMany.mockResolvedValue([])
})

describe("configurationFromCustomerVehicle", () => {
  it("memetakan rantai master ke konfigurasi evaluasi", () => {
    expect(
      configurationFromCustomerVehicle({
        customerVehicleId: 7,
        vehicleYear: 2019,
        variantId: 100,
        variantDrivetrain: "4WD",
        variantTransmission: "AT",
        modelId: 10,
        brandId: 1,
      }),
    ).toEqual({
      vehicleBrandId: 1,
      vehicleModelId: 10,
      vehicleVariantId: 100,
      year: 2019,
      drivetrain: "4WD",
      transmission: "AT",
    })
  })
})

describe("evaluateLineFitment", () => {
  it("tanpa aturan cocok = unknown ruleId null", () => {
    const r = evaluateLineFitment(CONFIG, 10, [])
    expect(r.result).toBe("unknown")
    expect(r.ruleId).toBeNull()
  })

  it("most-specific menang atas aturan brand umum", () => {
    const r = evaluateLineFitment(CONFIG, 10, [
      rule({ id: 1, vehicleBrandId: 1, result: "compatible" }),
      rule({ id: 2, vehicleVariantId: 100, result: "incompatible", notes: "mentok" }),
    ])
    expect(r.result).toBe("incompatible")
    expect(r.ruleId).toBe(2)
    expect(r.notes).toBe("mentok")
  })

  it("seri specificity diputus id terbaru", () => {
    const r = evaluateLineFitment(CONFIG, 10, [
      rule({ id: 3, vehicleVariantId: 100, result: "compatible" }),
      rule({ id: 9, vehicleVariantId: 100, result: "incompatible" }),
    ])
    expect(r.ruleId).toBe(9)
    expect(r.result).toBe("incompatible")
  })

  it("scope tahun/drivetrain tak cocok tidak menang walau spesifik", () => {
    const r = evaluateLineFitment(CONFIG, 10, [
      rule({ id: 1, vehicleVariantId: 100, yearFrom: 2021, result: "incompatible" }),
      rule({ id: 2, vehicleBrandId: 1, result: "compatible" }),
    ])
    expect(r.ruleId).toBe(2)
  })

  it("aturan revisi BOM lain tidak berlaku; revisi sama berlaku", () => {
    const rules = [
      rule({ id: 1, bomRevisionId: 5, result: "incompatible" }),
      rule({ id: 2, result: "compatible" }),
    ]
    expect(evaluateLineFitment(CONFIG, 10, rules).ruleId).toBe(2)
    expect(evaluateLineFitment(CONFIG, 10, rules, 5).ruleId).toBe(1)
  })

  it("result aturan bukan compatible/incompatible dibaca unknown", () => {
    const r = evaluateLineFitment(CONFIG, 10, [rule({ id: 1, result: "perlu-cek" })])
    expect(r.result).toBe("unknown")
    expect(r.ruleId).toBe(1)
  })
})

describe("buildFitmentForDocument", () => {
  it("jasa dan baris tanpa item dilewati, counts konsisten", () => {
    const r = buildFitmentForDocument({
      configuration: CONFIG,
      rules: [rule({ id: 1, itemId: 10, result: "incompatible" })],
      lines: [
        { lineId: 1, itemId: 10, description: "Shock", isService: false },
        { lineId: 2, itemId: 11, description: "Ban", isService: false },
        { lineId: 3, itemId: 12, description: "Jasa pasang", isService: true },
        { lineId: 4, itemId: null, description: "Baris bebas", isService: false },
      ],
    })
    expect(r.lines).toHaveLength(2)
    expect(r.counts).toEqual({ compatible: 0, incompatible: 1, unknown: 1, skipped: 2 })
    expect(r.notice).toBe(FITMENT_FOR_DOCUMENT_NOTICE)
    expect(r.lines[0].result).toBe("incompatible")
  })
})

describe("loader", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prismaMock.vehicleFitmentRule.findMany.mockResolvedValue([])
    mocks.prismaMock.item.findMany.mockResolvedValue([])
    mocks.prismaMock.customerVehicle.findFirst.mockResolvedValue({
      id: 7,
      vehicle: {
        year: 2020,
        variant: {
          id: 100,
          drivetrain: "4WD",
          transmission: "Manual",
          model: { id: 10, vehicleBrandId: 1 },
        },
      },
    })
  })

  it("quotation tanpa kendaraan = null, aturan tidak dimuat", async () => {
    mocks.prismaMock.quotation.findFirst.mockResolvedValue({
      customerVehicleId: null,
      sections: [],
    })
    await expect(getQuotationFitment(1)).resolves.toBeNull()
    expect(mocks.prismaMock.customerVehicle.findFirst).not.toHaveBeenCalled()
  })

  it("quotation berkendaraan mengevaluasi baris semua section", async () => {
    mocks.prismaMock.quotation.findFirst.mockResolvedValue({
      customerVehicleId: 7,
      sections: [
        {
          items: [
            { id: 1, itemId: 10, description: "Shock" },
            { id: 2, itemId: 12, description: "Jasa" },
          ],
        },
      ],
    })
    mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 12 }])
    mocks.prismaMock.vehicleFitmentRule.findMany.mockResolvedValue([
      rule({ id: 5, itemId: 10, vehicleVariantId: 100, result: "incompatible" }),
    ])
    const r = await getQuotationFitment(1)
    expect(r?.counts).toEqual({ compatible: 0, incompatible: 1, unknown: 0, skipped: 1 })
    expect(r?.configuration.vehicleVariantId).toBe(100)
    expect(mocks.prismaMock.vehicleFitmentRule.findMany).toHaveBeenCalledTimes(1)
  })

  it("workOrder meneruskan bomRevisionId WO ke evaluasi", async () => {
    mocks.prismaMock.workOrder.findFirst.mockResolvedValue({
      customerVehicleId: 7,
      bomRevisionId: 5,
      items: [{ id: 1, itemId: 10, description: "Shock" }],
    })
    mocks.prismaMock.vehicleFitmentRule.findMany.mockResolvedValue([
      rule({ id: 1, itemId: 10, bomRevisionId: 5, result: "incompatible" }),
      rule({ id: 2, itemId: 10, result: "compatible" }),
    ])
    const r = await getWorkOrderFitment(9)
    expect(r?.lines[0].ruleId).toBe(1)
    expect(r?.lines[0].result).toBe("incompatible")
  })

  it("dokumen tidak ditemukan = null", async () => {
    mocks.prismaMock.workOrder.findFirst.mockResolvedValue(null)
    await expect(getWorkOrderFitment(404)).resolves.toBeNull()
  })
})
