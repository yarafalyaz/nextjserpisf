import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Laporan Diterima Belum Ditagih (GR/IR) hanya bisa mengurangkan tagihan dari
 * baris yang MENUNJUK baris penerimaan (`VendorBillItem.goodsReceiptItemId`).
 * Dulu jalur pembuatan tagihan tidak pernah mengisi kolom itu, sehingga nilai
 * "Ditagih" selalu 0; setelah jalur "Buat Tagihan dari Penerimaan" mengisinya,
 * laporan ini harus benar-benar menguranginya.
 *
 * Filter status tagihan juga diuji: AP journal sudah diposting SAAT tagihan
 * dibuat (`onVendorBillPosted` dipanggil di transaksi create), jadi tagihan draft
 * sudah membersihkan akun GRNI dan wajib ikut dikurangkan — sama seperti
 * perlakuan penjagaan 3-way match. Sebelumnya draft dikecualikan, sehingga tagihan
 * yang baru dibuat dari penerimaan tetap terbaca "belum ditagih".
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
        const notStatus = args?.where?.vendorBill?.status?.not;
        mocks.vendorBillItemFindMany(args);
        return mocks.billedRows.filter(
          (row) => notStatus === undefined || row.vendorBill.status !== notStatus,
        );
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
  it("mengurangkan tagihan draft yang menunjuk baris penerimaan", async () => {
    const { report } = await loadReceivedNotBilled(PERIOD);

    // Baris 501 sudah ditagih penuh (5×200 = 1000) → tidak tampil di rincian.
    // Baris 502 baru ditagih 100 dari 300 → sisa 200 tampil dengan "Ditagih" 100.
    expect(report.totals.billedValue).toBe(100);
    expect(report.totals.receivedValue).toBe(300);
    expect(report.totals.outstandingValue).toBe(200);
    expect(report.totals.receipts).toBe(1);
  });

  it("memakai filter non-cancelled (bukan mengecualikan draft)", async () => {
    await loadReceivedNotBilled(PERIOD);

    expect(mocks.vendorBillItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          goodsReceiptItemId: { in: [501, 502] },
          vendorBill: { status: { not: "cancelled" } },
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

    expect(report.totals.billedValue).toBe(100);
    mocks.billedRows.pop();
  });
});
