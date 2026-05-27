import { prisma } from "../src/lib/db/prisma";

async function main() {
  // Check existing data
  const existingWh = await prisma.warehouse.findFirst();
  const existingVendor = await prisma.vendor.findFirst();
  const existingCustomer = await prisma.customer.findFirst();

  // Create warehouse if needed
  let warehouseId = existingWh?.id;
  if (!warehouseId) {
    const wh = await prisma.warehouse.create({ data: { name: "Gudang Utama", code: "GU-01", address: "Jl. Industri No. 1" } });
    warehouseId = wh.id;
  }

  // Create vendor if needed
  let vendorId = existingVendor?.id;
  if (!vendorId) {
    const v = await prisma.vendor.create({ data: { name: "PT Sumber Baja Mandiri", code: "VND-001", phone: "021-5551234" } });
    vendorId = v.id;
  }

  // Create customer if needed
  let customerId = existingCustomer?.id;
  if (!customerId) {
    const c = await prisma.customer.create({ data: { name: "CV Maju Jaya", code: "CUST-001", phone: "021-5559876" } });
    customerId = c.id;
  }

  // Create dummy item
  const item = await prisma.item.create({
    data: {
      sku: "BRG-PIPA-001",
      name: "Pipa Besi Galvanis 2 inch",
      description: "Pipa besi galvanis diameter 2 inch, panjang 6 meter",
      unitOfMeasure: "BTG",
      qtyOnHand: 35,
      minStock: 10,
      cost: 185000,
      price: 250000,
      purchasePrice: 175000,
      vendorId: vendorId,
      defaultWarehouseId: warehouseId,
    },
  });

  console.log("Item created:", item.id, item.name);

  // Create stock moves (chronological transactions)
  const moves = [
    { documentNo: "SM-2026-05-0001", date: new Date("2026-05-01"), moveType: "GoodsReceipt", qty: 50, cost: 175000, impact: "IN" as const, referenceType: "GoodsReceipt", description: "Pembelian awal dari PT Sumber Baja Mandiri" },
    { documentNo: "SM-2026-05-0002", date: new Date("2026-05-05"), moveType: "MaterialIssue", qty: 10, cost: 175000, impact: "OUT" as const, referenceType: "MaterialIssue", description: "Keluar untuk Project Renovasi Gedung A" },
    { documentNo: "SM-2026-05-0003", date: new Date("2026-05-08"), moveType: "MaterialIssue", qty: 5, cost: 175000, impact: "OUT" as const, referenceType: "MaterialIssue", description: "Keluar untuk Project Instalasi Pipa Lt.3" },
    { documentNo: "SM-2026-05-0004", date: new Date("2026-05-12"), moveType: "GoodsReceipt", qty: 30, cost: 185000, impact: "IN" as const, referenceType: "GoodsReceipt", description: "Pembelian tambahan dari PT Sumber Baja Mandiri" },
    { documentNo: "SM-2026-05-0005", date: new Date("2026-05-15"), moveType: "MaterialIssue", qty: 20, cost: 180000, impact: "OUT" as const, referenceType: "MaterialIssue", description: "Keluar untuk Project Pabrik Baru CV Maju Jaya" },
    { documentNo: "SM-2026-05-0006", date: new Date("2026-05-18"), moveType: "SalesReturn", qty: 3, cost: 180000, impact: "IN" as const, referenceType: "SalesReturn", description: "Retur dari CV Maju Jaya - kelebihan kirim" },
    { documentNo: "SM-2026-05-0007", date: new Date("2026-05-20"), moveType: "StockAdjustment", qty: 2, cost: 185000, impact: "OUT" as const, referenceType: "StockAdjustment", description: "Penyesuaian stok - barang rusak" },
    { documentNo: "SM-2026-05-0008", date: new Date("2026-05-22"), moveType: "GoodsReceipt", qty: 20, cost: 190000, impact: "IN" as const, referenceType: "GoodsReceipt", description: "Pembelian dari PT Baja Sentosa" },
    { documentNo: "SM-2026-05-0009", date: new Date("2026-05-25"), moveType: "MaterialIssue", qty: 8, cost: 185000, impact: "OUT" as const, referenceType: "MaterialIssue", description: "Keluar untuk Project Gudang Baru" },
    { documentNo: "SM-2026-05-0010", date: new Date("2026-05-27"), moveType: "InventoryTransfer", qty: 5, cost: 185000, impact: "OUT" as const, referenceType: "InventoryTransfer", description: "Transfer ke Gudang Cabang" },
  ];

  for (const m of moves) {
    await prisma.stockMove.create({
      data: {
        documentNo: m.documentNo,
        date: m.date,
        moveType: m.moveType,
        itemId: item.id,
        warehouseId: warehouseId,
        qty: m.qty,
        cost: m.cost,
        impact: m.impact,
        status: "posted",
        referenceType: m.referenceType,
        description: m.description,
      },
    });
  }

  console.log("Created 10 stock moves for item:", item.name);
  console.log("Done! Check /master/items/" + item.id);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
