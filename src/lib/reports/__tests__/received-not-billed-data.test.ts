import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Laporan Diterima Belum Ditagih (GR/IR) hanya bisa mengurangkan tagihan dari
 * baris yang MENUNJUK baris penerimaan (`VendorBillItem.goodsReceiptItemId`).
 * Dulu jalur pembuatan tagihan tidak pernah mengisi kolom itu, sehingga nilai
 * "Ditagih" selalu 0; setelah jalur "Buat Tagihan dari Penerimaan" mengisinya,
 * laporan ini harus benar-benar menguranginya.
 *
 * Filter status tagihan juga diuji: draft MURNI tanpa jurnal (P0-2) — jurnal
 * AP/GRNI baru lahir di `confirmVendorBill`, jadi tagihan draft BELUM
 * membersihkan akun GRNI dan TIDAK boleh dikurangkan. Hanya tagihan yang
 * sudah diposting (posted/partial/paid) yang mengurangkan sisa dokumen,
 * supaya sisa dokumen tetap sebanding dengan saldo buku besar GRNI.
 */

const mocks = vi.hoisted(() => {
  // Baris tagihan: satu sudah posted, satu masih draft (baru dibuat).
  const billedRows = [
    { goodsReceiptItemId: 501, subtotal: 1000, vendorBill: { status: "posted" } },
    { goodsReceiptItemId: 502, subtotal: 100, vendorBill: { status: "draft" } },
  ];

  return {
    billedRows,
    getSystemSettings: vi.fn(),
    sumNetForAccount: vi.fn(),
    goodsReceiptItemFindMany: vi.fn(),
    vendorBillItemFindMany: vi.fn(),
    itemFindMany: vi.fn(),
    accountFindUnique: vi.fn(),
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    goodsReceiptItem: { findMany: mocks.goodsReceiptItemFindMany },
    vendorBillItem: {
      // Menghormati filter yang dikirim pemanggil, supaya perilaku filter
      // benar-benar teruji (bukan sekadar argumennya).
      findMany: async (args: any) => {
        const status = args?.where?.vendorBill?.status;
        mocks.vendorBillItemFindMany(args);
        return mocks.billedRows.filter((row) => {
          if (status?.not !== undefined) return row.vendorBill.status !== status.not;
          if (Array.isArray(status?.notIn)) return !status.notIn.includes(row.vendorBill.status);
          return true;
        });
      },
    },
    item: { findMany: mocks.itemFindMany },
    account: { findUnique: mocks.accountFindUnique },
  },
}));

vi.mock("@/lib/utils/settings", () => ({
  getSystemSettings: mocks.getSystemSettings,
}));

vi.mock("@/lib/services/report-aggregation.service", () => ({
  sumNetForAccount: mocks.sumNetForAccount,
}));

import { loadReceivedNotBilled } from "@/lib/reports/received-not-billed-data";

const PERIOD = {
  start: new Date("2026-05-01T00:00:00.000Z"),
  end: new Date("2026-05-31T23:59:59.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSystemSettings.mockResolvedValue({ purchaseInventoryAccountId: 600 });
  mocks.sumNetForAccount.mockResolvedValue(200);
  mocks.goodsReceiptItemFindMany.mockResolvedValue([
    {
      id: 501,
      goodsReceiptId: 77,
      itemId: 7,
      qty: 5,
      unitCost: 200,
      goodsReceipt: {
        documentNo: "GR-077",
        date: new Date("2026-05-10T00:00:00.000Z"),
        purchaseOrder: { vendor: { name: "Vendor A" } },
      },
    },
    {
      id: 502,
      goodsReceiptId: 77,
      itemId: 8,
      qty: 3,
      unitCost: 100,
      goodsReceipt: {
        documentNo: "GR-077",
        date: new Date("2026-05-10T00:00:00.000Z"),
        purchaseOrder: { vendor: { name: "Vendor A" } },
      },
    },
  ]);
  mocks.itemFindMany.mockResolvedValue([
    { id: 7, sku: "SKU-7", name: "Barang 7" },
    { id: 8, sku: "SKU-8", name: "Barang 8" },
  ]);
  mocks.accountFindUnique.mockResolvedValue({ code: "2-1200", name: "Hutang Pembelian Belum Ditagih" });
});

describe("loadReceivedNotBilled", () => {
  it("tidak mengurangkan tagihan draft (draft murni tanpa jurnal, P0-2)", async () => {
    const { report } = await loadReceivedNotBilled(PERIOD);

    // Baris 501 sudah ditagih penuh oleh tagihan posted (5×200 = 1000) → tidak tampil.
    // Baris 502 baru ditagih 100 oleh tagihan DRAFT → belum membersihkan GRNI,
    // jadi belum dikurangkan: sisa tetap 300 penuh dengan "Ditagih" 0.
    expect(report.totals.billedValue).toBe(0);
    expect(report.totals.receivedValue).toBe(300);
    expect(report.totals.outstandingValue).toBe(300);
    expect(report.totals.receipts).toBe(1);
  });

  it("memakai filter posted saja (mengecualikan draft dan cancelled)", async () => {
    await loadReceivedNotBilled(PERIOD);

    expect(mocks.vendorBillItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          goodsReceiptItemId: { in: [501, 502] },
          vendorBill: { status: { notIn: ["draft", "cancelled"] } },
        }),
      }),
    );
  });

  it("mengabaikan baris tagihan yang tidak menunjuk baris penerimaan", async () => {
    mocks.billedRows.push({
      goodsReceiptItemId: null as unknown as number,
      subtotal: 999,
      vendorBill: { status: "posted" },
    } as never);

    const { report } = await loadReceivedNotBilled(PERIOD);

    expect(report.totals.billedValue).toBe(0);
    mocks.billedRows.pop();
  });
});
