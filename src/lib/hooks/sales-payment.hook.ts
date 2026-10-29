
import { prisma } from "@/lib/db/prisma";
import { safeSum } from "@/lib/utils/math";
import { SalesInvoiceStatus, Prisma } from "@prisma/client";
import { commissionSnapshotForPaid } from "@/lib/services/commission-snapshot";
import { accrueTx as accrueCommissionPayableTx } from "@/lib/services/commission-payable.service";
import { derivePaymentStatus } from "@/lib/finance/settlement-status";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Core recalculation that runs against a given client (transaction or global).
 * Does NOT open its own transaction so it can be composed inside a larger one.
 */
async function recalcCore(db: Db, invoiceId: number): Promise<void> {
  const invoice = await db.salesInvoice.findUniqueOrThrow({ where: { id: invoiceId } });

  // Laravel parity: skip observer update for cancelled/draft invoice
  if (invoice.status === SalesInvoiceStatus.cancelled || invoice.status === SalesInvoiceStatus.draft) return;

  // FIN-BR-008: pembayaran reversed TIDAK melunasi piutang lagi — dikeluarkan
  // dari total; recalc sesudah reversal menurunkan status faktur dari paid.
  const payments = await db.salesPayment.findMany({
    where: { salesInvoiceId: invoiceId, status: { not: "reversed" } },
    select: { amount: true, withholdingAmount: true },
  });

  // safeSum() runs each value through safeRound() and accumulates with
  // safeAdd() (exponential-notation rounding). Without this, summing e.g.
  // [0.1, 0.7] as raw JS numbers yields 0.7999999999999999, which fails the
  // `totalPaid >= grandTotal` check below and leaves a fully-settled invoice
  // stuck on "partial" forever (breaking AR aging + paymentStatus reports).
  // Match the 2-decimal precision of `Decimal(15, 2)` on SalesPayment.amount /
  // SalesInvoice.grandTotal in the Prisma schema.
  //
  // Yang melunasi piutang adalah `amount + withholdingAmount`: PPh yang dipotong
  // pelanggan tidak masuk kas, tetapi tetap menghapus piutang (jurnalnya
  // Dr PPh dibayar dimuka). Menghitung `amount` saja membuat faktur yang dipotong
  // PPh tidak pernah lunas.
  const totalPaid = safeSum(
    payments.map((p) => Number(p.amount) + Number(p.withholdingAmount ?? 0)),
    2,
  );
  const grandTotal = Number(invoice.grandTotal ?? 0);

  // FIN-BR-007: SalesPayment tidak punya status draft/gagal — baris hanya
  // dibuat di dalam transaksi pembayaran terkonfirmasi (createSalesPayment),
  // jadi semua baris di sini pembayaran valid. Bila status pembayaran
  // ditambah kelak, filter hanya baris terposting di query ini.
  // FIN-BR-006: lunas diturunkan dari outstanding valid dalam toleransi
  // SETTLEMENT_TOLERANCE_IDR (Rp1), bukan flag manual.
  const derived = derivePaymentStatus(grandTotal, totalPaid);
  const status: SalesInvoiceStatus = derived;
  const paymentStatus: string = derived;

  // F-2026-10-25-036-S (BR-KT36-04): transisi ke paid membekukan snapshot
  // tarif komisi dalam transaksi yang sama. Nilai = resolusi histori tarif
  // per TANGGAL FAKTUR dari kategori pelanggan saat ini; snapshot yang
  // sudah ada tidak pernah ditulis ulang (kategori/tarif berubah belakangan
  // tidak mengubah faktur lunas). Tarif tak ditemukan = 0 jujur tertulis,
  // supaya tarif yang dibuat mundur tidak mengisi faktur lama (BR-KT36-13).
  // Resolver bersama dengan jalur DP/kredit: commissionSnapshotForPaid.
  const commissionSnapshot = await commissionSnapshotForPaid(
    db,
    invoice,
    status === "paid",
  )

  await db.salesInvoice.update({
    where: { id: invoiceId },
    data: {
      paidAmount: totalPaid,
      status,
      paymentStatus,
      ...(commissionSnapshot ?? {}),
    },
  });

  // Tahap 3 komisi (vonis R-komisi-vonispayable §5): SATU tx = transisi paid
  // + snapshot + baris subledger + jurnal. Gagal syarat lahir = nol baris +
  // nol jurnal berlabel alasan; faktur tetap paid (empat status terpisah).
  // Fail-closed TIDAK boleh menggagalkan pembayaran: mapping belum lengkap =
  // catat alasan, lanjut (vonis §5).
  if (status === "paid") {
    try {
      await accrueCommissionPayableTx(db, invoiceId, null, {
        status: invoice.status,
        salesEmployeeId: (invoice as { salesEmployeeId?: unknown }).salesEmployeeId,
        commissionRatePercent: (invoice as { commissionRatePercent?: unknown }).commissionRatePercent,
        grandTotal: invoice.grandTotal,
        taxAmount: (invoice as { taxAmount?: unknown }).taxAmount,
        updatedAt: (invoice as { updatedAt?: unknown }).updatedAt,
      });
    } catch (e) {
      console.error("[commission] akrual dilewati:", e instanceof Error ? e.message : e);
    }
  }
}

/**
 * Recalculate invoice payment state. If `txClient` is supplied, the work joins
 * that transaction (atomic with the caller); otherwise it opens its own.
 */
async function recalculateInvoicePaymentState(invoiceId: number, txClient?: Db): Promise<void> {
  if (txClient) {
    await recalcCore(txClient, invoiceId);
  } else {
    await prisma.$transaction((tx) => recalcCore(tx, invoiceId));
  }
}

/**
 * Recalculate invoice paid amount and status after a payment is created.
 * Pass `txClient` to run atomically within the caller's transaction.
 */
export async function onSalesPaymentCreated(paymentId: number, txClient?: Db): Promise<void> {
  const db = txClient ?? prisma;
  const payment = await db.salesPayment.findUniqueOrThrow({
    where: { id: paymentId },
    select: { salesInvoiceId: true },
  });

  if (!payment.salesInvoiceId) return;
  await recalculateInvoicePaymentState(payment.salesInvoiceId, txClient);
}

/**
 * Recalculate invoice paid amount and status after a payment is updated.
 */
export async function onSalesPaymentUpdated(invoiceId: number, txClient?: Db): Promise<void> {
  await recalculateInvoicePaymentState(invoiceId, txClient);
}

/**
 * Recalculate invoice paid amount and status after a payment is deleted.
 */
export async function onSalesPaymentDeleted(invoiceId: number, txClient?: Db): Promise<void> {
  await recalculateInvoicePaymentState(invoiceId, txClient);
}
