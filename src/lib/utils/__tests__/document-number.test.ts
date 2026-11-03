import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  next: vi.fn(),
  peek: vi.fn(),
  getSystemSettings: vi.fn(),
  // per-model findMany delegates
  quotationFindMany: vi.fn(),
  customerFindMany: vi.fn(),
  qcChecklistFindMany: vi.fn(),
  qcInspectionFindMany: vi.fn(),
  nonconformanceFindMany: vi.fn(),
  taxPaymentFindMany: vi.fn(),
  vendorCreditFindMany: vi.fn(),
  bankReconciliationFindMany: vi.fn(),
}));

vi.mock("@/lib/services/document-sequence.service", () => ({
  DocumentSequenceService: { next: mocks.next, peek: mocks.peek },
}));

vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: mocks.getSystemSettings,
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    quotation: { findMany: mocks.quotationFindMany },
    customer: { findMany: mocks.customerFindMany },
    qcChecklist: { findMany: mocks.qcChecklistFindMany },
    qcInspection: { findMany: mocks.qcInspectionFindMany },
    nonconformance: { findMany: mocks.nonconformanceFindMany },
    taxPayment: { findMany: mocks.taxPaymentFindMany },
    vendorCredit: { findMany: mocks.vendorCreditFindMany },
    bankReconciliation: { findMany: mocks.bankReconciliationFindMany },
  },
}));

import { generateDocumentNumber, peekNextDocumentNumber } from "@/lib/utils/document-number";

