import { describe, it, expect } from "vitest"
import {
  updateSystemSettingsSchema,
  updateStorageSettingsSchema,
} from "../settings.schemas"

describe("updateSystemSettingsSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    const result = updateSystemSettingsSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it("accepts empty string for optionalString fields (union string branch matches)", () => {
    const result = updateSystemSettingsSchema.parse({ costingMethod: "" })
    expect(result.costingMethod).toBe("")
  })

  it("keeps non-empty optionalString values", () => {
    const result = updateSystemSettingsSchema.parse({ costingMethod: "FIFO" })
    expect(result.costingMethod).toBe("FIFO")
  })

  it("allows null for optionalNullString fields", () => {
    const result = updateSystemSettingsSchema.parse({ companyName: null })
    expect(result.companyName).toBeNull()
  })

  it("rejects optionalString over its max length", () => {
    const result = updateSystemSettingsSchema.safeParse({
      currencyCode: "X".repeat(11),
    })
    expect(result.success).toBe(false)
  })

  it("rejects companyPhone over 50 chars", () => {
    const result = updateSystemSettingsSchema.safeParse({
      companyPhone: "9".repeat(51),
    })
    expect(result.success).toBe(false)
  })

  it("accepts integer account ids and rejects non-integers", () => {
    expect(
      updateSystemSettingsSchema.safeParse({ salesRevenueAccountId: 12 }).success,
    ).toBe(true)
    expect(
      updateSystemSettingsSchema.safeParse({ salesRevenueAccountId: 1.5 }).success,
    ).toBe(false)
  })

  it("allows null for optionalInt fields", () => {
    const result = updateSystemSettingsSchema.parse({ fiscalYearStartMonth: null })
    expect(result.fiscalYearStartMonth).toBeNull()
  })

  it("accepts decimal values for optionalDecimal fields", () => {
    const result = updateSystemSettingsSchema.parse({ attendanceRadiusKm: 2.5 })
    expect(result.attendanceRadiusKm).toBe(2.5)
  })

  it("validates boolean toggle fields", () => {
    expect(
      updateSystemSettingsSchema.safeParse({ enableAutoItemCode: true }).success,
    ).toBe(true)
    expect(
      updateSystemSettingsSchema.safeParse({ enableAutoItemCode: "yes" }).success,
    ).toBe(false)
  })

  it("rejects quotationFooterNotes over 2000 chars", () => {
    expect(
      updateSystemSettingsSchema.safeParse({
        quotationFooterNotes: "n".repeat(2001),
      }).success,
    ).toBe(false)
    expect(
      updateSystemSettingsSchema.safeParse({
        quotationFooterNotes: "n".repeat(2000),
      }).success,
    ).toBe(true)
  })

  it("accepts a full realistic settings payload", () => {
    const result = updateSystemSettingsSchema.safeParse({
      companyName: "Bengkel Maju",
      companyEmail: "info@bengkel.test",
      costingMethod: "FIFO",
      fiscalYearStartMonth: 1,
      currencyCode: "IDR",
      currencySymbol: "Rp",
      enableAutoItemCode: true,
      itemCodePrefix: "ITM",
      overtimeMultiplier: 1.5,
      attendanceRadiusKm: 0.5,
      salesReceivableAccountId: 101,
      _redirectTo: "/settings",
    })
    expect(result.success).toBe(true)
  })
})

describe("updateSystemSettingsSchema — payroll/geofence/fiscal bounds", () => {
  it("rejects a negative latePenaltyPerMinute (would turn a penalty into a salary bonus)", () => {
    expect(
      updateSystemSettingsSchema.safeParse({ latePenaltyPerMinute: -100 }).success,
    ).toBe(false)
    expect(
      updateSystemSettingsSchema.safeParse({ latePenaltyPerMinute: 100 }).success,
    ).toBe(true)
  })

  it("rejects a negative overtime multiplier/coefficient (would flip overtime into a deduction)", () => {
    expect(updateSystemSettingsSchema.safeParse({ overtimeMultiplier: -1 }).success).toBe(false)
    expect(updateSystemSettingsSchema.safeParse({ overtimeCoefficient: -0.5 }).success).toBe(false)
    expect(updateSystemSettingsSchema.safeParse({ overtimeMultiplier: 2 }).success).toBe(true)
  })

  it("rejects a negative attendance radius (would break geofencing)", () => {
    expect(updateSystemSettingsSchema.safeParse({ attendanceRadiusKm: -1 }).success).toBe(false)
    expect(updateSystemSettingsSchema.safeParse({ attendanceRadiusKm: 0 }).success).toBe(true)
  })

  it("bounds fiscalYearStartMonth to 1..12", () => {
    expect(updateSystemSettingsSchema.safeParse({ fiscalYearStartMonth: 0 }).success).toBe(false)
    expect(updateSystemSettingsSchema.safeParse({ fiscalYearStartMonth: 13 }).success).toBe(false)
    expect(updateSystemSettingsSchema.safeParse({ fiscalYearStartMonth: 1 }).success).toBe(true)
    expect(updateSystemSettingsSchema.safeParse({ fiscalYearStartMonth: 12 }).success).toBe(true)
  })

  it("bounds payrollCutoffDay to 1..31", () => {
    expect(updateSystemSettingsSchema.safeParse({ payrollCutoffDay: 0 }).success).toBe(false)
    expect(updateSystemSettingsSchema.safeParse({ payrollCutoffDay: 32 }).success).toBe(false)
    expect(updateSystemSettingsSchema.safeParse({ payrollCutoffDay: 25 }).success).toBe(true)
  })

  it("rejects a negative maxLatePenaltyMinutes", () => {
    expect(updateSystemSettingsSchema.safeParse({ maxLatePenaltyMinutes: -5 }).success).toBe(false)
    expect(updateSystemSettingsSchema.safeParse({ maxLatePenaltyMinutes: 60 }).success).toBe(true)
  })

  it("still allows null for the bounded numeric fields (unset)", () => {
    const result = updateSystemSettingsSchema.parse({
      fiscalYearStartMonth: null,
      latePenaltyPerMinute: null,
      attendanceRadiusKm: null,
      payrollCutoffDay: null,
    })
    expect(result.fiscalYearStartMonth).toBeNull()
    expect(result.latePenaltyPerMinute).toBeNull()
  })
})

describe("updateStorageSettingsSchema", () => {
  it("defaults storageDriver to 'local' when omitted", () => {
    const result = updateStorageSettingsSchema.parse({})
    expect(result.storageDriver).toBe("local")
  })

  it("accepts an explicit storage driver", () => {
    const result = updateStorageSettingsSchema.parse({ storageDriver: "r2" })
    expect(result.storageDriver).toBe("r2")
  })

  it("rejects storageDriver over 50 chars", () => {
    const result = updateStorageSettingsSchema.safeParse({
      storageDriver: "d".repeat(51),
    })
    expect(result.success).toBe(false)
  })

  it("accepts r2 credential placeholders", () => {
    const result = updateStorageSettingsSchema.safeParse({
      storageDriver: "r2",
      r2AccountId: "acct-placeholder",
      r2AccessKeyId: "key-placeholder",
      r2Bucket: "assets",
      "r2SecretAccessKey": "placeholder-value",
    })
    expect(result.success).toBe(true)
  })

  it("allows storageFallbackLocal toggle", () => {
    const result = updateStorageSettingsSchema.parse({ storageFallbackLocal: true })
    expect(result.storageFallbackLocal).toBe(true)
  })
})
