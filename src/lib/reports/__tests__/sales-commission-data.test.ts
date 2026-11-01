import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Rekap komisi: basis hanya faktur LUNAS (paid). Pengurang retur hanya
 * boleh mengurangi komisi yang pernah diakui — retur atas faktur asal
 * yang tidak pernah lunas (posted/partial/terhapus) tidak boleh
 * melahirkan pengurang hantu (neto negatif tanpa basis), sama seperti
 * kontrak loader target penjualan (faktur asal wajib paid + hidup,
 * sisanya dibuang).
 */

const mocks = vi.hoisted(() => ({
  salesInvoiceFindMany: vi.fn(),
  salesReturnFindMany: vi.fn(),
  salesReturnRows: [] as any[],
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    salesInvoice: { findMany: mocks.salesInvoiceFindMany },
    salesReturn: {
      // Meniru semantik saringan relasi di where induk Prisma: baris
      // yang faktur asalnya tidak cocok dengan where relasi terbuang.
      findMany: async (args: any) => {
        mocks.salesReturnFindMany(args);
        const relWhere = args?.where?.salesInvoice;
        const rows = mocks.salesReturnRows;
        if (!relWhere) return rows;
        return rows.filter((row) => {
          const inv = row.salesInvoice;
          if (!inv) return false;
          if (relWhere.status !== undefined && inv.status !== relWhere.status) return false;
          if (relWhere.deletedAt === null && inv.deletedAt != null) return false;
          return true;
        });
      },
    },
  },
}));

import { getSalesCommissionRecap } from "@/lib/reports/sales-commission-data";

const PERIOD = {
  start: new Date("2026-05-01T00:00:00.000Z"),
  end: new Date("2026-05-31T23:59:59.000Z"),
};

// Baris retur mentah seperti dibentuk loader sesudah select: faktur asal
// diwakili objek select (atau null bila saringan relasi membuangnya).
function returnRow(status: string | null) {
  return {
    id: 9,
    salesInvoiceId: 77,
    items: [{ qty: 1, price: 10_000_000, returnDpp: 10_000_000 }],
    salesInvoice:
      status === null
        ? null
        : {
            status,
            deletedAt: status === "deleted" ? new Date("2026-05-02T00:00:00.000Z") : null,
            salesEmployeeId: 5,
            commissionRatePercent: 5,
            salesEmployee: { name: "Penjual A" },
          },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.salesInvoiceFindMany.mockResolvedValue([]);
  mocks.salesReturnRows = [];
});

describe("getSalesCommissionRecap pengurang retur", () => {
  it("retur atas faktur asal lunas mengurangi komisi penjual asal", async () => {
    mocks.salesReturnRows = [returnRow("paid")];

    const recap = await getSalesCommissionRecap(PERIOD);

    expect(recap.totalReturnDeduction).toBe(500_000);
    expect(recap.rows).toHaveLength(1);
    expect(recap.rows[0].netEstimatedCommission).toBe(-500_000);
  });

  it.each(["posted", "partial", "cancelled"])(
    "retur atas faktur asal %s (belum lunas) tidak mengurangi komisi",
    async (status) => {
      mocks.salesReturnRows = [returnRow(status)];

      const recap = await getSalesCommissionRecap(PERIOD);

      expect(recap.totalReturnDeduction).toBe(0);
      expect(recap.rows).toHaveLength(0);
    },
  );

  it("query retur menyaring faktur asal paid dan belum terhapus", async () => {
    await getSalesCommissionRecap(PERIOD);

    expect(mocks.salesReturnFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          salesInvoice: { status: "paid", deletedAt: null },
        }),
      }),
    );
  });
});
