
import { prisma } from "@/lib/db/prisma";
import { safeSum } from "@/lib/utils/math";
import { SalesInvoiceStatus, Prisma } from "@prisma/client";
import { commissionSnapshotForPaid } from "@/lib/services/commission-snapshot";
import { accrueTx as accrueCommissionPayableTx, cancelAccrualTx } from "@/lib/services/commission-payable.service";
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
  if (status !== "paid") {
    // Un-accrue HANYA saat faktur benar-benar TURUN dari paid: recalc atas
    // faktur yang tak pernah paid (posted/partial sejak awal) juga masuk
    // cabang ini, dan cancelAccrualTx atas baris yatim warisan akan melempar
    // "sudah dibayar" berisik padahal tak ada transisi — bedakan dari status
    // SEBELUM update di atas.
    // Akrual yang lahir saat paid wajib dibalik penuh (vonis §6), bukan
    // dibiarkan sebagai utang yatim atas faktur yang tak lagi lunas.
    // Baris sudah dibayar (paidAmount>0) melempar di cancelAccrualTx —
    // tangkap di sini berkonteks: recalc pembayaran tak boleh gagal hanya
    // karena komisi perlu resolusi manual; saldo historis tetap tercatat.
    if (invoice.status === "paid") {
      try {
        await cancelAccrualTx(db, invoiceId, null);
      } catch (e) {
        console.error(
          `[commission] un-accrue faktur #${invoiceId} perlu resolusi manual:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
  }

  if (status === "paid") {
    try {
      // Kirim keadaan SESUDAH update: status baru "paid" + persen snapshot
      // yang baru dibekukan (commissionSnapshot) — BUKAN invoice pre-update
      // (status lama tak pernah paid, snapshot lama null → accrue no-op).
      const freshPercent =
        commissionSnapshot?.commissionRatePercent !== undefined
          ? Number(commissionSnapshot.commissionRatePercent)
          : ((invoice as { commissionRatePercent?: unknown }).commissionRatePercent ?? null)
      await accrueCommissionPayableTx(db, invoiceId, null, {
        status,
        salesEmployeeId: (invoice as { salesEmployeeId?: unknown }).salesEmployeeId,
        commissionRatePercent: freshPercent,
        grandTotal: invoice.grandTotal,
        taxAmount: (invoice as { taxAmount?: unknown }).taxAmount,
        updatedAt: (invoice as { updatedAt?: unknown }).updatedAt,
      });
    } catch (e) {
      // Vonis §5: faktur TETAP paid walau akrual gagal (empat status
      // terpisah) — catch ini SENGAJA tidak re-throw agar pembayaran tak
      // gagal. Jurnal tanpa entri dicegah di sumber: accrueTx memvalidasi
      // preflight penuh (mapping/tipe akun, klaim jurnal existing,
      // assertPeriodOpen) SEBELUM tulis, dan jurnal+entri lahir sebagai
      // SATU create bersarang atomik — gagal = nol jurnal, bukan jurnal
      // kosong yang ikut commit bersama catch ini.
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