describe("utils/document-number", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSystemSettings.mockResolvedValue({ companyName: "Yara ERP" });
    mocks.quotationFindMany.mockResolvedValue([]);
    mocks.customerFindMany.mockResolvedValue([]);
    mocks.qcChecklistFindMany.mockResolvedValue([]);
    mocks.qcInspectionFindMany.mockResolvedValue([]);
    mocks.nonconformanceFindMany.mockResolvedValue([]);
    mocks.taxPaymentFindMany.mockResolvedValue([]);
    mocks.vendorCreditFindMany.mockResolvedValue([]);
    mocks.bankReconciliationFindMany.mockResolvedValue([]);
    mocks.next.mockResolvedValue(1);
    mocks.peek.mockResolvedValue(0);
  });

  describe("floor kunci putaran 85", () => {
    it("VC membaca floor dari vendorCredit.documentNo existing", async () => {
      mocks.vendorCreditFindMany.mockResolvedValue([{ documentNo: "0007/VC/YAR/10/2026" }])
      mocks.next.mockResolvedValue(8)
      await generateDocumentNumber("VC")
      expect(mocks.vendorCreditFindMany).toHaveBeenCalled()
      expect(mocks.next).toHaveBeenCalledWith(expect.any(String), 7)
    })

    it("REC membaca floor dari bankReconciliation.reconciliationNumber (simple)", async () => {
      mocks.bankReconciliationFindMany.mockResolvedValue([{ reconciliationNumber: "REC-0012" }])
      mocks.next.mockResolvedValue(13)
      const result = await generateDocumentNumber("REC", "simple")
      expect(mocks.next).toHaveBeenCalledWith(expect.any(String), 12)
      expect(result).toBe("REC-0013")
    })
  })

  describe("generateDocumentNumber (complex)", () => {
    it("formats as NNN/PREFIX/COMPANY/MM/YYYY", async () => {
      mocks.next.mockResolvedValue(5);
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yyyy = now.getFullYear();

      const result = await generateDocumentNumber("QUO");

      // companyName "Yara ERP" → "YAR"
      expect(result).toBe(`005/QUO/YAR/${mm}/${yyyy}`);
    });

    it("formats master-data codes as PREFIX-NNNN when format=simple", async () => {
      mocks.next.mockResolvedValue(7);
      const result = await generateDocumentNumber("CUST", "simple");
      // CUST has no field in PREFIX_FIELD_MAP, falls back to key itself
      expect(result).toBe(`CUST-0007`);
    });

    it("uses YRA fallback when companyName is missing", async () => {
      mocks.getSystemSettings.mockResolvedValue({ companyName: null });
      mocks.next.mockResolvedValue(1);
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yyyy = now.getFullYear();

      const result = await generateDocumentNumber("QUO");

      expect(result).toBe(`001/QUO/YRA/${mm}/${yyyy}`);
    });

    it("passes the legacy max sequence as a floor to the counter", async () => {
      mocks.quotationFindMany.mockResolvedValue([{ documentNo: "012/QUO/YAR/06/2026" }]);
      mocks.next.mockResolvedValue(13);

      await generateDocumentNumber("QUO");

      // floor should be 12 (highest existing)
      expect(mocks.next).toHaveBeenCalledWith(expect.any(String), 12);
    });
  });

  describe("generateDocumentNumber (simple)", () => {
    it("formats as PREFIX-NNNN and uses atomic sequence with floor (max+1)", async () => {
      // CUST maps to customer model, field "code"; resolvePrefix falls back to "CUST"
      mocks.customerFindMany.mockResolvedValue([{ code: "CUST-0007" }]);
      mocks.next.mockResolvedValue(8);

      const result = await generateDocumentNumber("CUST", "simple");

      expect(mocks.next).toHaveBeenCalledWith("CUST", 7);
      expect(result).toBe("CUST-0008");
    });

    it("starts at 0001 when no existing records", async () => {
      mocks.customerFindMany.mockResolvedValue([]);
      mocks.next.mockResolvedValue(1);

      const result = await generateDocumentNumber("CUST", "simple");

      expect(mocks.next).toHaveBeenCalledWith("CUST", 0);
      expect(result).toBe("CUST-0001");
    });
  });

  describe("floor kunci QC/pajak (putaran 77)", () => {
    // Keempat kunci ini sebelumnya absen dari DOCUMENT_SOURCE_MAP, jadi
    // findMaxSequence selalu 0 dan counter atomik bisa menabrak nomor
    // legacy/manual pada kolom @unique.
    it("QCL memakai qcChecklist.code sebagai floor", async () => {
      mocks.qcChecklistFindMany.mockResolvedValue([{ code: "QCL-0011" }]);
      mocks.next.mockResolvedValue(12);

      const result = await generateDocumentNumber("QCL", "simple");

      expect(mocks.next).toHaveBeenCalledWith("QCL", 11);
      expect(result).toBe("QCL-0012");
    });

    it("QCI memakai qcInspection.documentNo sebagai floor", async () => {
      mocks.qcInspectionFindMany.mockResolvedValue([{ documentNo: "QCI-0004" }]);
      mocks.next.mockResolvedValue(5);

      const result = await generateDocumentNumber("QCI", "simple");

      expect(mocks.next).toHaveBeenCalledWith("QCI", 4);
      expect(result).toBe("QCI-0005");
    });

    it("NCR memakai nonconformance.documentNo sebagai floor", async () => {
      mocks.nonconformanceFindMany.mockResolvedValue([{ documentNo: "NCR-0021" }]);
      mocks.next.mockResolvedValue(22);

      const result = await generateDocumentNumber("NCR", "simple");

      expect(mocks.next).toHaveBeenCalledWith("NCR", 21);
      expect(result).toBe("NCR-0022");
    });

    it("PAJAK memakai taxPayment.documentNo sebagai floor (bukan nomor seri TaxInvoice)", async () => {
      mocks.taxPaymentFindMany.mockResolvedValue([{ documentNo: "PAJAK-0009" }]);
      mocks.next.mockResolvedValue(10);

      const result = await generateDocumentNumber("PAJAK", "simple");

      expect(mocks.next).toHaveBeenCalledWith("PAJAK", 9);
      expect(result).toBe("PAJAK-0010");
    });
  });

  describe("peekNextDocumentNumber", () => {
    it("peeks simple format without incrementing", async () => {
      mocks.customerFindMany.mockResolvedValue([{ code: "CUST-0003" }]);

      const result = await peekNextDocumentNumber("CUST", "simple");

      expect(result).toBe("CUST-0004");
      expect(mocks.next).not.toHaveBeenCalled();
    });

    it("peeks complex format using max(counter, legacy)+1", async () => {
      mocks.quotationFindMany.mockResolvedValue([{ documentNo: "008/QUO/YAR/06/2026" }]);
      mocks.peek.mockResolvedValue(5);
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const yyyy = now.getFullYear();

      const result = await peekNextDocumentNumber("QUO", "complex");

      // max(8 legacy, 5 counter) + 1 = 9
      expect(result).toBe(`009/QUO/YAR/${mm}/${yyyy}`);
      expect(mocks.next).not.toHaveBeenCalled();
    });
  });
});
