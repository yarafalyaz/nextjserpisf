import { prisma } from "../src/lib/db/prisma";
import { generateDocumentNumber } from "../src/lib/utils/document-number";
import { onGoodsReceiptVerified } from "../src/lib/hooks/goods-receipt.hook";
import { onMaterialIssueCompleted } from "../src/lib/hooks/material-issue.hook";

async function main() {
  console.log("=== SEED FULL SYSTEM ===");
  // 1. MASTER DATA
  const warehouse = await prisma.warehouse.upsert({ where: { id: 1 }, update: {}, create: { name: "Gudang Utama", code: "GU-01", address: "Jl. Industri No. 1" } });
  const cust1 = await prisma.customer.create({ data: { name: "Budi Santoso", code: await generateDocumentNumber("CUST", "simple"), phone: "08123456789", address: "Jl. Merdeka 10" } });
  const cust2 = await prisma.customer.create({ data: { name: "PT Logistik Nusantara", code: await generateDocumentNumber("CUST", "simple"), phone: "021-7654321", address: "Jl. Gatot Subroto 55" } });
  const vendor1 = await prisma.vendor.create({ data: { name: "PT Sumber Baja Mandiri", code: await generateDocumentNumber("VND", "simple"), phone: "021-5551234" } });
  const vendor2 = await prisma.vendor.create({ data: { name: "CV Mitra Oli Sejahtera", code: await generateDocumentNumber("VND", "simple"), phone: "021-5559999" } });
  const veh1 = await prisma.vehicle.create({ data: { plateNumber: "B 1234 XYZ", year: 2022, color: "Silver" } });
  const veh2 = await prisma.vehicle.create({ data: { plateNumber: "B 5678 ABC", year: 2020, color: "Hitam" } });
  const cv1 = await prisma.customerVehicle.create({ data: { customerId: cust1.id, vehicleId: veh1.id, licensePlate: "B 1234 XYZ" } });
  const cv2 = await prisma.customerVehicle.create({ data: { customerId: cust2.id, vehicleId: veh2.id, licensePlate: "B 5678 ABC" } });
  console.log("Master data created");
  // Items
  const item1 = await prisma.item.create({ data: { sku: await generateDocumentNumber("ITM", "simple"), name: "Oli Mesin SAE 10W-40 (1L)", unitOfMeasure: "LTR", qtyOnHand: 0, minStock: 5, cost: 65000, price: 95000, purchasePrice: 60000, vendorId: vendor2.id, defaultWarehouseId: warehouse.id, isProduct: true } });
  const item2 = await prisma.item.create({ data: { sku: await generateDocumentNumber("ITM", "simple"), name: "Filter Oli Universal", unitOfMeasure: "PCS", qtyOnHand: 0, minStock: 10, cost: 35000, price: 55000, purchasePrice: 30000, vendorId: vendor2.id, defaultWarehouseId: warehouse.id, isProduct: true } });
  const item3 = await prisma.item.create({ data: { sku: await generateDocumentNumber("ITM", "simple"), name: "Kampas Rem Depan Toyota Avanza", unitOfMeasure: "SET", qtyOnHand: 0, minStock: 3, cost: 185000, price: 275000, purchasePrice: 175000, vendorId: vendor1.id, defaultWarehouseId: warehouse.id, isProduct: true } });
  const item4 = await prisma.item.create({ data: { sku: await generateDocumentNumber("ITM", "simple"), name: "Busi Iridium NGK", unitOfMeasure: "PCS", qtyOnHand: 0, minStock: 8, cost: 75000, price: 110000, purchasePrice: 70000, vendorId: vendor1.id, defaultWarehouseId: warehouse.id, isProduct: true } });
  console.log("Items created");
  // 2. PURCHASE ORDERS
  const po1 = await prisma.purchaseOrder.create({ data: { documentNo: await generateDocumentNumber("PO"), vendorId: vendor2.id, date: new Date("2026-05-01"), status: "approved", subtotal: 900000, tax: 99000, grandTotal: 999000, items: { create: [{ itemId: item1.id, qty: 10, unitPrice: 60000, total: 600000 }, { itemId: item2.id, qty: 10, unitPrice: 30000, total: 300000 }] } } });
  const po2 = await prisma.purchaseOrder.create({ data: { documentNo: await generateDocumentNumber("PO"), vendorId: vendor1.id, date: new Date("2026-05-03"), status: "approved", subtotal: 1295000, tax: 142450, grandTotal: 1437450, items: { create: [{ itemId: item3.id, qty: 5, unitPrice: 175000, total: 875000 }, { itemId: item4.id, qty: 6, unitPrice: 70000, total: 420000 }] } } });
  console.log("POs created:", po1.documentNo, po2.documentNo);
  // 3. GOODS RECEIPTS
  const gr1 = await prisma.goodsReceipt.create({ data: { documentNo: await generateDocumentNumber("GR"), purchaseOrderId: po1.id, warehouseId: warehouse.id, date: new Date("2026-05-05"), status: "draft", items: { create: [{ itemId: item1.id, qty: 10, unitCost: 60000 }, { itemId: item2.id, qty: 10, unitCost: 30000 }] } } });
  await onGoodsReceiptVerified(gr1.id, 1);
  console.log("GR1 verified");
  const gr2 = await prisma.goodsReceipt.create({ data: { documentNo: await generateDocumentNumber("GR"), purchaseOrderId: po2.id, warehouseId: warehouse.id, date: new Date("2026-05-06"), status: "draft", items: { create: [{ itemId: item3.id, qty: 5, unitCost: 175000 }, { itemId: item4.id, qty: 6, unitCost: 70000 }] } } });
  await onGoodsReceiptVerified(gr2.id, 1);
  console.log("GR2 verified");
  // 4. PROJECTS
  const proj1 = await prisma.project.create({ data: { documentNo: await generateDocumentNumber("PRJ"), name: "Service Berkala 40.000km - Avanza B 1234 XYZ", customerId: cust1.id, customerVehicleId: cv1.id, status: "in_progress", startDate: new Date("2026-05-10") } });
  const proj2 = await prisma.project.create({ data: { documentNo: await generateDocumentNumber("PRJ"), name: "Ganti Kampas Rem + Busi - L300 B 5678 ABC", customerId: cust2.id, customerVehicleId: cv2.id, status: "in_progress", startDate: new Date("2026-05-12") } });
  console.log("Projects created:", proj1.documentNo, proj2.documentNo);
  // 5. MATERIAL ISSUES
  const mi1 = await prisma.materialIssue.create({ data: { documentNo: await generateDocumentNumber("MI"), projectId: proj1.id, warehouseId: warehouse.id, date: new Date("2026-05-10"), status: "draft", notes: "Service berkala - ganti oli + filter", items: { create: [{ itemId: item1.id, qty: 4, cost: 60000 }, { itemId: item2.id, qty: 1, cost: 30000 }] } } });
  await onMaterialIssueCompleted(mi1.id, 1);
  console.log("MI1 completed - Oli+Filter untuk", cust1.name);
  const mi2 = await prisma.materialIssue.create({ data: { documentNo: await generateDocumentNumber("MI"), projectId: proj2.id, warehouseId: warehouse.id, date: new Date("2026-05-12"), status: "draft", notes: "Ganti kampas rem + busi", items: { create: [{ itemId: item3.id, qty: 1, cost: 175000 }, { itemId: item4.id, qty: 4, cost: 70000 }] } } });
  await onMaterialIssueCompleted(mi2.id, 1);
  console.log("MI2 completed - Rem+Busi untuk", cust2.name);
  // 6. RESTOCK
  const po3 = await prisma.purchaseOrder.create({ data: { documentNo: await generateDocumentNumber("PO"), vendorId: vendor2.id, date: new Date("2026-05-20"), status: "approved", subtotal: 540000, tax: 59400, grandTotal: 599400, items: { create: [{ itemId: item1.id, qty: 6, unitPrice: 62000, total: 372000 }, { itemId: item2.id, qty: 6, unitPrice: 32000, total: 192000 }] } } });
  const gr3 = await prisma.goodsReceipt.create({ data: { documentNo: await generateDocumentNumber("GR"), purchaseOrderId: po3.id, warehouseId: warehouse.id, date: new Date("2026-05-22"), status: "draft", items: { create: [{ itemId: item1.id, qty: 6, unitCost: 62000 }, { itemId: item2.id, qty: 6, unitCost: 32000 }] } } });
  await onGoodsReceiptVerified(gr3.id, 1);
  console.log("Restock GR3 verified (harga naik)");
  // 7. STOCK ADJUSTMENT
  const adj = await prisma.stockAdjustment.create({ data: { documentNo: await generateDocumentNumber("ADJ"), warehouseId: warehouse.id, date: new Date("2026-05-25"), reason: "Audit stok - oli bocor 1 botol", status: "draft", items: { create: [{ itemId: item1.id, systemQty: 12, actualQty: 11, difference: -1, unitCost: 60000, totalCost: 60000 }] } } });
  console.log("Adjustment created:", adj.documentNo);
  // 8. QUOTATION
  const quo = await prisma.quotation.create({ data: { documentNo: await generateDocumentNumber("QUO"), customerId: cust1.id, customerVehicleId: cv1.id, date: new Date("2026-05-08"), validUntil: new Date("2026-06-08"), status: "draft", subtotal: 585000, tax: 64350, discount: 0, grandTotal: 649350, notes: "Service berkala 40rb km", sections: { create: [{ name: "Sparepart", sortOrder: 1, items: { create: [{ itemId: item1.id, description: "Oli Mesin SAE 10W-40", qty: 4, unitPrice: 95000, total: 380000 }, { itemId: item2.id, description: "Filter Oli", qty: 1, unitPrice: 55000, total: 55000 }] } }, { name: "Jasa", sortOrder: 2, items: { create: [{ description: "Jasa Service Berkala", qty: 1, unitPrice: 150000, total: 150000 }] } }] } } });
  console.log("Quotation created:", quo.documentNo);
  // 9. FINAL CHECK
  const items = await prisma.item.findMany({ where: { id: { in: [item1.id, item2.id, item3.id, item4.id] } }, select: { name: true, qtyOnHand: true } });
  console.log("\nFinal stock:");
  for (const i of items) console.log(" ", i.name, ":", Number(i.qtyOnHand));
  console.log("\n=== SEED COMPLETE ===");
  console.log("Item IDs:", item1.id, item2.id, item3.id, item4.id);
  await prisma.$disconnect();
}
main().catch(e => { console.error("SEED ERROR:", e); process.exit(1); });
