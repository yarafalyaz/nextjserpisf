import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Temuan QA E133 atas PR #714: `updateVendorBill` tidak mengulang penjaga L3
 * yang ada di createVendorBill/confirmVendorBill. Draft non-L3 bisa diedit
 * menjadi bertanda L3 + tertaut PO/GR dan lolos tanpa ActivityLog WO, tanpa
 * guard duplikat, tanpa cek WO-closed. Tes ini mengunci perilaku edit-L3:
 * (1) edit menambah penanda+PO ditolak, (2) edit menambah penanda+GR existing
 * ditolak, (3) edit penanda sah menulis ActivityLog, (4) duplikat via edit
 * ditolak, (5) edit tanpa penanda utuh (non-L3 tidak menulis ActivityLog).
 */

const mocks = vi.hoisted(() => {
  const txMock: any = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    purchaseOrder: {
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    goodsReceipt: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    goodsReceiptItem: { findMany: vi.fn().mockResolvedValue([]) },
    vendorBill: {
      create: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _sum: { subtotal: 0, grandTotal: 0 } }),
      findUnique: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    vendorBillItem: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _sum: { subtotal: 0 } }),
    },
    item: { findMany: vi.fn().mockResolvedValue([]) },
    workOrder: { findUnique: vi.fn() },
    activityLog: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },
    journal: { findFirst: vi.fn().mockResolvedValue(null) },
  };

  const prismaMock: any = {
    vendorBill: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(txMock);
      return Promise.all(ops);
    }),
  };

  return {
    requirePermissionMock: vi.fn().mockResolvedValue({ id: 1 }),
    onVendorBillPostedMock: vi.fn().mockResolvedValue(undefined),
    deleteJournalByReferenceTxMock: vi.fn().mockResolvedValue(undefined),
    prismaMock,
    txMock,
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }));
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermissionMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onVendorBillPosted: mocks.onVendorBillPostedMock,
  onVendorPaymentCreated: vi.fn().mockResolvedValue(undefined),
  deleteJournalByReference: vi.fn().mockResolvedValue(undefined),
  deleteJournalByReferenceTx: mocks.deleteJournalByReferenceTxMock,
}));

import { updateVendorBill } from "../purchase.actions";

function fd(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) f.append(k, String(v));
  }
  return f;
}

const L3_NOTES = "BIAYA TELAT NON-JOB L3 | WO: WO-0007 | Alasan: jasa bubut telat";

function editForm(extra: Record<string, string | number> = {}) {
  return fd({
    vendorId: 3,
    date: "2026-10-24",
    subtotal: 150000,
    tax: 0,
    grandTotal: 150000,
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 });
  mocks.onVendorBillPostedMock.mockResolvedValue(undefined);
  mocks.deleteJournalByReferenceTxMock.mockResolvedValue(undefined);
  mocks.prismaMock.vendorBill.findFirst.mockResolvedValue(null);
  mocks.txMock.$executeRaw.mockResolvedValue(1);
  mocks.txMock.vendorBill.aggregate.mockResolvedValue({ _sum: { subtotal: 0, grandTotal: 0 } });
  mocks.txMock.vendorBill.findUnique.mockResolvedValue({ status: "draft" });
  mocks.txMock.vendorBill.update.mockResolvedValue({
    id: 900,
    documentNo: "BILL-900",
    purchaseOrderId: null,
    goodsReceiptId: null,
  });
  mocks.txMock.workOrder.findUnique.mockResolvedValue({
    id: 7,
    documentNo: "WO-0007",
    status: "closed",
  });
  mocks.txMock.activityLog.findMany.mockResolvedValue([]);
  mocks.txMock.activityLog.create.mockResolvedValue({});
  mocks.txMock.journal.findFirst.mockResolvedValue(null);
  // Tagihan existing: draft non-L3 tanpa tautan.
  mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
    id: 900,
    documentNo: "BILL-900",
    status: "draft",
    purchaseOrderId: null,
    goodsReceiptId: null,
    paidAmount: 0,
  });
});

