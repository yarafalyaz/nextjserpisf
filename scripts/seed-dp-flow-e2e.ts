import { prisma } from "../src/lib/db/prisma";
import { generateDocumentNumber } from "../src/lib/utils/document-number";
import { onDownPaymentConfirmed } from "../src/lib/hooks/down-payment.hook";

async function main() {
  console.log("=== E2E: DOWN PAYMENT → WO + PROJECT + SO + INVOICE ===\n");

  // Find existing data
  const cust1 = await prisma.customer.findFirst({ where: { name: "Budi Santoso" } });
  const cv1 = await prisma.customerVehicle.findFirst({ where: { licensePlate: "B 1234 XYZ" } });
  const item1 = await prisma.item.findFirst({ where: { name: "Oli Mesin SAE 10W-40 (1L)" } });
  const item2 = await prisma.item.findFirst({ where: { name: "Filter Oli Universal" } });

  if (!cust1 || !cv1 || !item1 || !item2) {
    console.error("Missing base data! Run seed-full-system.ts first.");
    process.exit(1);
  }
  console.log("Base data found ✓");

  // 1. Create Quotation (status: accepted)
  const quo = await prisma.quotation.create({
    data: {
      documentNo: await generateDocumentNumber("QUO"),
      customerId: cust1.id,
      customerVehicleId: cv1.id,
      date: new Date("2026-05-28"),
      validUntil: new Date("2026-06-28"),
      status: "accepted",
      subtotal: 535000,
      tax: 58850,
      discount: 0,
      grandTotal: 593850,
      notes: "Service berkala 60rb km - Avanza",
      sections: {
        create: [
          {
            name: "Sparepart",
            sortOrder: 1,
            items: {
              create: [
                { itemId: item1.id, description: "Oli Mesin SAE 10W-40", qty: 4, unitPrice: 95000, total: 380000 },
                { itemId: item2.id, description: "Filter Oli", qty: 1, unitPrice: 55000, total: 55000 },
              ],
            },
          },
          {
            name: "Jasa",
            sortOrder: 2,
            items: {
              create: [
                { description: "Jasa Service Berkala 60rb km", qty: 1, unitPrice: 100000, total: 100000 },
              ],
            },
          },
        ],
      },
    },
  });
  console.log("1. Quotation created:", quo.documentNo, "(status: accepted)");

  // 2. Create Down Payment
  const dp = await prisma.downPayment.create({
    data: {
      documentNo: await generateDocumentNumber("DP"),
      quotationId: quo.id,
      customerId: cust1.id,
      amount: 300000,
      paymentDate: new Date("2026-05-28"),
      paymentMethod: "transfer",
      status: "pending",
      notes: "DP 50% untuk service berkala",
    },
  });
  console.log("2. Down Payment created:", dp.documentNo, "Rp", Number(dp.amount));

  // 3. Confirm DP → triggers hook
  console.log("3. Confirming DP (triggers WO + Project + SO + Invoice creation)...");
  await onDownPaymentConfirmed(dp.id, 1);
  console.log("   DP Confirmed ✓");

  // 4. Verify created documents
  const wo = await prisma.workOrder.findFirst({ where: { quotationId: quo.id } });
  const project = await prisma.project.findFirst({ where: { customerId: cust1.id, name: { contains: "Budi Santoso" } }, orderBy: { id: "desc" } });
  const so = await prisma.salesOrder.findFirst({ where: { quotationId: quo.id } });
  const inv = await prisma.salesInvoice.findFirst({ where: { quotationId: quo.id } });
  const stages = project ? await prisma.projectStage.findMany({ where: { projectId: project.id } }) : [];

  console.log("\n4. Verification:");
  console.log("   Work Order:", wo?.documentNo, "| status:", wo?.status);
  console.log("   Project:", project?.documentNo, "|", project?.name, "| status:", project?.status);
  console.log("   Project Stages:", stages.length, "(", stages.map(s => s.name).join(", "), ")");
  console.log("   Sales Order:", so?.documentNo, "| status:", so?.status);
  console.log("   Invoice:", inv?.documentNo, "| status:", inv?.status, "| paymentStatus:", inv?.paymentStatus);

  // 5. Check quotation status changed
  const quoUpdated = await prisma.quotation.findUnique({ where: { id: quo.id } });
  console.log("   Quotation status:", quoUpdated?.status, "(should be 'converted')");

  // 6. Check DP status
  const dpUpdated = await prisma.downPayment.findUnique({ where: { id: dp.id } });
  console.log("   DP status:", dpUpdated?.status, "(should be 'confirmed')");

  console.log("\n=== DP FLOW E2E COMPLETE ===");
  await prisma.$disconnect();
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });

// ─── QUOTATION REVISION FLOW TEST ────────────────────────────────
async function testRevisionFlow() {
  console.log("\n=== E2E: QUOTATION REVISION FLOW ===\n");

  // Find the first quotation (draft)
  const quo = await prisma.quotation.findFirst({ where: { status: "draft" } });
  if (!quo) { console.log("No draft quotation found, skipping"); return; }

  console.log("1. Quotation:", quo.documentNo, "| revision:", quo.revisionNumber);

  // Simulate revision (increment + history)
  await prisma.quotation.update({
    where: { id: quo.id },
    data: { revisionNumber: { increment: 1 }, notes: "Revisi: harga oli naik" },
  });

  await prisma.quotationHistory.create({
    data: {
      quotationId: quo.id,
      action: "revised",
      description: `Revisi #${quo.revisionNumber + 1} — ${quo.documentNo}`,
    },
  });
  console.log("2. Revision created ✓");

  // Verify
  const updated = await prisma.quotation.findUnique({ where: { id: quo.id } });
  const history = await prisma.quotationHistory.findMany({ where: { quotationId: quo.id } });
  console.log("3. Verification:");
  console.log("   Revision number:", updated?.revisionNumber, "(should be", quo.revisionNumber + 1, ")");
  console.log("   History entries:", history.length);
  for (const h of history) console.log("     -", h.action, ":", h.description);

  console.log("\n=== REVISION FLOW E2E COMPLETE ===");
}

testRevisionFlow().then(() => prisma.$disconnect());
