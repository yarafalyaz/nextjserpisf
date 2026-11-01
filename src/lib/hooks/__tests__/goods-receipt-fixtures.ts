import { vi } from "vitest"

/**
 * Fixture bersama tes `onGoodsReceiptVerified` (goods-receipt-*.test.ts).
 * Mock modul (`vi.mock`) tetap di tiap berkas tes karena hoisting Vitest;
 * helper ini hanya membangun objek `tx` Prisma dari spy yang sudah dibuat
 * berkas pemanggil. Cabang yang memang berbeda antar berkas (mis.
 * `item.findUnique` spy vs `vi.fn()` kosong) dilewatkan lewat `spies` /
 * `overrides`; sisanya identik.
 */
export function buildGoodsReceiptTx(spies: Record<string, any>, overrides: Record<string, any> = {}) {
  const tx: Record<string, any> = {
    $queryRaw: spies.queryRaw,
    $executeRaw: spies.executeRaw,
    goodsReceipt: { findUniqueOrThrow: spies.grFindUniqueOrThrow, update: spies.grUpdate },
    stockMove: { findFirst: spies.moveFindFirst, create: spies.moveCreate },
    purchaseOrderItem: { findMany: spies.poItemFindMany },
    goodsReceiptItem: { findMany: spies.grItemFindMany },
    purchaseOrder: { update: spies.poUpdate },
    item: { findUnique: spies.itemFindUnique ?? vi.fn(), findMany: spies.itemFindMany, update: spies.itemUpdate },
    uomConversion: { findMany: spies.uomConversionFindMany },
    itemBatch: { findFirst: spies.itemBatchFindFirst, create: spies.itemBatchCreate, update: spies.itemBatchUpdate },
    itemSerial: {
      create: spies.itemSerialCreate,
      createMany: spies.itemSerialCreateMany,
      findMany: spies.itemSerialFindMany ?? vi.fn().mockResolvedValue([]),
    },
    systemSetting: { findFirst: spies.systemSettingFindFirst },
    // Gerbang QC GR (putaran 20): default tanpa record QC (opt-in lolos);
    // berkas tes yang menguji blokir meng-override count-nya.
    nonconformance: { count: spies.ncrCount ?? vi.fn().mockResolvedValue(0) },
    qcInspection: { findMany: spies.qcFindMany ?? vi.fn().mockResolvedValue([]) },
  }
  return { ...tx, ...overrides }
}
