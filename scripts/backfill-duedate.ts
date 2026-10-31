/**
 * R8-JB-09 lanjutan: backfill dueDate dokumen terbuka lama.
 *
 * Faktur penjualan + tagihan vendor berstatus posted/partial dengan
 * dueDate null diisi dari termin lawan yang aktif (date + term.days),
 * pola snapshot JB-09. Dokumen lunas/batal/sudah ber-dueDate tidak
 * disentuh. Idempoten: aman dijalankan ulang.
 *
 * Default DRY-RUN (hanya lapor). Terapkan dengan --apply:
 *   npx tsx scripts/backfill-duedate.ts
 *   npx tsx scripts/backfill-duedate.ts --apply
 */
import { prisma } from "../src/lib/db/prisma";
import { planDueDateBackfill } from "../src/lib/finance/due-date-backfill";

const OPEN = ["posted", "partial"] as const;

async function main() {
  const apply = process.argv.includes("--apply");

  const [invoices, bills] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: { status: { in: [...OPEN] }, deletedAt: null, dueDate: null },
      select: {
        id: true,
        date: true,
        customer: { select: { paymentTerm: { select: { days: true, isActive: true } } } },
      },
    }),
    prisma.vendorBill.findMany({
      where: { status: { in: [...OPEN] }, deletedAt: null, dueDate: null },
      select: {
        id: true,
        date: true,
        vendor: { select: { paymentTerm: { select: { days: true, isActive: true } } } },
      },
    }),
  ]);

  const termDays = (term: { days: number; isActive: boolean } | null | undefined) =>
    term && term.isActive ? term.days : null;

  const invoicePlans = planDueDateBackfill(
    invoices.map((inv) => ({ id: inv.id, date: inv.date, termDays: termDays(inv.customer?.paymentTerm) })),
  );
  const billPlans = planDueDateBackfill(
    bills.map((bill) => ({ id: bill.id, date: bill.date, termDays: termDays(bill.vendor?.paymentTerm) })),
  );

  console.log(
    `Kandidat: ${invoices.length} faktur, ${bills.length} bill terbuka tanpa dueDate; ` +
      `terisi dari termin: ${invoicePlans.length} faktur, ${billPlans.length} bill.`,
  );
  if (!apply) {
    console.log("DRY-RUN — tidak ada tulisan. Jalankan dengan --apply untuk menerapkan.");
    return;
  }

  // Klaim per baris tetap bersyarat dueDate null (idempoten di bawah
  // konkurensi: baris yang sudah terisi proses lain tidak ditimpa).
  let written = 0;
  for (const plan of invoicePlans) {
    const r = await prisma.salesInvoice.updateMany({
      where: { id: plan.id, dueDate: null },
      data: { dueDate: plan.dueDate },
    });
    written += r.count;
  }
  for (const plan of billPlans) {
    const r = await prisma.vendorBill.updateMany({
      where: { id: plan.id, dueDate: null },
      data: { dueDate: plan.dueDate },
    });
    written += r.count;
  }
  console.log(`Selesai: ${written} dokumen ter-backfill.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
