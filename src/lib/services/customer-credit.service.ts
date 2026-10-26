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
import { getSystemSettings } from "@/lib/utils/settings";
import { getErrorMessage } from "@/lib/utils/error";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import {
  claimIdempotencyKey,
  bindIdempotencyKey,
  isValidIdempotencyKey,
  isDefinitiveError,
  definitive,
  payloadFingerprint,
} from "@/lib/services/financial-idempotency.service";
import {
  buildDownPaymentRefundLines,
  snapshotFromDownPaymentRow,
} from "@/lib/tax/down-payment-vat";
import { commissionSnapshotForPaid } from "@/lib/services/commission-snapshot";

export async function creditBalance(creditId: number): Promise<number> {
  const c = await prisma.customerCredit.findUniqueOrThrow({ where: { id: creditId } });
  return Number(c.receivedAmount) - Number(c.allocatedAmount) - Number(c.refundedAmount);
}

export async function allocateCreditToInvoice(
  creditId: number,
  salesInvoiceId: number,
  amount: number,
  userId?: number,
  /** AUD-R7-01: alokasi WAJIB key — semua jalur (UI maupun internal),
   * sama seperti refund. Tanpa key/format cacat = ditolak sebelum mutasi. */
  idempotencyKey?: string,
): Promise<{ success: boolean; error?: string; ambiguous?: boolean; replayed?: boolean; paymentId?: number }> {
  try {
    if (!(amount > 0)) return { success: false, error: "Nominal alokasi harus > 0" };
    if (!isValidIdempotencyKey(idempotencyKey)) {
      return { success: false, error: "Alokasi wajib idempotency key valid (submit via panel kredit)" };
    }
    let replayPaymentId: number | undefined;
    let isReplay = false;
    // AUD-R8-02: fingerprint intent ini — replay payload beda = konflik.
    const fp = payloadFingerprint({
      scope: "customer_credit_allocate",
      creditId,
      salesInvoiceId,
      amount,
    });
    // AUD-FIN-03: settings dibaca SEBELUM tx agar fail-closed akun 210102/
    // piutang diputus sebelum mutasi apa pun (bukan setengah jalan).
    const settings = await getSystemSettings();
    const dpAccountId = (settings as { customerDownPaymentAccountId?: number | null }).customerDownPaymentAccountId ?? null;
    const arAccountId = (settings as { salesReceivableAccountId?: number | null }).salesReceivableAccountId ?? null;
    if (!dpAccountId || !arAccountId) {
      return { success: false, error: "Akun kewajiban UMP (210102) dan Piutang Usaha belum dikonfigurasi — alokasi kredit ditolak" };
    }
    await prisma.$transaction(async (tx) => {
      // AUD-R7-02/03: claim validasi scope+hasil. Replay = return + teruskan
      // ref payment awal ke caller (bukti operasi pertama, bukan sukses generik).
      const claim = await claimIdempotencyKey(tx as never, "customer_credit_allocate", idempotencyKey, userId, fp);
      if (claim.replayed) {
        isReplay = true;
        replayPaymentId = claim.resultRefId ?? undefined;
        return;
      }
      await tx.$queryRaw`SELECT id FROM customer_credits WHERE id = ${creditId} FOR UPDATE`;
      // AUD-R4-03: kunci baris FAKTUR juga — dua kredit paralel ke faktur yang
      // sama tanpa ini membaca owing yang sama → over-allocate. Urutan lock
      // selalu kredit-dulu-faktur-kemudian (konsisten dengan refund: hanya
      // kredit) agar tak ada deadlock silang.
      await tx.$queryRaw`SELECT id FROM sales_invoices WHERE id = ${salesInvoiceId} FOR UPDATE`;
      const credit = await tx.customerCredit.findUniqueOrThrow({ where: { id: creditId } });
      const balance = Number(credit.receivedAmount) - Number(credit.allocatedAmount) - Number(credit.refundedAmount);
      if (amount > balance) {
        throw definitive(`Saldo kredit tidak cukup (sisa ${balance}, diminta ${amount})`);
      }
      const invoice = await tx.salesInvoice.findUniqueOrThrow({ where: { id: salesInvoiceId } });
      if (invoice.status === "cancelled") throw definitive("Faktur batal tidak bisa dialokasi kredit");
      // AUD-R4-02: kredit pelanggan A tak boleh melunasi faktur pelanggan B.
      // customerId payment = credit.customerId — tanpa gate ini piutang/kredit
      // tercampur dan saldo sengketa.
      if (Number(invoice.customerId) !== Number(credit.customerId)) {
        throw definitive(
          `Kredit milik pelanggan #${credit.customerId} tidak bisa dialokasikan ke faktur pelanggan #${invoice.customerId}`,
        );
      }
      // Jejak audit: nomor kredit + key (bila ada) di notes.
      const owing = Number(invoice.grandTotal) - Number(invoice.paidAmount);
      if (amount > owing) {
        throw definitive(`Alokasi melebihi sisa faktur (sisa ${owing}, diminta ${amount})`);
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
          notes: `Alokasi kredit pelanggan ${credit.documentNo}${idempotencyKey ? ` [idem:${idempotencyKey.slice(0, 8)}]` : ""}`,
          createdBy: userId ?? null,
        },
      });
      await bindIdempotencyKey(tx as never, idempotencyKey as string, "SalesPayment", payment.id);
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
      // BLOCKER-1 F-036-S: alokasi yang melunasi faktur WAJIB membekukan
      // snapshot tarif komisi di transaksi yang sama (resolver sama
      // seperti recalcCore, per tanggal faktur).
      const creditGoingPaid = totalPaid >= Number(invoice.grandTotal)
      const commissionSnapshot = await commissionSnapshotForPaid(
        tx as never,
        {
          id: salesInvoiceId,
          customerId: Number(invoice.customerId),
          date: (invoice as { date: Date }).date,
          commissionRatePercent: (invoice as { commissionRatePercent?: number | null }).commissionRatePercent ?? null,
        },
        creditGoingPaid,
      )
      await tx.salesInvoice.update({
        where: { id: salesInvoiceId },
        data: {
          paidAmount: totalPaid,
          paymentStatus: creditGoingPaid ? "paid" : "partial",
          ...commissionSnapshot,
        },
      });
      // AUD-FIN-03 (putusan akuntan): alokasi kredit = reklas antar-subledger
      // kewajiban 210102 → piutang, NOL-NET tanpa kas. Kas penuh SUDAH dijurnal
      // saat terima DP/kredit — panggil onSalesPaymentCreated generik (Dr Kas /
      // Cr Piutang) = kas double-count. Fail-closed (cek di atas) bila akun
      // 210102/piutang belum mapping.
      const allocateDate = new Date();
      await assertPeriodOpen(allocateDate, tx as never);
      const existingAllocateJournal = await tx.journal.findFirst({
        where: { referenceType: "SalesPayment", referenceId: payment.id },
      });
      if (!existingAllocateJournal) {
        const allocJournalNo = await generateDocumentNumber("JRN");
        await tx.journal.create({
          data: {
            journalNumber: allocJournalNo,
            transactionDate: allocateDate,
            referenceType: "SalesPayment",
            referenceId: payment.id,
            description: `Alokasi kredit pelanggan ${credit.documentNo} ke faktur ${(invoice as { documentNo?: string }).documentNo ?? salesInvoiceId}`,
            type: "AUTO",
            status: "POSTED",
            totalDebit: amount,
            totalCredit: amount,
            createdBy: userId ?? null,
            entries: {
              create: [
                { accountId: dpAccountId, debit: amount, credit: 0, memo: "Alokasi kewajiban UMP" },
                { accountId: arAccountId, debit: 0, credit: amount, memo: "Pelunasan piutang via kredit pelanggan" },
              ],
            },
          },
        });
      }
      replayPaymentId = payment.id;
    });
    // AUD-R7-03: replay = sukses + flag + ID payment awal (UI tahu ini hasil
    // lama, bukan operasi baru). Operasi baru = replayed:false + ID baru.
    return { success: true, replayed: isReplay, paymentId: replayPaymentId };
  } catch (e) {
    // AUD-R8-01: bedakan definitif (aman ganti key) vs ambigu (tahan key!).
    // getErrorMessage strip prefix? Tidak — prefix [DEFINITIF] dipertahankan
    // di pesan agar action/UI bisa bedakan tanpa parsing rapuh.
    return { success: false, error: getErrorMessage(e), ambiguous: !isDefinitiveError(e) };
  }
}

