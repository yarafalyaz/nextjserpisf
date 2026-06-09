import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirstWorkflow: vi.fn(),
  findFirstApproval: vi.fn(),
  createApproval: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    approvalWorkflow: {
      findFirst: mocks.findFirstWorkflow,
    },
    approval: {
      findFirst: mocks.findFirstApproval,
      create: mocks.createApproval,
    },
  },
}));

import {
  requestApprovalIfConfigured,
  assertApproved,
} from "@/lib/services/approval-workflow.service";

describe("approval-workflow.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("requestApprovalIfConfigured", () => {
    it("returns false when no active workflow exists", async () => {
      mocks.findFirstWorkflow.mockResolvedValue(null);

      const result = await requestApprovalIfConfigured("Quotation", 1);

      expect(result).toBe(false);
      expect(mocks.createApproval).not.toHaveBeenCalled();
    });

    it("returns true and creates approval when workflow exists and no existing approval", async () => {
      mocks.findFirstWorkflow.mockResolvedValue({ id: 10, modelType: "Quotation", isActive: true });
      mocks.findFirstApproval.mockResolvedValue(null);
      mocks.createApproval.mockResolvedValue({ id: 1, status: "pending" });

      const result = await requestApprovalIfConfigured("Quotation", 5, 42);

      expect(result).toBe(true);
      expect(mocks.createApproval).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workflowId: 10,
          referenceType: "Quotation",
          referenceId: 5,
          currentStep: 1,
          status: "pending",
          requestedBy: 42,
        }),
      });
    });

    it("returns true when existing approval is pending (idempotent)", async () => {
      mocks.findFirstWorkflow.mockResolvedValue({ id: 10 });
      mocks.findFirstApproval.mockResolvedValue({ id: 1, status: "pending" });

      const result = await requestApprovalIfConfigured("Quotation", 5);

      expect(result).toBe(true);
      expect(mocks.createApproval).not.toHaveBeenCalled();
    });

    it("returns false when existing approval is already approved", async () => {
      mocks.findFirstWorkflow.mockResolvedValue({ id: 10 });
      mocks.findFirstApproval.mockResolvedValue({ id: 1, status: "approved" });

      const result = await requestApprovalIfConfigured("Quotation", 5);

      expect(result).toBe(false);
      expect(mocks.createApproval).not.toHaveBeenCalled();
    });

    it("returns false when existing approval is rejected", async () => {
      mocks.findFirstWorkflow.mockResolvedValue({ id: 10 });
      mocks.findFirstApproval.mockResolvedValue({ id: 1, status: "rejected" });

      const result = await requestApprovalIfConfigured("Quotation", 5);

      expect(result).toBe(false);
    });

    it("sets requestedBy to null when not provided", async () => {
      mocks.findFirstWorkflow.mockResolvedValue({ id: 10 });
      mocks.findFirstApproval.mockResolvedValue(null);
      mocks.createApproval.mockResolvedValue({ id: 1 });

      await requestApprovalIfConfigured("PurchaseOrder", 3);

      expect(mocks.createApproval).toHaveBeenCalledWith({
        data: expect.objectContaining({
          requestedBy: null,
        }),
      });
    });
  });

  describe("assertApproved", () => {
    it("does not throw when no approval record exists (no workflow)", async () => {
      mocks.findFirstApproval.mockResolvedValue(null);

      await expect(assertApproved("Invoice", 1)).resolves.toBeUndefined();
    });

    it("does not throw when approval status is approved", async () => {
      mocks.findFirstApproval.mockResolvedValue({ id: 1, status: "approved" });

      await expect(assertApproved("Invoice", 1)).resolves.toBeUndefined();
    });

    it("throws when approval status is rejected", async () => {
      mocks.findFirstApproval.mockResolvedValue({ id: 1, status: "rejected" });

      await expect(assertApproved("Invoice", 1)).rejects.toThrow(
        "Dokumen ditolak pada alur persetujuan"
      );
    });

    it("throws when approval status is pending", async () => {
      mocks.findFirstApproval.mockResolvedValue({ id: 1, status: "pending" });

      await expect(assertApproved("Invoice", 1)).rejects.toThrow(
        "Dokumen masih menunggu persetujuan"
      );
    });
  });
});
