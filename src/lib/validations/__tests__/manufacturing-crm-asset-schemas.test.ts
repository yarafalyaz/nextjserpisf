import { describe, it, expect } from "vitest";
import {
  createProductSchema,
  createProductionOrderSchema,
} from "@/lib/validations/manufacturing.schemas";
import { createTicketSchema, updateTicketSchema } from "@/lib/validations/crm.schemas";
import {
  assetCategorySchema,
  assetBrandSchema,
  assetTransferSchema,
  assetSchema,
  assetDisposalSchema,
} from "@/lib/validations/asset.schemas";

describe("validations/manufacturing.schemas", () => {
  it("createProductSchema accepts valid product", () => {
    expect(createProductSchema.safeParse({ name: "Paket Servis" }).success).toBe(true);
  });
  it("createProductSchema rejects empty name", () => {
    expect(createProductSchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("createProductionOrderSchema requires productId and qty>=1", () => {
    expect(createProductionOrderSchema.safeParse({ productId: 1, qty: 5 }).success).toBe(true);
    expect(createProductionOrderSchema.safeParse({ productId: 1, qty: 0 }).success).toBe(false);
    expect(createProductionOrderSchema.safeParse({ qty: 5 }).success).toBe(false);
  });
});

describe("validations/crm.schemas", () => {
  it("createTicketSchema accepts valid ticket", () => {
    expect(createTicketSchema.safeParse({ subject: "Keluhan AC" }).success).toBe(true);
  });
  it("createTicketSchema rejects empty subject", () => {
    expect(createTicketSchema.safeParse({ subject: "" }).success).toBe(false);
  });
  it("createTicketSchema accepts optional customer details", () => {
    expect(createTicketSchema.safeParse({
      subject: "X", customerId: 1, customerName: "Budi", priority: "high",
    }).success).toBe(true);
  });
  it("updateTicketSchema accepts resolutionNotes", () => {
    expect(updateTicketSchema.safeParse({ subject: "X", resolutionNotes: "Sudah diperbaiki" }).success).toBe(true);
  });
});

describe("validations/asset.schemas", () => {
  it("assetCategorySchema accepts valid category", () => {
    expect(assetCategorySchema.safeParse({ name: "Peralatan Bengkel" }).success).toBe(true);
  });
  it("assetCategorySchema rejects empty name", () => {
    expect(assetCategorySchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("assetCategorySchema rejects negative depreciationRate", () => {
    expect(assetCategorySchema.safeParse({ name: "X", depreciationRate: -5 }).success).toBe(false);
  });
  it("assetBrandSchema requires name", () => {
    expect(assetBrandSchema.safeParse({ name: "Bosch" }).success).toBe(true);
    expect(assetBrandSchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("assetTransferSchema requires assetId, toLocation, transferDate", () => {
    expect(assetTransferSchema.safeParse({
      assetId: 1, toLocation: "Gudang B", transferDate: "2026-06-09",
    }).success).toBe(true);
    expect(assetTransferSchema.safeParse({
      assetId: 1, toLocation: "", transferDate: "2026-06-09",
    }).success).toBe(false);
    expect(assetTransferSchema.safeParse({
      toLocation: "Gudang B", transferDate: "2026-06-09",
    }).success).toBe(false);
  });
  it("assetSchema requires name", () => {
    expect(assetSchema.safeParse({ name: "Kompresor" }).success).toBe(true);
    expect(assetSchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("assetSchema rejects negative purchasePrice", () => {
    expect(assetSchema.safeParse({ name: "X", purchasePrice: -100 }).success).toBe(false);
  });
  it("assetDisposalSchema requires assetId", () => {
    expect(assetDisposalSchema.safeParse({ assetId: 1 }).success).toBe(true);
    expect(assetDisposalSchema.safeParse({}).success).toBe(false);
  });
});