export async function refundCredit(
  creditId: number,
  amount: number,
  userId?: number,
  /** AUD-R6-05: refund WAJIB key — SEMUA jalur (UI maupun internal).
   * Tanpa key = ditolak mentah. Kas keluar ganda = kerugian nyata; tak ada
   * pengecualian "pemanggil lama". */
  idempotencyKey?: string,
): Promise<{ success: boolean; error?: string; ambiguous?: boolean; replayed?: boolean; journalId?: number }> {
  try {
    if (!(amount > 0)) return { success: false, error: "Nominal refund harus > 0" };
    const settings = await getSystemSettings();
    if (!settings.cashBankAccountId || !(settings as { customerDownPaymentAccountId?: number | null }).customerDownPaymentAccountId) {
      return { success: false, error: "Akun kas/bank dan kewajiban UMP (210102) belum dikonfigurasi" };
    }
    // AUD-R7-01: gate key + format SEBELUM transaksi — tanpa key/format
    // cacat langsung tolak (validasi server, tak percaya browser).
    if (!isValidIdempotencyKey(idempotencyKey)) {
      return { success: false, error: "Refund wajib idempotency key valid (submit via panel kredit)" };
    }
    let replayJournalId: number | undefined;
    let isReplay = false;
    await prisma.$transaction(async (tx) => {
      const fpRefund = payloadFingerprint({
        scope: "customer_credit_refund",
        creditId,
        amount,
      });
      // AUD-R7-02/03: replay = return + teruskan ref jurnal awal.
      const claim = await claimIdempotencyKey(tx as never, "customer_credit_refund", idempotencyKey, userId, fpRefund);
      if (claim.replayed) {
        isReplay = true;
        replayJournalId = claim.resultRefId ?? undefined;
        return;
      }
      await tx.$queryRaw`SELECT id FROM customer_credits WHERE id = ${creditId} FOR UPDATE`;
      const credit = await tx.customerCredit.findUniqueOrThrow({ where: { id: creditId } });
      const balance = Number(credit.receivedAmount) - Number(credit.allocatedAmount) - Number(credit.refundedAmount);
      if (amount > balance) {
        throw definitive(`Saldo kredit tidak cukup (sisa ${balance}, diminta ${amount})`);
      }
      // AUD-R4-05: refund memposting jurnal POSTED — periode tutup = tolak
      // SEBELUM saldo berubah (tanpa ini kontrol period-lock bisa dilewati).
      const refundDate = new Date();
      await assertPeriodOpen(refundDate, tx as never);
      // F-2026-10-25-004-V J-RF1: kredit bersumber DP terutang PPN.
      // FP UM aktif = refund DITOLAK sampai FP UM batal tercatat;
      // sesudah batal, jurnal pecah Dr 210102 neto + Dr 210201 PPN.
      let refundLines: { accountId: number; debit: number; credit: number; memo: string }[] | null = null;
      if (credit.sourceType === "DownPayment" && credit.sourceId != null) {
        const dp = await tx.downPayment.findUnique({ where: { id: credit.sourceId } });
        const dpSnapshot = dp ? snapshotFromDownPaymentRow(dp as never) : null;
        if (dp && dpSnapshot && dpSnapshot.ppnUangMuka > 0) {
          const activeFp = await tx.taxInvoice.findFirst({
            where: { downPaymentId: dp.id, direction: "out", djpStatus: { notIn: ["cancelled", "replaced"] } },
            select: { id: true },
          });
          if (activeFp) {
            throw definitive(
              `FP uang muka #${activeFp.id} masih aktif — batalkan FP UM dulu sebelum refund DP terutang (J-RF1)`,
            );
          }
          const taxAccountId = (settings as { salesTaxAccountId?: number | null }).salesTaxAccountId ?? null;
          if (!taxAccountId) {
            throw definitive("Akun PPN Keluaran (210201) belum dikonfigurasi — refund DP terutang ditolak");
          }
          const accountByKey = {
            cashBank: settings.cashBankAccountId!,
            downPaymentLiability: (settings as { customerDownPaymentAccountId: number }).customerDownPaymentAccountId,
            salesTax: taxAccountId,
            receivable: 0,
          } as const;
          refundLines = buildDownPaymentRefundLines({
            refundAmount: amount,
            dpAmount: Number(dp.amount),
            snapshot: dpSnapshot,
          }).map((line) => ({
            accountId: accountByKey[line.account],
            debit: line.debit,
            credit: line.credit,
            memo: line.memo,
          }));
        }
      }
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
            create: refundLines ?? [
              { accountId: dpAccount, debit: amount, credit: 0, memo: "Refund kewajiban UMP" },
              { accountId: settings.cashBankAccountId!, debit: 0, credit: amount, memo: "Kas keluar refund" },
            ],
          },
        },
      });
      await bindIdempotencyKey(tx as never, idempotencyKey as string, "Journal", journal.id);
      replayJournalId = journal.id;
    });
    return { success: true, replayed: isReplay, journalId: replayJournalId };
  } catch (e) {
    // AUD-R8-01: sama — ambigu (timeout/deadlock/koneksi) = tahan key.
    return { success: false, error: getErrorMessage(e), ambiguous: !isDefinitiveError(e) };
  }
}
