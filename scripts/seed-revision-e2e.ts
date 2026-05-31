import { prisma } from "../src/lib/db/prisma";
import { resyncOnEdit } from "../src/lib/services/quotation-sync.service";

async function main() {
  console.log("=== E2E: QUOTATION REVISION FLOW ===\n");

  // Find the first draft quotation
  const quo = await prisma.quotation.findFirst({ where: { status: "draft" }, include: { sections: { include: { items: true } } } });
  if (!quo) { console.log("No draft quotation found, skipping"); return; }

  console.log("1. Quotation:", quo.documentNo, "| revision:", quo.revisionNumber);
  console.log("   Items:", quo.sections.flatMap(s => s.items).length);

  // Simulate revision (increment + history)
  await prisma.quotation.update({
    where: { id: quo.id },
    data: { revisionNumber: { increment: 1 }, notes: "Revisi: tambah jasa spooring" },
  });

  await prisma.quotationHistory.create({
    data: {
      quotationId: quo.id,
      action: "revised",
      description: `Revisi #${quo.revisionNumber + 1} — ${quo.documentNo}`,
    },
  });
  console.log("2. Revision incremented + history created ✓");

  // Test resync (should not crash even if no linked SO/Invoice)
  try {
    await resyncOnEdit(quo.id);
    console.log("3. resyncOnEdit() completed ✓ (no crash)");
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.log("3. resyncOnEdit() error:", message);
  }

  // Verify
  const updated = await prisma.quotation.findUnique({ where: { id: quo.id } });
  const history = await prisma.quotationHistory.findMany({ where: { quotationId: quo.id }, orderBy: { createdAt: "asc" } });
  console.log("\n4. Verification:");
  console.log("   Revision number:", updated?.revisionNumber, "(expected:", quo.revisionNumber + 1, ")");
  console.log("   History entries:", history.length);
  for (const h of history) console.log("     -", h.action, ":", h.description);

  console.log("\n=== REVISION FLOW E2E COMPLETE ===");
  await prisma.$disconnect();
}

main().catch((e) => { console.error("ERROR:", e); process.exit(1); });
