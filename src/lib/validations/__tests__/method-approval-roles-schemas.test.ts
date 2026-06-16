import { describe, it, expect } from "vitest";
import {
  createPaymentMethodSchema,
  updatePaymentMethodSchema,
  createShippingMethodSchema,
  updateShippingMethodSchema,
} from "@/lib/validations/method.schemas";
import {
  approveStepSchema,
  rejectStepSchema,
  createWorkflowSchema,
  workflowStepSchema,
  workflowStepsSchema,
} from "@/lib/validations/approval.schemas";
import { createRoleSchema, updateRoleSchema } from "@/lib/validations/roles.schemas";
import { selfAttendanceLocationSchema } from "@/lib/validations/self-attendance.schemas";

describe("validations/method.schemas", () => {
  it("createPaymentMethodSchema accepts valid (code optional, default isActive false)", () => {
    const r = createPaymentMethodSchema.safeParse({ name: "Transfer Bank" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isActive).toBe(false);
  });
  it("createPaymentMethodSchema rejects empty name", () => {
    expect(createPaymentMethodSchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("createPaymentMethodSchema accepts code and isActive true", () => {
    const r = createPaymentMethodSchema.safeParse({ code: "BANK", name: "Transfer Bank", isActive: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isActive).toBe(true);
  });
  it("createPaymentMethodSchema handles empty code (passes as empty string)", () => {
    const r = createPaymentMethodSchema.safeParse({ code: "", name: "X" });
    expect(r.success).toBe(true);
  });
  it("updatePaymentMethodSchema requires code", () => {
    expect(updatePaymentMethodSchema.safeParse({ code: "cash", name: "Tunai" }).success).toBe(true);
    expect(updatePaymentMethodSchema.safeParse({ code: "", name: "Tunai" }).success).toBe(false);
  });
  it("updatePaymentMethodSchema rejects empty name", () => {
    expect(updatePaymentMethodSchema.safeParse({ code: "cash", name: "" }).success).toBe(false);
  });
  it("createShippingMethodSchema accepts valid", () => {
    expect(createShippingMethodSchema.safeParse({ name: "Kurir" }).success).toBe(true);
  });
  it("createShippingMethodSchema handles empty code", () => {
    const r = createShippingMethodSchema.safeParse({ code: "", name: "Kurir" });
    expect(r.success).toBe(true);
  });
  it("createShippingMethodSchema rejects empty name", () => {
    expect(createShippingMethodSchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("updateShippingMethodSchema requires code", () => {
    expect(updateShippingMethodSchema.safeParse({ code: "pickup", name: "Ambil Sendiri" }).success).toBe(true);
    expect(updateShippingMethodSchema.safeParse({ name: "Ambil Sendiri" }).success).toBe(false);
  });
  it("updateShippingMethodSchema rejects empty name", () => {
    expect(updateShippingMethodSchema.safeParse({ code: "pickup", name: "" }).success).toBe(false);
  });
});

describe("validations/approval.schemas", () => {
  it("approveStepSchema accepts empty (notes optional)", () => {
    expect(approveStepSchema.safeParse({}).success).toBe(true);
  });
  it("rejectStepSchema accepts notes", () => {
    expect(rejectStepSchema.safeParse({ notes: "Ditolak karena anggaran" }).success).toBe(true);
  });
  it("createWorkflowSchema accepts valid (default isActive true)", () => {
    const r = createWorkflowSchema.safeParse({ name: "Approval PO", modelType: "PurchaseOrder" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.isActive).toBe(true);
  });
  it("createWorkflowSchema rejects empty name", () => {
    expect(createWorkflowSchema.safeParse({ name: "", modelType: "PurchaseOrder" }).success).toBe(false);
  });
  it("createWorkflowSchema rejects empty modelType", () => {
    expect(createWorkflowSchema.safeParse({ name: "X", modelType: "" }).success).toBe(false);
  });

  it("workflowStepSchema accepts roleId step", () => {
    expect(workflowStepSchema.safeParse({ name: "Manager", roleId: 3 }).success).toBe(true);
  });
  it("workflowStepSchema accepts userId step (per-user approver)", () => {
    expect(workflowStepSchema.safeParse({ name: "Boss", userId: 7 }).success).toBe(true);
  });
  it("workflowStepSchema accepts null roleId/userId", () => {
    expect(workflowStepSchema.safeParse({ roleId: null, userId: null }).success).toBe(true);
  });
  it("workflowStepSchema rejects non-positive roleId", () => {
    expect(workflowStepSchema.safeParse({ roleId: 0 }).success).toBe(false);
    expect(workflowStepSchema.safeParse({ roleId: -1 }).success).toBe(false);
  });
  it("workflowStepSchema rejects non-integer roleId", () => {
    expect(workflowStepSchema.safeParse({ roleId: 1.5 }).success).toBe(false);
  });
  it("workflowStepSchema rejects non-numeric roleId", () => {
    expect(workflowStepSchema.safeParse({ roleId: "abc" }).success).toBe(false);
  });
  it("workflowStepSchema rejects name over 255 chars", () => {
    expect(workflowStepSchema.safeParse({ name: "a".repeat(256) }).success).toBe(false);
  });
  it("workflowStepSchema rejects approverType over 100 chars", () => {
    expect(workflowStepSchema.safeParse({ approverType: "x".repeat(101) }).success).toBe(false);
  });
  it("workflowStepsSchema rejects non-array input", () => {
    expect(workflowStepsSchema.safeParse({ name: "x" }).success).toBe(false);
  });
  it("workflowStepsSchema rejects more than 50 steps", () => {
    const many = Array.from({ length: 51 }, () => ({ name: "S" }));
    expect(workflowStepsSchema.safeParse(many).success).toBe(false);
  });
  it("workflowStepsSchema accepts up to 50 valid steps", () => {
    const fifty = Array.from({ length: 50 }, (_, i) => ({ name: `S${i}`, roleId: i + 1 }));
    expect(workflowStepsSchema.safeParse(fifty).success).toBe(true);
  });
});

describe("validations/roles.schemas", () => {
  it("createRoleSchema accepts valid name", () => {
    expect(createRoleSchema.safeParse({ name: "manager" }).success).toBe(true);
  });
  it("createRoleSchema rejects empty name", () => {
    expect(createRoleSchema.safeParse({ name: "" }).success).toBe(false);
  });
  it("updateRoleSchema rejects name over 100 chars", () => {
    expect(updateRoleSchema.safeParse({ name: "a".repeat(101) }).success).toBe(false);
  });
});

describe("validations/self-attendance.schemas", () => {
  it("accepts valid coordinates", () => {
    expect(selfAttendanceLocationSchema.safeParse({ latitude: -6.2, longitude: 106.8 }).success).toBe(true);
  });
  it("accepts empty object (GPS optional)", () => {
    expect(selfAttendanceLocationSchema.safeParse({}).success).toBe(true);
  });
  it("rejects latitude out of range", () => {
    expect(selfAttendanceLocationSchema.safeParse({ latitude: 91 }).success).toBe(false);
    expect(selfAttendanceLocationSchema.safeParse({ latitude: -91 }).success).toBe(false);
  });
  it("rejects longitude out of range", () => {
    expect(selfAttendanceLocationSchema.safeParse({ longitude: 181 }).success).toBe(false);
    expect(selfAttendanceLocationSchema.safeParse({ longitude: -181 }).success).toBe(false);
  });
});
