/**
 * AUD-NEXT-04 (putusan akuntan): WORKFLOW kredit pelanggan.
 * CustomerCredit pasif tanpa alokasi/refund = catatan mati. Service ini:
 * - allocateCreditToInvoice: pakai saldo kredit untuk lunasi faktur
 *   (Dr 210102 kewajiban UMP / Cr Piutang 1103 via SalesPayment + jurnal).
 * - refundCredit: kembalikan sisa ke kas (Dr 210102 / Cr Kas via jurnal).
 * Keduanya: lock baris (FOR UPDATE) + validasi saldo di DALAM transaksi +
 * tulis jejak (notes menunjuk nomor kredit & dokumen lawan). allocated +
 * refunded tak boleh > received — guard di sini + di tes.
 */
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { onSalesPaymentCreated } from "@/lib/hooks/accounting.hook";
import { getSystemSettings } from "@/lib/utils/settings";
import { getErrorMessage } from "@/lib/utils/error";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";

export async function creditBalance(creditId: number): Promise<number> {
  const c = await prisma.customerCredit.findUniqueOrThrow({ where: { id: creditId } });
  return Number(c.receivedAmount) - Number(c.allocatedAmount) - Number(c.refundedAmount);
}

export async function allocateCreditToInvoice(
  creditId: number,
  salesInvoiceId: number,
  amount: number,
  userId?: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(amount > 0)) return { success: false, error: "Nominal alokasi harus > 0" };
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customer_credits WHERE id = ${creditId} FOR UPDATE`;
      // AUD-R4-03: kunci baris FAKTUR juga — dua kredit paralel ke faktur yang
      // sama tanpa ini membaca owing yang sama → over-allocate. Urutan lock
      // selalu kredit-dulu-faktur-kemudian (konsisten dengan refund: hanya
      // kredit) agar tak ada deadlock silang.
      await tx.$queryRaw`SELECT id FROM sales_invoices WHERE id = ${salesInvoiceId} FOR UPDATE`;
      const credit = await tx.customerCredit.findUniqueOrThrow({ where: { id: creditId } });
      const balance = Number(credit.receivedAmount) - Number(credit.allocatedAmount) - Number(credit.refundedAmount);
      if (amount > balance) {
        throw new Error(`Saldo kredit tidak cukup (sisa ${balance}, diminta ${amount})`);
      }
      const invoice = await tx.salesInvoice.findUniqueOrThrow({ where: { id: salesInvoiceId } });
      if (invoice.status === "cancelled") throw new Error("Faktur batal tidak bisa dialokasi kredit");
      // AUD-R4-02: kredit pelanggan A tak boleh melunasi faktur pelanggan B.
      // customerId payment = credit.customerId — tanpa gate ini piutang/kredit
      // tercampur dan saldo sengketa.
      if (Number(invoice.customerId) !== Number(credit.customerId)) {
        throw new Error(
          `Kredit milik pelanggan #${credit.customerId} tidak bisa dialokasikan ke faktur pelanggan #${invoice.customerId}`,
        );
      }
      // AUD-R4-04: idempotency retry — marker unik per permintaan. Retry klik
      // ganda / logActivity gagal pasca-commit tak boleh gandakan payment.
      const idemMarker = `kredit:${credit.documentNo}->inv:${invoice.documentNo}:${amount}`;
      const dup = await tx.salesPayment.findFirst({
        where: { salesInvoiceId, paymentMethod: "customer_credit", notes: { contains: idemMarker } },
        select: { id: true },
      });
      if (dup) return;
      const owing = Number(invoice.grandTotal) - Number(invoice.paidAmount);
      if (amount > owing) {
        throw new Error(`Alokasi melebihi sisa faktur (sisa ${owing}, diminta ${amount})`);
      }
      const payDocNo = await generateDocumentNumber("PAY");
      const payment = await tx.salesPayment.create({
        data: {
          documentNo: payDocNo,
          salesInvoiceId,
          customerId: credit.customerId,
          amount,
          paymentDate: new Date(),
          paymentMethod: "customer_credit",
          notes: `Alokasi kredit pelanggan ${credit.documentNo} [${idemMarker}]`,
          createdBy: userId ?? null,
        },
      });
      await tx.customerCredit.update({
        where: { id: creditId },
        data: {
          allocatedAmount: Number(credit.allocatedAmount) + amount,
          status: amount >= balance ? "used" : credit.status,
        },
      });
      const payments = await tx.salesPayment.findMany({
        where: { salesInvoiceId },
        select: { amount: true },
      });
      const totalPaid = Math.min(
        payments.reduce((s, p) => s + Number(p.amount), 0),
        Number(invoice.grandTotal),
      );
      await tx.salesInvoice.update({
        where: { id: salesInvoiceId },
        data: {
          paidAmount: totalPaid,
          paymentStatus: totalPaid >= Number(invoice.grandTotal) ? "paid" : "partial",
        },
      });
      await onSalesPaymentCreated(payment.id, userId, tx as never);
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: getErrorMessage(e) };
  }
}

export async function refundCredit(
  creditId: number,
  amount: number,
  userId?: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!(amount > 0)) return { success: false, error: "Nominal refund harus > 0" };
    const settings = await getSystemSettings();
    if (!settings.cashBankAccountId || !(settings as { customerDownPaymentAccountId?: number | null }).customerDownPaymentAccountId) {
      return { success: false, error: "Akun kas/bank dan kewajiban UMP (210102) belum dikonfigurasi" };
    }
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customer_credits WHERE id = ${creditId} FOR UPDATE`;
      const credit = await tx.customerCredit.findUniqueOrThrow({ where: { id: creditId } });
      const balance = Number(credit.receivedAmount) - Number(credit.allocatedAmount) - Number(credit.refundedAmount);
      if (amount > balance) {
        throw new Error(`Saldo kredit tidak cukup (sisa ${balance}, diminta ${amount})`);
      }
      // AUD-R4-05: refund memposting jurnal POSTED — periode tutup = tolak
      // SEBELUM saldo berubah (tanpa ini kontrol period-lock bisa dilewati).
      const refundDate = new Date();
      await assertPeriodOpen(refundDate, tx as never);
      await tx.customerCredit.update({
        where: { id: creditId },
        data: {
          refundedAmount: Number(credit.refundedAmount) + amount,
          status: amount >= balance ? "refunded" : credit.status,
        },
      });
      // Jurnal refund: Dr 210102 (kewajiban lunas) / Cr Kas. Kas KELUAR —
      // satu-satunya jurnal kas di alur kredit (terima DP sudah Dr Kas di
      // awal; alokasi antar-subledger nol-net tanpa kas).
      const journalNumber = await generateDocumentNumber("JRN");
      const dpAccount = (settings as { customerDownPaymentAccountId: number }).customerDownPaymentAccountId;
      const journal = await tx.journal.create({
        data: {
          journalNumber,
          transactionDate: refundDate,
          referenceType: "CustomerCredit",
          referenceId: creditId,
          description: `Refund kredit pelanggan ${credit.documentNo}`,
          type: "AUTO",
          status: "POSTED",
          totalDebit: amount,
          totalCredit: amount,
          createdBy: userId ?? null,
          entries: {
            create: [
              { accountId: dpAccount, debit: amount, credit: 0, memo: "Refund kewajiban UMP" },
              { accountId: settings.cashBankAccountId!, debit: 0, credit: amount, memo: "Kas keluar refund" },
            ],
          },
        },
      });
      void journal;
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: getErrorMessage(e) };
  }
}
