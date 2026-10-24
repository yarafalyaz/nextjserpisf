import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Temuan QA E133 atas PR #714: `updateVendorBill` tidak mengulang penjaga L3
 * yang ada di createVendorBill/confirmVendorBill. Draft non-L3 bisa diedit
 * menjadi bertanda L3 + tertaut PO/GR dan lolos tanpa ActivityLog WO, tanpa
 * guard duplikat, tanpa cek WO-closed. Tes ini mengunci perilaku edit-L3:
 * edit+tautan ditolak, edit sah menulis ActivityLog, duplikat ditolak,
 * edit non-L3 utuh.
 */

const h = vi.hoisted(() => {
  const model = () => ({
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn(),
    aggregate: vi.fn().mockResolvedValue({ _sum: { subtotal: 0, grandTotal: 0 } }),
    deleteMany: vi.fn(),
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
  });
  const tx: Record<string, any> = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    purchaseOrder: model(),
    goodsReceipt: model(),
    goodsReceiptItem: model(),
    vendorBill: model(),
    vendorBillItem: model(),
    item: model(),
    workOrder: model(),
    activityLog: model(),
    journal: model(),
  };
  const prisma: Record<string, any> = {
    vendorBill: model(),
    $transaction: vi.fn(async (fn: any) => fn(tx)),
  };
  return {
    tx,
    prisma,
    user: vi.fn().mockResolvedValue({ id: 1 }),
    posted: vi.fn().mockResolvedValue(undefined),
    deleteJournal: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: h.prisma }));
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: h.user }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }));
vi.mock("@/lib/hooks/accounting.hook", () => ({
  onVendorBillPosted: h.posted,
  onVendorPaymentCreated: vi.fn().mockResolvedValue(undefined),
  deleteJournalByReference: vi.fn().mockResolvedValue(undefined),
  deleteJournalByReferenceTx: h.deleteJournal,
}));

import { updateVendorBill } from "../purchase.actions";

const NOTES_L3 = "BIAYA TELAT NON-JOB L3 | WO: WO-0007 | Alasan: jasa bubut telat";

function form(extra: Record<string, string | number> = {}): FormData {
  const f = new FormData();
  const payload: Record<string, string | number> = {
    vendorId: 3,
    date: "2026-10-24",
    subtotal: 150000,
    tax: 0,
    grandTotal: 150000,
    ...extra,
  };
  for (const [k, v] of Object.entries(payload)) f.append(k, String(v));
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.user.mockResolvedValue({ id: 1 });
  h.posted.mockResolvedValue(undefined);
  h.deleteJournal.mockResolvedValue(undefined);
  // Tagihan existing: draft non-L3 tanpa tautan; WO L3 closed; tanpa duplikat.
  h.prisma.vendorBill.findUniqueOrThrow.mockResolvedValue({
    id: 900,
    documentNo: "BILL-900",
    status: "draft",
    purchaseOrderId: null,
    goodsReceiptId: null,
    paidAmount: 0,
  });
  h.tx.vendorBill.findFirst.mockResolvedValue(null);
  h.tx.vendorBill.findUnique.mockResolvedValue({ status: "draft" });
  h.tx.vendorBill.update.mockResolvedValue({
    id: 900,
    documentNo: "BILL-900",
    purchaseOrderId: null,
    goodsReceiptId: null,
  });
  h.tx.vendorBill.aggregate.mockResolvedValue({ _sum: { subtotal: 0, grandTotal: 0 } });
  h.tx.workOrder.findUnique.mockResolvedValue({ id: 7, documentNo: "WO-0007", status: "closed" });
  h.tx.activityLog.findMany.mockResolvedValue([]);
  h.tx.activityLog.create.mockResolvedValue({});
  h.tx.journal.findFirst.mockResolvedValue(null);
});

describe("updateVendorBill jalur L3 (temuan QA E133)", () => {
  it("edit menambah penanda L3 + tautan PO ditolak, tagihan tidak ditulis", async () => {
    const res = await updateVendorBill(900, form({ notes: NOTES_L3, purchaseOrderId: 50 }));

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/dilarang tertaut PO/);
    expect(h.tx.vendorBill.update).not.toHaveBeenCalled();
    expect(h.tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("edit menambah penanda L3 pada tagihan bertautan GR existing ditolak", async () => {
    h.prisma.vendorBill.findUniqueOrThrow.mockResolvedValue({
      id: 900,
      documentNo: "BILL-900",
      status: "draft",
      purchaseOrderId: null,
      goodsReceiptId: 77,
      paidAmount: 0,
    });

    const res = await updateVendorBill(900, form({ notes: NOTES_L3 }));

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/dilarang tertaut PO/);
    expect(h.tx.vendorBill.update).not.toHaveBeenCalled();
    expect(h.tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("edit penanda L3 dengan WO belum closed ditolak", async () => {
    h.tx.workOrder.findUnique.mockResolvedValue({ id: 7, documentNo: "WO-0007", status: "completed" });

    const res = await updateVendorBill(900, form({ notes: NOTES_L3 }));

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/bukan closed/);
    expect(h.tx.vendorBill.update).not.toHaveBeenCalled();
  });

  it("edit menambah penanda L3 sah menulis ActivityLog WO dalam tx edit", async () => {
    const res = await updateVendorBill(900, form({ notes: NOTES_L3 }));

    expect(res.success).toBe(true);
    expect(h.tx.vendorBill.update).toHaveBeenCalledTimes(1);
    expect(h.tx.activityLog.create).toHaveBeenCalledTimes(1);
    const data = h.tx.activityLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ modelType: "WorkOrder", modelId: 7, action: "late_cost_l3" });
    expect(JSON.parse(data.metadata)).toMatchObject({
      sourceType: "VendorBill",
      sourceId: 900,
      sourceDocumentNo: "BILL-900",
      vendorKey: "vendor:3",
      amount: 150000,
      date: "2026-10-24",
    });
  });

  it("duplikat L3 via edit ditolak (dokumen L3 aktif lain, vendor+nominal+tanggal sama)", async () => {
    h.tx.activityLog.findMany.mockResolvedValue([
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
    // findUnique id 900 = cek status in-tx; id 11 = cek dokumen duplikat aktif.
    h.tx.vendorBill.findUnique.mockImplementation(async ({ where }: any) =>
      where.id === 11 ? { status: "posted", deletedAt: null } : { status: "draft" },
    );

    const res = await updateVendorBill(900, form({ notes: NOTES_L3 }));

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/satu kali/);
    expect(h.tx.vendorBill.update).not.toHaveBeenCalled();
    expect(h.tx.activityLog.create).not.toHaveBeenCalled();
  });

  it("edit dirinya sendiri tidak dianggap duplikat (excludeSource VendorBill ini)", async () => {
    h.tx.activityLog.findMany.mockResolvedValue([
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

    const res = await updateVendorBill(900, form({ notes: NOTES_L3 }));

    expect(res.success).toBe(true);
    expect(h.tx.activityLog.create).toHaveBeenCalledTimes(1);
  });

  it("edit tanpa penanda L3 utuh: tidak menulis ActivityLog L3", async () => {
    const res = await updateVendorBill(900, form({ notes: "catatan biasa" }));

    expect(res.success).toBe(true);
    expect(h.tx.workOrder.findUnique).not.toHaveBeenCalled();
    expect(h.tx.activityLog.create).not.toHaveBeenCalled();
  });
});