describe("updateVendorBill jalur L3 (temuan QA E133)", () => {
  it("edit menambah penanda L3 + tautan PO ditolak, tagihan tidak ditulis", async () => {
    const res = await updateVendorBill(900, editForm({ notes: L3_NOTES, purchaseOrderId: 50 }));

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/dilarang tertaut PO/);
    expect(mocks.txMock.vendorBill.update).not.toHaveBeenCalled();
    expect(mocks.txMock.activityLog.create).not.toHaveBeenCalled();
  });

  it("edit menambah penanda L3 pada tagihan bertautan GR existing ditolak", async () => {
    mocks.prismaMock.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 900,
      documentNo: "BILL-900",
      status: "draft",
      purchaseOrderId: null,
      goodsReceiptId: 77,
      paidAmount: 0,
    });

    const res = await updateVendorBill(900, editForm({ notes: L3_NOTES }));

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/dilarang tertaut PO/);
    expect(mocks.txMock.vendorBill.update).not.toHaveBeenCalled();
    expect(mocks.txMock.activityLog.create).not.toHaveBeenCalled();
  });

  it("edit menambah penanda L3 sah: WO belum closed ditolak", async () => {
    mocks.txMock.workOrder.findUnique.mockResolvedValue({
      id: 7,
      documentNo: "WO-0007",
      status: "completed",
    });

    const res = await updateVendorBill(900, editForm({ notes: L3_NOTES }));

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/bukan closed/);
    expect(mocks.txMock.vendorBill.update).not.toHaveBeenCalled();
  });

  it("edit menambah penanda L3 sah menulis ActivityLog WO dalam tx edit", async () => {
    const res = await updateVendorBill(900, editForm({ notes: L3_NOTES }));

    expect(res.success).toBe(true);
    expect(mocks.txMock.vendorBill.update).toHaveBeenCalledTimes(1);
    expect(mocks.txMock.activityLog.create).toHaveBeenCalledTimes(1);
    const arg = mocks.txMock.activityLog.create.mock.calls[0][0];
    expect(arg.data.modelType).toBe("WorkOrder");
    expect(arg.data.modelId).toBe(7);
    expect(arg.data.action).toBe("late_cost_l3");
    const meta = JSON.parse(arg.data.metadata);
    expect(meta).toMatchObject({
      sourceType: "VendorBill",
      sourceId: 900,
      sourceDocumentNo: "BILL-900",
      vendorKey: "vendor:3",
      amount: 150000,
      date: "2026-10-24",
    });
  });

  it("duplikat L3 via edit ditolak (dokumen L3 aktif lain, vendor+nominal+tanggal sama)", async () => {
    // ActivityLog L3 milik VendorBill 11 (bukan dokumen ini) masih aktif.
    mocks.txMock.activityLog.findMany.mockResolvedValue([
      {
        metadata: JSON.stringify({
          sourceType: "VendorBill",
          sourceId: 11,
          vendorKey: "vendor:3",
          amount: 150000,
          date: "2026-10-24",
        }),
      },
    ]);
    mocks.txMock.vendorBill.findUnique.mockImplementation(async (args: any) =>
      args?.where?.id === 11
        ? { status: "posted", deletedAt: null }
        : { status: "draft" },
    );

    const res = await updateVendorBill(900, editForm({ notes: L3_NOTES }));

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/satu kali/);
    expect(mocks.txMock.vendorBill.update).not.toHaveBeenCalled();
    expect(mocks.txMock.activityLog.create).not.toHaveBeenCalled();
  });

  it("edit dirinya sendiri tidak dianggap duplikat (excludeSource VendorBill ini)", async () => {
    mocks.txMock.activityLog.findMany.mockResolvedValue([
      {
        metadata: JSON.stringify({
          sourceType: "VendorBill",
          sourceId: 900,
          vendorKey: "vendor:3",
          amount: 150000,
          date: "2026-10-24",
        }),
      },
    ]);

    const res = await updateVendorBill(900, editForm({ notes: L3_NOTES }));

    expect(res.success).toBe(true);
    expect(mocks.txMock.activityLog.create).toHaveBeenCalledTimes(1);
  });

  it("edit tanpa penanda L3 utuh: tidak menulis ActivityLog L3", async () => {
    const res = await updateVendorBill(900, editForm({ notes: "catatan biasa" }));

    expect(res.success).toBe(true);
    expect(mocks.txMock.workOrder.findUnique).not.toHaveBeenCalled();
    expect(mocks.txMock.activityLog.create).not.toHaveBeenCalled();
  });
});
