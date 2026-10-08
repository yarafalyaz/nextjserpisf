/**
 * One-off repair: post the missing GL journal for a verified goods receipt whose
 * journal was silently skipped because the account mapping was unset at the
 * time. It reuses the SAME amount the stock move already carries so the GL
 * matches the stock subledger, and does NOT touch stock/FIFO/qty_on_hand.
 *
 * Usage (inside the app container):
 *   npx tsx scripts/repair-gr-journal.ts 1
 */
import { prisma } from "../src/lib/db/prisma";
import { generateDocumentNumber } from "../src/lib/utils/document-number";

async function main() {
  const grId = Number(process.argv[2]);
  if (!grId) throw new Error("Pass the goods receipt id, e.g. `tsx scripts/repair-gr-journal.ts 1`");

  const gr = await prisma.goodsReceipt.findUniqueOrThrow({
    where: { id: grId },
    include: { items: true },
  });

  const existing = await prisma.journal.findFirst({
    where: { referenceType: "GoodsReceipt", referenceId: grId },
  });
  if (existing) {
    console.log(`GR #${grId} already has journal ${existing.journalNumber}; nothing to do.`);
    return;
  }

  const moves = await prisma.stockMove.findMany({
    where: { referenceType: "GoodsReceipt", referenceId: grId },
  });
  if (moves.length === 0) {
    console.log(`GR #${grId} has no stock movement; verify it first.`);
    return;
  }

  const settings = await prisma.systemSetting.findFirstOrThrow();
  const inv = settings.inventoryAccountId;
  const clearing = settings.purchaseInventoryAccountId;
  if (!inv || !clearing) {
    throw new Error("Account mapping still unset (inventory / purchaseInventory).");
  }

  // Total inventory value = sum of stock moves (already base-converted + landed).
  const total = moves.reduce((s, m) => s + Number(m.qty) * Number(m.cost), 0);
  if (total <= 0) {
    console.log(`GR #${grId} has no inventory value to post.`);
    return;
  }

  const journalNumber = await generateDocumentNumber("JRN");

  await prisma.journal.create({
    data: {
      journalNumber,
      transactionDate: gr.date,
      referenceType: "GoodsReceipt",
      referenceId: grId,
      description: `Penerimaan Barang ${gr.documentNo}`,
      type: "GR",
      status: "POSTED",
      totalDebit: total,
      totalCredit: total,
      createdBy: gr.createdBy ?? null,
      entries: {
        create: [
          {
            accountId: inv,
            debit: total,
            credit: 0,
            memo: `Debit Persediaan - GR ${gr.documentNo}`,
          },
          {
            accountId: clearing,
            debit: 0,
            credit: total,
            memo: `Kredit Hutang Pembelian (clearing) - GR ${gr.documentNo}`,
          },
        ],
      },
    },
  });

  console.log(`Posted journal ${journalNumber} for GR #${grId}: Dr ${inv} / Cr ${clearing} = ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
