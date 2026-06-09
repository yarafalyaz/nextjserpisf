import { describe, it, expect } from "vitest";
import { createProjectSchema, createTaskSchema, updateTaskSchema } from "@/lib/validations/project.schemas";
import {
  vehicleBrandSchema,
  vehicleModelSchema,
  vehicleVariantSchema,
  vehicleSchema,
  customerVehicleSchema,
} from "@/lib/validations/vehicle.schemas";
import {
  stockAdjustmentSchema,
  inventoryTransferSchema,
  materialIssueSchema,
} from "@/lib/validations/inventory.schemas";

describe("validations/project.schemas", () => {
  it("createProjectSchema accepts valid project", () => {
    expect(createProjectSchema.safeParse({ name: "Proyek A", customerId: 1 }).success).toBe(true);
  });
  it("createProjectSchema rejects empty name", () => {
    expect(createProjectSchema.safeParse({ name: "", customerId: 1 }).success).toBe(false);
  });
  it("createProjectSchema rejects missing customerId", () => {
    expect(createProjectSchema.safeParse({ name: "Proyek A" }).success).toBe(false);
  });
  it("createTaskSchema accepts valid task with default status", () => {
    const r = createTaskSchema.safeParse({ projectId: 1, name: "Tugas A" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.status).toBe("pending");
  });
  it("updateTaskSchema rejects missing id", () => {
    expect(updateTaskSchema.safeParse({ projectId: 1, name: "Tugas A" }).success).toBe(false);
  });
});

describe("validations/vehicle.schemas", () => {
  it("vehicleBrandSchema accepts valid brand", () => {
    expect(vehicleBrandSchema.safeParse({ name: "Toyota" }).success).toBe(true);
  });
  it("vehicleBrandSchema rejects empty name", () => {
    expect(vehicleBrandSchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("vehicleModelSchema requires brandId", () => {
    expect(vehicleModelSchema.safeParse({ name: "Avanza", brandId: 1 }).success).toBe(true);
    expect(vehicleModelSchema.safeParse({ name: "Avanza" }).success).toBe(false);
  });
  it("vehicleVariantSchema requires modelId", () => {
    expect(vehicleVariantSchema.safeParse({ name: "1.5 G", modelId: 1 }).success).toBe(true);
    expect(vehicleVariantSchema.safeParse({ name: "1.5 G" }).success).toBe(false);
  });
  it("vehicleSchema requires plateNo", () => {
    expect(vehicleSchema.safeParse({ plateNo: "B 1234 XYZ" }).success).toBe(true);
    expect(vehicleSchema.safeParse({ plateNo: "" }).success).toBe(false);
  });
  it("vehicleSchema rejects year before 1900", () => {
    expect(vehicleSchema.safeParse({ plateNo: "B 1 X", year: 1899 }).success).toBe(false);
  });
  it("customerVehicleSchema requires customerId", () => {
    expect(customerVehicleSchema.safeParse({ customerId: 1 }).success).toBe(true);
    expect(customerVehicleSchema.safeParse({}).success).toBe(false);
  });
});

describe("validations/inventory.schemas", () => {
  it("stockAdjustmentSchema requires warehouseId and date", () => {
    expect(stockAdjustmentSchema.safeParse({ warehouseId: 1, date: "2026-06-09" }).success).toBe(true);
    expect(stockAdjustmentSchema.safeParse({ warehouseId: 0, date: "2026-06-09" }).success).toBe(false);
    expect(stockAdjustmentSchema.safeParse({ warehouseId: 1, date: "" }).success).toBe(false);
  });
  it("inventoryTransferSchema requires source + destination warehouses", () => {
    expect(inventoryTransferSchema.safeParse({
      sourceWarehouseId: 1, destinationWarehouseId: 2, date: "2026-06-09",
    }).success).toBe(true);
    expect(inventoryTransferSchema.safeParse({
      sourceWarehouseId: 1, date: "2026-06-09",
    }).success).toBe(false);
  });
  it("materialIssueSchema requires warehouseId", () => {
    expect(materialIssueSchema.safeParse({ warehouseId: 1, date: "2026-06-09" }).success).toBe(true);
    expect(materialIssueSchema.safeParse({ date: "2026-06-09" }).success).toBe(false);
  });
});
