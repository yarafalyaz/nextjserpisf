import { prisma } from "../src/lib/db/prisma";
import { generateDocumentNumber } from "../src/lib/utils/document-number";
import { onSalesReturnCompleted } from "../src/lib/hooks/sales-return.hook";
import { onPurchaseReturnProcessed } from "../src/lib/hooks/purchase-return.hook";
import { onWorkOrderCompleted } from "../src/lib/hooks/work-order.hook";

async function main() {
  console.log("=== EXTENDED E2E SEED ===\n");

  // Find existing data from previous seed
  const cust1 = await prisma.customer.findFirst({ where: { name: "Budi Santoso" } });
  const cust2 = await prisma.customer.findFirst({ where: { name: "PT Logistik Nusantara" } });
  const item1 = await prisma.item.findFirst({ where: { name: "Oli Mesin SAE 10W-40 (1L)" } });
  const item2 = await prisma.item.findFirst({ where: { name: "Filter Oli Universal" } });
  const item3 = await prisma.item.findFirst({ where: { name: "Kampas Rem Depan Toyota Avanza" } });
  const item4 = await prisma.item.findFirst({ where: { name: "Busi Iridium NGK" } });
  const vendor1 = await prisma.vendor.findFirst({ where: { name: "PT Sumber Baja Mandiri" } });
  const po1 = await prisma.purchaseOrder.findFirst({ where: { vendorId: vendor1!.id } });

  if (!cust1 || !cust2 || !item1 || !item2 || !item3 || !item4 || !vendor1 || !po1) {
    console.error("Missing base data! Run seed-full-system.ts first.");
    process.exit(1);
  }

  console.log("Base data found ✓");
  console.log("  Items:", item1.id, item2.id, item3.id, item4.id);
  console.log("  Before - Oli:", Number(item1.qtyOnHand), "Filter:", Number(item2.qtyOnHand), "Rem:", Number(item3.qtyOnHand), "Busi:", Number(item4.qtyOnHand));

  // ─── 1. SALES RETURN ───────────────────────────────────────────
  console.log("\n1. Sales Return - Busi 2pcs retur dari Budi Santoso (salah kirim)");
  const sr = await prisma.salesReturn.create({
    data: {
      documentNo: await generateDocumentNumber("SR"),
      customerId: cust1.id,
      date: new Date("2026-05-26"),
      reason: "Salah kirim - busi tidak sesuai tipe mobil",
      status: "draft",
      items: { create: [{ itemId: item4.id, qty: 2, cost: 70000 }] },
    },
  });
  console.log("   Created:", sr.documentNo);
  await onSalesReturnCompleted(sr.id, 1);
  console.log("   Completed ✓ (Busi +2 masuk kembali)");

  // ─── 2. PURCHASE RETURN ────────────────────────────────────────
  console.log("\n2. Purchase Return - Filter Oli 2pcs retur ke vendor (cacat)");
  const pr = await prisma.purchaseReturn.create({
    data: {
      documentNo: await generateDocumentNumber("PRET"),
      purchaseOrderId: po1.id,
      date: new Date("2026-05-26"),
      reason: "Barang cacat - filter oli penyok",
      status: "draft",
      items: { create: [{ itemId: item2.id, qty: 2, cost: 30000 }] },
    },
  });
  console.log("   Created:", pr.documentNo);
  await onPurchaseReturnProcessed(pr.id, 1);
  console.log("   Processed ✓ (Filter -2 keluar)");

  // ─── 3. WORK ORDER ─────────────────────────────────────────────
  console.log("\n3. Work Order - Service AC mobil Budi (pakai Oli 2L + Filter 1pc)");
  const cv1 = await prisma.customerVehicle.findFirst({ where: { licensePlate: "B 1234 XYZ" } });
  const wo = await prisma.workOrder.create({
    data: {
      documentNo: await generateDocumentNumber("WO"),
      customerId: cust1.id,
      customerVehicleId: cv1?.id,
      date: new Date("2026-05-27"),
      status: "in_progress",
      notes: "Service AC + top up oli",
      items: {
        create: [
          { itemId: item1.id, description: "Oli top up", qty: 2, cost: 60000 },
          { itemId: item2.id, description: "Filter pengganti", qty: 1, cost: 30000 },
        ],
      },
    },
  });
  console.log("   Created:", wo.documentNo);
  await onWorkOrderCompleted(wo.id, 1);
  console.log("   Completed ✓ (Oli -2, Filter -1 keluar)");

  // ─── 4. INVENTORY TRANSFER ─────────────────────────────────────
  console.log("\n4. Inventory Transfer - Kampas Rem 2set ke Gudang Cabang");
  const wh2 = await prisma.warehouse.upsert({
    where: { id: 2 },
    update: {},
    create: { name: "Gudang Cabang", code: "GC-01", address: "Jl. Raya Serpong No. 88" },
  });
  const trf = await prisma.inventoryTransfer.create({
    data: {
      documentNo: await generateDocumentNumber("TRF"),
      sourceWarehouseId: 1,
      destinationWarehouseId: wh2.id,
      date: new Date("2026-05-27"),
      notes: "Distribusi stok ke cabang",
      status: "completed",
      items: { create: [{ itemId: item3.id, qty: 2 }] },
    },
  });
  console.log("   Created:", trf.documentNo, "(no stock hook - same company)");

  // ─── 5. VERIFY FINAL STATE ─────────────────────────────────────
  console.log("\n5. Final verification:");
  const finalItems = await prisma.item.findMany({
    where: { id: { in: [item1.id, item2.id, item3.id, item4.id] } },
    select: { id: true, name: true, qtyOnHand: true },
  });
  for (const i of finalItems) console.log("   ", i.name, ":", Number(i.qtyOnHand));

  const layers = await prisma.inventoryLayer.findMany({
    where: { itemId: { in: [item1.id, item2.id, item3.id, item4.id] } },
  });
  console.log("\n   Total FIFO layers:", layers.length);

  const moves = await prisma.stockMove.findMany({
    where: { itemId: { in: [item1.id, item2.id, item3.id, item4.id] } },
  });
  console.log("   Total stock moves:", moves.length);

  // Expected:
  // Oli: was 12, -2 (WO) = 10
  // Filter: was 15, -2 (PurchaseReturn) -1 (WO) = 12
  // Kampas Rem: was 4, no stock hook for transfer = 4
  // Busi: was 2, +2 (SalesReturn) = 4
  console.log("\n   Expected: Oli=10, Filter=12, Rem=4, Busi=4");
  console.log("\n=== EXTENDED E2E COMPLETE ===");
  await prisma.$disconnect();
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
