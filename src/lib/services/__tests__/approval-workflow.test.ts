import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirstWorkflow: vi.fn(),
  findFirstApproval: vi.fn(),
  createApproval: vi.fn(),
  queryRaw: vi.fn().mockResolvedValue([]),
  docFindUnique: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => {
  const docModelMock = { findUnique: mocks.docFindUnique };
  return {
    prisma: {
      approvalWorkflow: {
        findFirst: mocks.findFirstWorkflow,
      },
      approval: {
        findFirst: mocks.findFirstApproval,
        create: mocks.createApproval,
      },
      journal: docModelMock,
      vendorPayment: docModelMock,
      stockAdjustment: docModelMock,
      salesInvoice: docModelMock,
      $queryRaw: (...args: unknown[]) => mocks.queryRaw(...args),
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
        approvalWorkflow: { findFirst: (...args: unknown[]) => mocks.findFirstWorkflow(...args) },
        approval: {
          findFirst: (...args: unknown[]) => mocks.findFirstApproval(...args),
          create: (...args: unknown[]) => mocks.createApproval(...args),
        },
        journal: docModelMock,
        vendorPayment: docModelMock,
        stockAdjustment: docModelMock,
        salesInvoice: docModelMock,
        $queryRaw: (...args: unknown[]) => mocks.queryRaw(...args),
      })),
    },
  };
});

import {
  requestApprovalIfConfigured,
  assertApproved,
} from "@/lib/services/approval-workflow.service";

describe("approval-workflow.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([{ id: 10 }]);
    mocks.docFindUnique.mockResolvedValue(null);
  });

  describe("requestApprovalIfConfigured", () => {
    it("returns false when no active workflow exists", async () => {
      mocks.queryRaw.mockResolvedValue([]);

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

    it("returns true and requeues when existing approval is rejected", async () => {
      mocks.findFirstWorkflow.mockResolvedValue({ id: 10 });
      mocks.findFirstApproval.mockResolvedValue({ id: 1, status: "rejected" });
      mocks.createApproval.mockResolvedValue({ id: 2, status: "pending" });

      const result = await requestApprovalIfConfigured("Quotation", 5);

      // Penolakan bukan akhir: layanan membuka ulang dengan membuat approval
      // pending baru (dipakai jalur reopenApproval + route workflow).
      expect(result).toBe(true);
      expect(mocks.createApproval).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workflowId: 10,
          referenceType: "Quotation",
          referenceId: 5,
          status: "pending",
        }),
      });
    });

    it("R6WN-01: dokumen gate-only yang diedit sesudah approval final membuka pengajuan baru", async () => {
      mocks.findFirstWorkflow.mockResolvedValue({ id: 10 });
      mocks.findFirstApproval.mockResolvedValue({
        id: 1, status: "approved", completedAt: new Date("2026-10-01T00:00:00Z"),
      });
      mocks.docFindUnique.mockResolvedValue({ updatedAt: new Date("2026-10-02T00:00:00Z") });
      mocks.createApproval.mockResolvedValue({ id: 2, status: "pending" });

      const result = await requestApprovalIfConfigured("Journal", 5);

      expect(result).toBe(true);
      expect(mocks.createApproval).toHaveBeenCalledWith({
        data: expect.objectContaining({ referenceType: "Journal", referenceId: 5, status: "pending" }),
      });
    });

    it("R6WN-01: approval final tanpa edit sesudahnya tidak membuka pengajuan baru", async () => {
      mocks.findFirstWorkflow.mockResolvedValue({ id: 10 });
      mocks.findFirstApproval.mockResolvedValue({
        id: 1, status: "approved", completedAt: new Date("2026-10-02T00:00:00Z"),
      });
      mocks.docFindUnique.mockResolvedValue({ updatedAt: new Date("2026-10-01T00:00:00Z") });

      const result = await requestApprovalIfConfigured("Journal", 5);

      expect(result).toBe(false);
      expect(mocks.createApproval).not.toHaveBeenCalled();
    });

    it("R6WN-01: tipe non-basi (Quotation) tidak dicek updatedAt-nya", async () => {
      mocks.findFirstWorkflow.mockResolvedValue({ id: 10 });
      mocks.findFirstApproval.mockResolvedValue({
        id: 1, status: "approved", completedAt: new Date("2026-10-01T00:00:00Z"),
      });

      const result = await requestApprovalIfConfigured("Quotation", 5);

      expect(result).toBe(false);
      expect(mocks.docFindUnique).not.toHaveBeenCalled();
      expect(mocks.createApproval).not.toHaveBeenCalled();
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

    it("R6WN-01: menolak approval final yang lebih tua dari edit terakhir dokumen", async () => {
      mocks.findFirstApproval.mockResolvedValue({
        id: 1, status: "approved", completedAt: new Date("2026-10-01T00:00:00Z"),
      });
      mocks.docFindUnique.mockResolvedValue({ updatedAt: new Date("2026-10-02T00:00:00Z") });

      await expect(assertApproved("VendorPayment", 1)).rejects.toThrow(
        "berubah sesudah persetujuan final"
      );
    });

    it("R6WN-01: approval final segar (tanpa edit sesudahnya) tetap lolos", async () => {
      mocks.findFirstApproval.mockResolvedValue({
        id: 1, status: "approved", completedAt: new Date("2026-10-02T00:00:00Z"),
      });
      mocks.docFindUnique.mockResolvedValue({ updatedAt: new Date("2026-10-01T00:00:00Z") });

      await expect(assertApproved("VendorPayment", 1)).resolves.toBeUndefined();
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
