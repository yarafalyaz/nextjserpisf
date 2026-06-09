import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findUniqueQuotation: vi.fn(),
  transaction: vi.fn(),
  soFindMany: vi.fn(),
  soItemDeleteMany: vi.fn(),
  soItemCreateMany: vi.fn(),
  soUpdate: vi.fn(),
  invFindMany: vi.fn(),
  invItemDeleteMany: vi.fn(),
  invItemCreateMany: vi.fn(),
  invUpdate: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    quotation: { findUnique: mocks.findUniqueQuotation },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mocks.transaction(fn),
  },
}));

import { resyncOnEdit } from "@/lib/services/quotation-sync.service";

function buildTx() {
  return {
    salesOrder: { findMany: mocks.soFindMany, update: mocks.soUpdate },
    salesOrderItem: { deleteMany: mocks.soItemDeleteMany, createMany: mocks.soItemCreateMany },
    salesInvoice: { findMany: mocks.invFindMany, update: mocks.invUpdate },
    salesInvoiceItem: { deleteMany: mocks.invItemDeleteMany, createMany: mocks.invItemCreateMany },
  };
}

describe("quotation-sync.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (fn) => fn(buildTx()));
  });

  it("does nothing when quotation not found", async () => {
    mocks.findUniqueQuotation.mockResolvedValue(null);

    await resyncOnEdit(1);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does nothing when quotation status is not draft", async () => {
    mocks.findUniqueQuotation.mockResolvedValue({
      id: 1, status: "accepted", sections: [],
    });

    await resyncOnEdit(1);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("resyncs SO items for a draft quotation", async () => {
    mocks.findUniqueQuotation.mockResolvedValue({
      id: 1,
      status: "draft",
      subtotal: 1000,
      discount: 100,
      tax: 90,
      grandTotal: 990,
      sections: [
        {
          items: [
            { itemId: 5, qty: 2, unitPrice: 500, discount: 0, total: 1000, description: "Item A" },
          ],
        },
      ],
    });
    mocks.soFindMany.mockResolvedValue([{ id: 10 }]);
    mocks.invFindMany.mockResolvedValue([]);

    await resyncOnEdit(1);

    expect(mocks.soItemDeleteMany).toHaveBeenCalledWith({ where: { salesOrderId: 10 } });
    expect(mocks.soItemCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ salesOrderId: 10, itemId: 5, qty: 2, unitPrice: 500, total: 1000 }),
      ],
    });
    expect(mocks.soUpdate).toHaveBeenCalledWith({
      where: { id: 10 },
      data: expect.objectContaining({ subtotal: 1000, grandTotal: 990 }),
    });
  });

  it("resyncs linked invoices for the SO", async () => {
    mocks.findUniqueQuotation.mockResolvedValue({
      id: 1,
      status: "draft",
      subtotal: 1000,
      discount: 0,
      tax: 0,
      grandTotal: 1000,
      sections: [
        { items: [{ itemId: 5, qty: 1, unitPrice: 1000, discount: 0, total: 1000 }] },
      ],
    });
    mocks.soFindMany.mockResolvedValue([{ id: 10 }]);
    mocks.invFindMany.mockResolvedValue([{ id: 20 }]);

    await resyncOnEdit(1);

    expect(mocks.invItemDeleteMany).toHaveBeenCalledWith({ where: { salesInvoiceId: 20 } });
    expect(mocks.invItemCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ salesInvoiceId: 20, itemId: 5 })],
    });
    expect(mocks.invUpdate).toHaveBeenCalledWith({
      where: { id: 20 },
      data: expect.objectContaining({ grandTotal: 1000, taxAmount: 0 }),
    });
  });

  it("skips item createMany when quotation has no items", async () => {
    mocks.findUniqueQuotation.mockResolvedValue({
      id: 1,
      status: "draft",
      subtotal: 0,
      discount: 0,
      tax: 0,
      grandTotal: 0,
      sections: [],
    });
    mocks.soFindMany.mockResolvedValue([{ id: 10 }]);
    mocks.invFindMany.mockResolvedValue([]);

    await resyncOnEdit(1);

    expect(mocks.soItemDeleteMany).toHaveBeenCalled();
    expect(mocks.soItemCreateMany).not.toHaveBeenCalled();
  });

  it("computes total fallback when item.total is missing", async () => {
    mocks.findUniqueQuotation.mockResolvedValue({
      id: 1,
      status: "draft",
      subtotal: 0,
      discount: 0,
      tax: 0,
      grandTotal: 0,
      sections: [
        { items: [{ itemId: 5, qty: 3, unitPrice: 100, discount: 50, total: null }] },
      ],
    });
    mocks.soFindMany.mockResolvedValue([{ id: 10 }]);
    mocks.invFindMany.mockResolvedValue([]);

    await resyncOnEdit(1);

    // total = 3*100 - 50 = 250
    expect(mocks.soItemCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ total: 250 })],
    });
  });
});
