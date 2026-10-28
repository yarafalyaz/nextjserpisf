import { Prisma } from "@prisma/client";
import { activeSalesPaymentWhere } from "@/lib/finance/payment-status"
import { prisma, TxClient } from "@/lib/db/prisma";
import { consumeFifoLayers } from "@/lib/services/inventory-fifo";
import { assertSalesInvoiceStockOutOnce } from "@/lib/services/stock-out-once.service";
import { slugify } from "@/lib/utils/slug";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import { generateDocumentNumber, generateDocumentNumberBatch } from "@/lib/utils/document-number";
import { safeAdd, safeSubtract } from "@/lib/utils/math";
import { snapshotReturnLine, checkCumulativeReturnCap } from "@/lib/tax/return-snapshot";
import { parseL3Tag } from "@/lib/services/late-cost-l3.service";
import { DEFAULT_TRANSACTION_CODE } from "@/lib/tax/tax-invoice";
import { isSettled } from "@/lib/finance/settlement-status";
import { REVERSAL_JOURNAL_REVERSAL_ERROR } from "@/lib/services/journal.service";
import {
  buildDownPaymentReceiptLines,
  buildSettlementReclass,
  computeAllocationNet,
  computeDownPaymentVatSnapshot,
  resolveCompanyPkpGate,
  resolveEffectiveVatRate,
  snapshotFromDownPaymentRow,
} from "@/lib/tax/down-payment-vat";

/**
 * Accounting Hook - Observer pattern replacement for all accounting journal entries.
 * Setiap fungsi membuat journal entry double-entry yang balanced.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Get system settings (account IDs)
// ─────────────────────────────────────────────────────────────────────────────

async function getSystemSettings(tx?: TxClient) {
  const db = tx || prisma;
  const settings = await db.systemSetting.findFirst();
  if (!settings) throw new Error("Pengaturan sistem belum dikonfigurasi.");
  return settings;
}

const executeInTx = async (
  txClient: TxClient | undefined,
  callback: (tx: TxClient) => Promise<unknown>,
) => {
  return txClient ? callback(txClient) : prisma.$transaction(callback);
};

/**
 * UNIQUE (referenceType, referenceId) di MySQL lolos bila referenceType NULL
 * (NULL ≠ NULL) — dua jurnal tanpa klaim bisa duplikat diam-diam. Validasi
 * ini fail-closed SEBELUM klaim: referenceType kosong/null = tolak, bukan
 * tulis. Tanpa ubah UNIQUE lama; semua pemanggil existing kirim string
 * non-empty (dicek via grep), jadi gate ini no-op di jalur normal.
 */
export function assertJournalClaimRef(referenceType: unknown, referenceId: unknown): void {
  if (typeof referenceType !== "string" || referenceType.trim() === "") {
    throw new Error(
      "Klaim jurnal ditolak: referenceType wajib non-empty sebelum klaim (UNIQUE bypass via NULL).",
    );
  }
  if (typeof referenceId !== "number" || !Number.isInteger(referenceId) || referenceId <= 0) {
    throw new Error(
      "Klaim jurnal ditolak: referenceId wajib integer positif sebelum klaim (UNIQUE bypass via NULL).",
    );
  }
}

/**
 * Akun jurnal bare-int tanpa FK fisik (tax/transfer/expense/petty/payment):
 * ID basi (akun dihapus) lolos FK lalu jurnal menunjuk akun hantu. Guard ini
 * fail-closed di action/hook: tiap accountId yang dipakai entri dicek
 * existensinya via prisma.account; hilang satu = tolak sebelum tulis.
 */
export async function assertAccountsExist(
  db: TxClient,
  accountIds: (number | null | undefined)[],
  label: string,
): Promise<void> {
  const ids = [...new Set(accountIds.filter((v): v is number => typeof v === "number" && Number.isInteger(v) && v > 0))];
  if (ids.length === 0) return;
  const found = await db.account.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (found.length !== ids.length) {
    const missing = ids.filter((id) => !found.some((f) => f.id === id));
    throw new Error(`${label}: akun tidak ditemukan (id: ${missing.join(", ")}). Pilih ulang akun sebelum posting.`);
  }
}

async function generateJournalNumber(
  _tx: TxClient,
  prefix: string,
  referenceId: number,
): Promise<string> {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);
  return `${prefix}/${referenceId}/${timestamp}`;
}

/**
 * Delete the journal(s) and their entries linked to a source document.
 * Use when a DRAFT document (vendor bill/payment, down payment, etc.) whose
 * journal was already posted gets deleted/edited, to avoid orphaned GL entries.
 */
export async function deleteJournalByReference(
  referenceType: string,
  referenceId: number,
  txClient?: TxClient,
): Promise<void> {
  await executeInTx(txClient, async (tx) => {
    await deleteJournalByReferenceTx(tx, referenceType, referenceId);
  });
}

/**
 * Same as deleteJournalByReference but runs inside an existing transaction.
 * Use this from delete/cancel actions that already manage their own $transaction
 * to avoid nested transactions. `referenceType` accepts one or many types so a
 * single document (e.g. a posted sales invoice with separate revenue + COGS
 * journals) can have all of its GL entries reversed atomically.
 */
export async function deleteJournalByReferenceTx(
  tx: TxClient,
  referenceType: string | string[],
  referenceId: number | number[],
): Promise<void> {
  const journals = await tx.journal.findMany({
    where: {
      referenceType: Array.isArray(referenceType)
        ? { in: referenceType }
        : referenceType,
      referenceId: Array.isArray(referenceId)
        ? { in: referenceId }
        : referenceId,
    },
    select: { id: true, status: true, transactionDate: true },
  });
  if (journals.length === 0) return;

  // Deleting a POSTED journal mutates the GL exactly like reverseJournal(), so
  // the same period lock must gate it. Without this, a user blocked from
  // reversing a closed-period journal could still erase it (and its reversal)
  // by deleting the source document — a silent, unaudited GL rewrite of a
  // closed period. Draft journals never hit the GL and are skipped.
  for (const j of journals) {
    if (j.status === "POSTED") {
      await assertPeriodOpen(j.transactionDate);
    }
  }

  let journalIds = journals.map((j) => j.id);

  // Cascade to reversal journals (transitively). reverseJournal() creates a
  // companion journal with referenceType "Journal" + referenceId = the original
  // journal id and flips the original to REVERSED. Deleting the original without
  // its reversal would strand a POSTED reversal in the GL (a one-sided balance
  // that can never be cleared). TASK-025 melarang reversal ganda lewat jalur
  // generik, tetapi rantai warisan (J1 <- J2 <- J3) yang sudah telanjur ada
  // tetap harus terhapus tuntas — ikuti rantai sampai titik tetap.
  const seen = new Set(journalIds);
  let frontier = journalIds;
  while (frontier.length > 0) {
    const reversals = await tx.journal.findMany({
      where: { referenceType: "Journal", referenceId: { in: frontier } },
      select: { id: true },
    });
    const next: number[] = [];
    for (const r of reversals) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        next.push(r.id);
      }
    }
    if (next.length === 0) break;
    journalIds = [...journalIds, ...next];
    frontier = next;
  }

  await tx.journalEntry.deleteMany({
    where: { journalId: { in: journalIds } },
  });
  await tx.journal.deleteMany({ where: { id: { in: journalIds } } });
}

/**
 * P1-7: reversal jurnal per dokumen — histori dipertahankan, bukan dihapus.
 * Untuk tiap jurnal POSTED yang merujuk (referenceType, referenceId): buat
 * jurnal lawan (debit↔kredit, tanggal = tanggal asli, referenceType "Journal"
 * → id asli) lalu tandai asli REVERSED. Idempoten: jurnal yang sudah punya
 * reversal (atau sudah REVERSED) dilewati. Jurnal non-POSTED (draft) dihapus
 * — belum menyentuh GL sehingga tak ada histori GL yang hilang; dokumen
 * sumber (faktur/pembayaran) tetap ada sebagai audit trail.
 * Period lock: reversal bertanggal asli → assertPeriodOpen(tanggal asli).
 */
export async function reverseJournalsByReferenceTx(
  tx: TxClient,
  referenceType: string | string[],
  referenceId: number | number[],
  reason: string,
  userId?: number | null,
): Promise<void> {
  // TASK-025: jalur ini generik menurut (referenceType, referenceId); meminta
  // reversal atas "Journal" berarti me-reverse jurnal lawan reversal itu
  // sendiri — tolak di sumber, sama seperti jalur by-id.
  const requestedTypes = Array.isArray(referenceType) ? referenceType : [referenceType];
  if (requestedTypes.includes("Journal")) {
    throw new Error(REVERSAL_JOURNAL_REVERSAL_ERROR);
  }
  const journals = await tx.journal.findMany({
    where: {
      referenceType: Array.isArray(referenceType)
        ? { in: referenceType }
        : referenceType,
      referenceId: Array.isArray(referenceId)
        ? { in: referenceId }
        : referenceId,
    },
    include: { entries: true },
  });
  if (journals.length === 0) return;

  for (const j of journals) {
    // REVERSED sudah punya jurnal lawan POSTED (referenceType "Journal").
    // Lewati tanpa hapus: menghapus asli akan meninggalkan counterpart
    // POSTED yatim sebelah di GL. Cabang ini harus konsisten dengan
    // pemeriksaan existing-reversal di bawah — keduanya berarti
    // "sudah direversal, jangan buat dan jangan hapus apa pun".
    // Pemeriksaan status REVERSED yang lama berada sesudah cabang
    // `!== POSTED` sehingga tak pernah tercapai (dead code) dan
    // REVERSED justru terhapus.
    if (j.status === "REVERSED") continue;
    if (j.status !== "POSTED") {
      // DRAFT (belum GL): hapus aman (dokumen sumber tetap ada).
      await tx.journalEntry.deleteMany({ where: { journalId: j.id } });
      await tx.journal.delete({ where: { id: j.id } });
      continue;
    }
    const existingReversal = await tx.journal.findFirst({
      where: { referenceType: "Journal", referenceId: j.id },
      select: { id: true },
    });
    if (existingReversal) continue;

    // Koreksi periode asal — tolak bila periode sudah dikunci.
    await assertPeriodOpen(j.transactionDate, tx);

    const reversalNumber = await generateJournalNumber(tx, "JRN-RV", j.id);
    const reversal = await tx.journal.create({
      data: {
        journalNumber: reversalNumber,
        transactionDate: j.transactionDate,
        description: `Pembalikan ${j.journalNumber}: ${reason}`,
        type: j.type,
        status: "POSTED",
        referenceType: "Journal",
        referenceId: j.id,
        totalDebit: j.totalDebit,
        totalCredit: j.totalCredit,
        createdBy: userId ?? null,
      },
    });
    await tx.journalEntry.createMany({
      data: j.entries.map((e) => ({
        journalId: reversal.id,
        accountId: e.accountId,
        debit: e.credit,
        credit: e.debit,
        memo: `Pembalikan: ${e.memo ?? ""}`,
        costCenterId: e.costCenterId,
        profitCenterId: e.profitCenterId,
      })),
    });
    await tx.journal.update({ where: { id: j.id }, data: { status: "REVERSED" } });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. onSalesInvoicePosted
//    Dr. Receivable (total_amount)
//    Cr. Revenue (subtotal) + Cr. Tax (tax_amount)
//    Dr. COGS, Cr. Inventory (cost of invoice items)
// ─────────────────────────────────────────────────────────────────────────────

export async function onSalesInvoicePosted(
  invoiceId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  assertJournalClaimRef("SalesInvoice", invoiceId);
  const settings = await getSystemSettings(db);
  // JANGAN diam-diam menyerah di sini. Sebelumnya `return` polos, dan akibatnya
  // terbukti pada basis data nyata: faktur berubah status menjadi POSTED sementara
  // buku besar tidak menerima satu pun entri — tanpa error, tanpa peringatan, dan
  // tidak terlihat dari UI. Posting yang gagal harus berisik.
  if (!settings.salesReceivableAccountId || !settings.salesRevenueAccountId) {
    throw new Error(
      "Akun penjualan belum dipetakan (Piutang / Pendapatan). " +
        "Atur di Pengaturan → Akun sebelum memposting faktur — tanpa itu faktur akan " +
        "berstatus terposting tanpa entri buku sama sekali.",
    );
  }

  const invoice = await db.salesInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { items: true },
  });

  // Idempotency: skip when an ACTIVE journal already exists. A REVERSED journal
  // is history (void/edit), not a block — the edit flow reverses then re-posts.
  const existing = await db.journal.findFirst({
    where: { referenceType: "SalesInvoice", referenceId: invoiceId, status: { not: "REVERSED" } },
  });
  if (existing) {
    console.info(
      `[accounting.hook] faktur #${invoiceId} sudah punya jurnal ${existing.journalNumber ?? existing.id} — posting dilewati`
    );
    return;
  }

  await assertPeriodOpen(invoice.date, txClient);

  await executeInTx(txClient, async (tx) => {
    // Fix: Re-fetch the invoice inside the transaction under a lock to prevent
    // stale data from being used in the journal.
    const inv = await tx.salesInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        totalAmount: true,
        taxAmount: true,
        date: true,
        documentNo: true,
        quotationId: true,
      },
    });
    if (!inv) throw new Error("Invoice tidak ditemukan");

    // F-2026-10-25-004-V J-PL1: reklas PPN uang muka anti-dobel. Sigma
    // snapshot DP confirmed tertaut quotation faktur ini; PPN dokumen
    // lebih kecil dari Sigma = fail-closed (buildSettlementReclass).
    // Tanpa DP bersnapshot (termasuk faktur tanpa quotation) = nol,
    // jurnal existing persis seperti sebelumnya.
    const dpVatRows =
      inv.quotationId != null
        ? await tx.downPayment.findMany({
            where: { quotationId: inv.quotationId, status: "confirmed", vatAmount: { gt: 0 } },
            select: { vatDpp: true, vatAmount: true },
          })
        : [];
    const settlementReclass = buildSettlementReclass({
      documentPpn: Number(inv.taxAmount ?? 0),
      uangMuka: dpVatRows.map((r) => ({
        dppUangMuka: Number(r.vatDpp ?? 0),
        ppnUangMuka: Number(r.vatAmount ?? 0),
      })),
    });
    const sigmaPpnUangMuka = settlementReclass.length
      ? settlementReclass[0].debit
      : 0;
    if (sigmaPpnUangMuka > 0 && !settings.salesTaxAccountId) {
      throw new Error(
        "Akun PPN Keluaran (210201) harus dikonfigurasi untuk reklas PPN uang muka faktur pelunasan",
      );
    }

    // B4 re-audit Accountant PR #785: tutup 210102 di jalur KONVERSI.
    // Invoice yang lahir dari ambang DP (down-payment.hook) menerima
    // SalesPayment bruto per DP TANPA jurnal alokasi; tanpa penutup ini
    // Cr 210102 neto J-DP1 menggantung permanen sesudah posting dan
    // piutang GL tak rekonsiliasi dengan paidAmount bruto. Penutup =
    // J-PL2 tekstual vonis (Dr 210102 neto / Cr Piutang neto,
    // computeAllocationNet dari snapshot beku) untuk pembayaran DP
    // tertaut faktur ini yang BELUM punya jurnal alokasi SalesPayment
    // (jalur existingInv sudah menutup lewat jurnal alokasinya sendiri
    // — dilewati supaya tidak dobel). Masuk jurnal posting yang sama:
    // idempoten inheren dari penjaga jurnal posting di atas.
    const dpLiabilityAccountId = (settings as { customerDownPaymentAccountId?: number | null }).customerDownPaymentAccountId ?? null;
    const conversionClosingLines: { account: "downPaymentLiability" | "receivable"; debit: number; credit: number; memo: string }[] = [];
    {
      const dpPayments = await tx.salesPayment.findMany({
        where: activeSalesPaymentWhere({ salesInvoiceId: invoiceId, paymentMethod: "down_payment" }),
        select: { id: true, amount: true, notes: true },
      });
      const dpDocNos = new Set<string>();
      for (const p of dpPayments) {
        const m = /Uang muka dari DP\s+(\S+)/.exec(p.notes ?? "");
        if (m) dpDocNos.add(m[1]);
      }
      if (dpDocNos.size > 0 && inv.quotationId != null) {
        const allocDps = await tx.downPayment.findMany({
          where: { quotationId: inv.quotationId, documentNo: { in: [...dpDocNos] }, status: "confirmed" },
        });
        const dpByDocNo = new Map(allocDps.map((d) => [d.documentNo, d]));
        for (const p of dpPayments) {
          const m = /Uang muka dari DP\s+(\S+)/.exec(p.notes ?? "");
          const allocDp = m ? dpByDocNo.get(m[1]) : undefined;
          if (!allocDp) continue;
          const allocJournal = await tx.journal.findFirst({
            where: { referenceType: "SalesPayment", referenceId: p.id },
            select: { id: true },
          });
          if (allocJournal) continue;
          const allocSnapshot = snapshotFromDownPaymentRow(allocDp as never);
          if (!allocSnapshot || allocSnapshot.ppnUangMuka <= 0) continue;
          const net = computeAllocationNet({
            allocAmount: Number(p.amount),
            previouslyAllocated: 0,
            snapshot: allocSnapshot,
            dpAmount: Number(allocDp.amount),
          });
          if (net.netAmount <= 0) continue;
          if (!dpLiabilityAccountId) {
            throw new Error(
              "Akun kewajiban Uang Muka Penjualan (210102) harus dikonfigurasi untuk menutup alokasi DP faktur konversi",
            );
          }
          conversionClosingLines.push(
            { account: "downPaymentLiability", debit: net.netAmount, credit: 0, memo: "Penutup kewajiban UMP alokasi DP konversi (J-PL2)" },
            { account: "receivable", debit: 0, credit: net.netAmount, memo: "Penutup piutang alokasi DP konversi (J-PL2)" },
          );
        }
      }
    }
    const conversionClosingTotal = conversionClosingLines.reduce((s, l) => s + l.debit, 0);

    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "SalesInvoice", referenceId: invoiceId, status: { not: "REVERSED" } },
    });
    if (existingInTx) {
      console.info(
        `[accounting.hook] faktur #${invoiceId} sudah punya jurnal ${existingInTx.journalNumber ?? existingInTx.id} — posting di dalam transaksi dilewati`
      );
      return;
    }

    // Idempotensi stok: jurnal bisa absen (mis. terhapus dari DB) sementara
    // gerakan OUT-nya masih POSTED — tanpa penjaga ini posting ulang
    // mengeluarkan stok yang sama dua kali (qtyOnHand dan lapisan FIFO
    // berkurang dobel). Alur edit yang sah membalik gerakan lama menjadi
    // "reversed" lebih dulu (reverseSalesInvoicePostingTx), jadi penjaga
    // status-posted ini tidak menghalanginya.
    const existingOutMove = await tx.stockMove.findFirst({
      where: { referenceType: "SalesInvoice", referenceId: invoiceId, impact: "OUT", status: "posted" },
      select: { id: true },
    });
    if (existingOutMove) {
      console.info(
        `[accounting.hook] faktur #${invoiceId} sudah punya gerakan stok OUT #${existingOutMove.id} — posting dilewati`
      );
      return;
    }

    // SAL-BR-014: guard tepat-satu-kali lintas jalur. Item fisik faktur
    // ini tidak boleh sudah dikeluarkan sebagai material proyek pada
    // pohon quotation yang sama (StockMove OUT MaterialIssue posted).
    // Gerbang ini menempuh serialisasi bersama lebih dulu: kunci baris
    // `quotations` pohon (FOR UPDATE) SEBELUM membaca move lawan, lalu
    // membaca move lawan sebagai locking read (F-2026-10-28-122-S).
    // Fail-closed di service terpusat; konflik = rollback seluruh tx.
    await assertSalesInvoiceStockOutOnce(
      tx,
      invoiceId,
      invoice.items
        .filter((it) => typeof it.itemId === "number" && Number(it.qty) > 0)
        .map((it) => ({ itemId: it.itemId as number, qty: Number(it.qty) })),
    );

    // F-2026-10-24-135-V (vonis BOT Accountant PR #742, syarat 1–4) +
    // F-2026-10-24-136-V Putusan 1: definisi faktur besi tua FINAL —
    // >=1 baris fisik, SEMUA baris item-bearing ter-resolve
    // isScrapSaleItem. Baris bebas/tanpa itemId = bukan besi tua; campuran
    // besi tua + dagang ditolak berisik (3a). Pendapatan wajib akun scrap
    // aktif grup OINC; kosong/non-aktif/salah grup = fail-closed berisik.
    const expectedPhysicalLineCount = invoice.items.filter((it) => Number(it.qty) > 0).length;
    const resolvedLineItemIds = [
      ...new Set(
        invoice.items
          .filter((it) => Number(it.qty) > 0)
          .map((it) => it.itemId)
          .filter((id): id is number => typeof id === "number"),
      ),
    ];
    const resolvedItems = resolvedLineItemIds.length
      ? await tx.item.findMany({
          where: { id: { in: resolvedLineItemIds } },
          select: { id: true, isScrapSaleItem: true, isProduct: true },
        })
      : [];
    const resolvedItemById = new Map(resolvedItems.map((r) => [r.id, r]));
    const isFullyResolvedScrapInvoice =
      expectedPhysicalLineCount > 0 &&
      resolvedLineItemIds.length > 0 &&
      invoice.items.filter((it) => Number(it.qty) > 0).every((it) =>
        typeof it.itemId === "number" && resolvedItemById.has(it.itemId) && !!resolvedItemById.get(it.itemId)?.isScrapSaleItem,
      );
    const physicalLineHasScrapItem = invoice.items.some((it) =>
      Number(it.qty) > 0 && typeof it.itemId === "number" && !!resolvedItemById.get(it.itemId)?.isScrapSaleItem,
    );
    const isScrapSaleInvoice = isFullyResolvedScrapInvoice;
    if (physicalLineHasScrapItem && !isScrapSaleInvoice) {
      throw new Error(
        "Posting faktur ditolak: faktur berisi campuran item besi tua (scrap) dan baris non-besi-tua. " +
          "Pisahkan faktur besi tua dari faktur penjualan biasa — hasil jual scrap dilarang masuk akun Pendapatan Penjualan utama.",
      );
    }
    if (
      isScrapSaleInvoice &&
      invoice.items.some((it) => Number(it.qty) > 0 && typeof it.itemId === "number" && resolvedItemById.get(it.itemId)?.isProduct)
    ) {
      throw new Error(
        "Posting faktur besi tua ditolak: item besi tua tidak boleh isProduct=true (terlarang masuk jalur stok/COGS).",
      );
    }
    if (isScrapSaleInvoice) {
      if (!settings.scrapSaleIncomeAccountId) {
        throw new Error(
          "Akun pendapatan besi tua (scrap) belum dipetakan. " +
            "Atur scrapSaleIncomeAccountId di Pengaturan → Akun sebelum memposting faktur besi tua — " +
            "hasil jual scrap dilarang masuk akun Pendapatan Penjualan utama.",
        );
      }
      const scrapAccount = await tx.account.findFirst({
        where: { id: settings.scrapSaleIncomeAccountId },
        select: { id: true, isActive: true, reportGroup: true },
      });
      if (!scrapAccount || !scrapAccount.isActive || scrapAccount.reportGroup !== "OINC") {
        throw new Error(
          "Akun pendapatan besi tua (scrap) tidak valid: wajib akun aktif grup pendapatan lain-lain (OINC). " +
            "Atur scrapSaleIncomeAccountId di Pengaturan → Akun sebelum memposting faktur besi tua.",
        );
      }
      if (Number(inv.taxAmount ?? 0) > 0 && !settings.salesTaxAccountId) {
        throw new Error(
          "Posting faktur besi tua ditolak: PPN Keluar belum dipetakan padahal faktur memuat PPN. " +
            "Pendapatan besi tua dilarang menyerap PPN.",
        );
      }
    }
    const revenueAccountId = isScrapSaleInvoice
      ? settings.scrapSaleIncomeAccountId!
      : settings.salesRevenueAccountId!;
    const revenueMemo = isScrapSaleInvoice
      ? "Pendapatan Lain-lain Penjualan Besi Tua"
      : "Pendapatan Penjualan";

    const journalNumber = await generateJournalNumber(tx, "INV", invoiceId);

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: inv.date,
        referenceType: "SalesInvoice",
        referenceId: inv.id,
        description: `Invoice Posting ${inv.documentNo}`,
        type: "GENERAL",
        status: "POSTED",
        totalDebit: safeAdd(safeAdd(Number(inv.totalAmount), sigmaPpnUangMuka, 2), conversionClosingTotal, 2),
        totalCredit: safeAdd(safeAdd(Number(inv.totalAmount), sigmaPpnUangMuka, 2), conversionClosingTotal, 2),
        createdBy: userId ?? null,
      },
    });

    const taxAmount = Number(inv.taxAmount ?? 0);
    const hasTaxAccount = taxAmount > 0 && !!settings.salesTaxAccountId;
    // Keep the journal balanced: only split out tax when a tax account exists,
    // otherwise revenue absorbs the full amount (credit total == debit total).
    const revenueCredit = hasTaxAccount
      ? Number(inv.totalAmount) - taxAmount
      : Number(inv.totalAmount);

    // Build the balanced journal lines and insert them in one batch instead of
    // 2-3 sequential journalEntry.create round-trips:
    //   Dr. Piutang Usaha (full invoice total)
    //   Cr. Pendapatan Penjualan (revenue net of tax)
    //   Cr. PPN Keluaran (only when a tax account is configured)
    const invoiceEntries: Prisma.JournalEntryCreateManyInput[] = [
      {
        journalId: journal.id,
        accountId: settings.salesReceivableAccountId!,
        debit: inv.totalAmount,
        credit: 0,
        memo: "Piutang Usaha",
      },
      {
        journalId: journal.id,
        accountId: revenueAccountId,
        debit: 0,
        credit: revenueCredit,
        memo: revenueMemo,
      },
    ];
    if (hasTaxAccount) {
      invoiceEntries.push({
        journalId: journal.id,
        accountId: settings.salesTaxAccountId!,
        debit: 0,
        credit: taxAmount,
        memo: "PPN Keluaran",
      });
    }
    // J-PL1 reklas: Dr 210201 Sigma PPN UM / Cr Piutang Sigma PPN UM —
    // dalam jurnal yang sama, total kedua sisi naik berpasangan.
    if (settlementReclass.length === 2) {
      const accountByKey = {
        salesTax: settings.salesTaxAccountId!,
        receivable: settings.salesReceivableAccountId!,
      } as const;
      for (const line of settlementReclass) {
        invoiceEntries.push({
          journalId: journal.id,
          accountId: accountByKey[line.account as "salesTax" | "receivable"],
          debit: line.debit,
          credit: line.credit,
          memo: line.memo,
        });
      }
    }
    // B4: penutup 210102 jalur konversi (J-PL2) — jurnal yang sama.
    if (conversionClosingLines.length > 0) {
      const closingAccountByKey = {
        downPaymentLiability: dpLiabilityAccountId!,
        receivable: settings.salesReceivableAccountId!,
      } as const;
      for (const line of conversionClosingLines) {
        invoiceEntries.push({
          journalId: journal.id,
          accountId: closingAccountByKey[line.account],
          debit: line.debit,
          credit: line.credit,
          memo: line.memo,
        });
      }
    }
    await tx.journalEntry.createMany({ data: invoiceEntries });

    // Dr. HPP / Cr. Persediaan + physical stock-out for PRODUCT items.
    // Previously the COGS journal was posted but stock (qtyOnHand + FIFO layers)
    // was never reduced, diverging the GL inventory from the stock subledger.
    // Here we also create StockMove OUT and consume FIFO for stockable products.
    const productItems = invoice.items.filter(
      (it): it is typeof it & { itemId: number } =>
        typeof it.itemId === "number" && Number(it.qty) > 0,
    );
    const itemIds = productItems.map((it) => it.itemId);
    const itemRows = itemIds.length
      ? await tx.item.findMany({
          where: { id: { in: itemIds } },
          select: {
            id: true,
            cost: true,
            isProduct: true,
            defaultWarehouseId: true,
            unitOfMeasure: true,
          },
        })
      : [];
    const itemInfo = new Map(itemRows.map((r) => [r.id, r]));

    const enteredUoms = [
      ...new Set(
        productItems
          .map((it) => (it as { uom?: string | null }).uom)
          .filter(Boolean),
      ),
    ] as string[];
    const conversions =
      itemIds.length && enteredUoms.length
        ? await tx.uomConversion.findMany({
            where: { itemId: { in: itemIds }, code: { in: enteredUoms } },
            select: { itemId: true, code: true, factorToBase: true },
          })
        : [];
    const factorMap = new Map(
      conversions.map((c) => [`${c.itemId}:${c.code}`, Number(c.factorToBase)]),
    );

    if (itemIds.length > 0) {
      await tx.$queryRaw`SELECT id FROM items WHERE id IN (${Prisma.join(itemIds)}) FOR UPDATE`;
    }

    // Stock guard: a product sale must not drive warehouse stock negative.
    // Previously the hook used allowShortfall:true unconditionally, so
    // overselling silently pushed qtyOnHand/layers negative and valued the
    // shortfall portion at the master cost snapshot — corrupting both the
    // stock subledger and HPP. We now pre-check per-warehouse availability and
    // abort the whole posting (making the invoice unpostable) when any line
    // exceeds the stock actually present in the item's default warehouse.
    // Services / non-product items are exempt (they never carry stock).
    if (productItems.length > 0) {
      const productItemIds = productItems
        .map((it) => itemInfo.get(it.itemId))
        .filter((info): info is NonNullable<typeof info> => !!info?.isProduct)
        .map((info) => info.id);
      const warehouseIds = [
        ...new Set(
          productItems
            .map((it) => itemInfo.get(it.itemId))
            .filter((info): info is NonNullable<typeof info> => !!info?.isProduct)
            .map((info) => info.defaultWarehouseId)
            .filter((id): id is number => id != null),
        ),
      ];
      if (productItemIds.length > 0) {
        const layerSums = await tx.inventoryLayer.groupBy({
          by: ["itemId", "warehouseId"],
          where: {
            itemId: { in: productItemIds },
            ...(warehouseIds.length ? { warehouseId: { in: warehouseIds } } : {}),
            remaining: { gt: 0 },
          },
          _sum: { remaining: true },
        });
        // Availability per item across ALL warehouses, for items with no default
        // warehouse. This must NOT be restricted to `warehouseIds` — a null-default
        // item consumes across every warehouse (consumeFifoLayers treats a null
        // warehouseId as "any warehouse"), so its stock may live in a warehouse
        // that no sold item lists as its default. Reusing the filtered `layerSums`
        // would under-count and wrongly reject a valid sale.
        const anyWarehouseSums = await tx.inventoryLayer.groupBy({
          by: ["itemId"],
          where: {
            itemId: { in: productItemIds },
            remaining: { gt: 0 },
          },
          _sum: { remaining: true },
        });
        // Available per (item, warehouse) AND per item across ALL warehouses. The
        // latter is what an item with a null defaultWarehouseId consumes against
        // (consumeFifoLayers treats null warehouseId as "any warehouse"), so the
        // guard must not demand availability in a specific warehouse for those.
        const availableMap = new Map<string, number>();
        const availableAnyWarehouse = new Map<number, number>();
        for (const row of layerSums) {
          availableMap.set(`${row.itemId}:${row.warehouseId}`, Number(row._sum.remaining ?? 0));
        }
        for (const row of anyWarehouseSums) {
          availableAnyWarehouse.set(row.itemId, Number(row._sum.remaining ?? 0));
        }
        // Aggregate needed per item+warehouse (converted to base UoM). Items with
        // no default warehouse are aggregated per item (consumed across warehouses).
        const neededMap = new Map<string, number>();
        const neededAnyWarehouse = new Map<number, number>();
        for (const line of productItems) {
          const info = itemInfo.get(line.itemId);
          if (!info?.isProduct) continue;
          const uom = (line as { uom?: string | null }).uom;
          const isBaseUom = !uom || uom === info.unitOfMeasure;
          // Missing/non-positive conversion → 1 with explicit warning (never
          // silent; throwing would break the sales quick-add UoM flow).
          let factor = 1;
          if (!isBaseUom) {
            const fetched = factorMap.get(`${line.itemId}:${uom}`);
            if (fetched == null || !(fetched > 0)) {
              console.warn(
                `[accounting.hook] konversi ${uom} untuk item #${line.itemId} ${fetched == null ? "tidak ditemukan" : `tidak valid (${fetched})`} — kebutuhan stok dihitung 1:1 dalam satuan dasar ${info.unitOfMeasure}. Daftarkan konversi UoM item tersebut.`,
              );
            } else {
              factor = fetched;
            }
          }
          const need = Number(line.qty) * factor;
          if (info.defaultWarehouseId == null) {
            neededAnyWarehouse.set(line.itemId, (neededAnyWarehouse.get(line.itemId) ?? 0) + need);
          } else {
            const key = `${line.itemId}:${info.defaultWarehouseId}`;
            neededMap.set(key, (neededMap.get(key) ?? 0) + need);
          }
        }
        for (const [key, needed] of neededMap) {
          const available = availableMap.get(key) ?? 0;
          if (needed > available + 1e-9) {
            const [itemId, warehouseId] = key.split(":");
            const row = itemInfo.get(Number(itemId));
            throw new Error(
              `Stok tidak mencukupi untuk ${row?.id ?? itemId} di gudang ${warehouseId}: butuh ${needed}, tersedia ${available}. Selesaikan penerimaan/produksi terlebih dahulu.`,
            );
          }
        }
        for (const [itemId, needed] of neededAnyWarehouse) {
          const available = availableAnyWarehouse.get(itemId) ?? 0;
          if (needed > available + 1e-9) {
            const row = itemInfo.get(itemId);
            throw new Error(
              `Stok tidak mencukupi untuk ${row?.id ?? itemId}: butuh ${needed}, tersedia ${available} (seluruh gudang). Selesaikan penerimaan/produksi terlebih dahulu.`,
            );
          }
        }
      }
    }

    // Batch SM generation
    const smProductIdx: number[] = [];
    for (let i = 0; i < productItems.length; i++) {
      const it = productItems[i];
      const info = itemInfo.get(it.itemId);
      if (info?.isProduct) smProductIdx.push(i);
    }
    const smDocNos = smProductIdx.length
      ? await generateDocumentNumberBatch("SM", smProductIdx.length)
      : [];

    let cogsAmount = 0;
    let smCursor = 0;
    for (const line of productItems) {
      const info = itemInfo.get(line.itemId);
      if (!info || !info.isProduct) continue; // services / non-stock items: no stock-out, no COGS
      const smDocNo = smDocNos[smCursor++];
      // Multi-UoM: convert sold qty to base units for stock-out / COGS.
      const uom = (line as { uom?: string | null }).uom;
      const isBaseUom = !uom || uom === info.unitOfMeasure;
      // Missing/non-positive conversion → 1 with explicit warning (never
      // silent; throwing would break the sales quick-add UoM flow).
      let factor = 1;
      if (!isBaseUom) {
        const fetched = factorMap.get(`${line.itemId}:${uom}`);
        if (fetched == null || !(fetched > 0)) {
          console.warn(
            `[accounting.hook] konversi ${uom} untuk item #${line.itemId} ${fetched == null ? "tidak ditemukan" : `tidak valid (${fetched})`} — qty jual dihitung 1:1 dalam satuan dasar ${info.unitOfMeasure}. Daftarkan konversi UoM item tersebut.`,
          );
        } else {
          factor = fetched;
        }
      }
      const qty = Number(line.qty) * factor;
      const fallbackUnitCost =
        factor > 0 ? Number(info.cost ?? 0) / factor : Number(info.cost ?? 0);

      // Decrement on-hand and consume FIFO layers from the item's default
      // warehouse. The guard above already proved per-warehouse availability,
      // so a shortfall here would be a bug — refuse rather than silently value
      // missing units at the master cost.
      await tx.$executeRaw`UPDATE items SET qty_on_hand = qty_on_hand - ${qty} WHERE id = ${line.itemId}`;
      const lineSerials = Array.isArray(
        (line as { serialNumbers?: unknown }).serialNumbers,
      )
        ? (
            (line as { serialNumbers?: unknown[] }).serialNumbers as unknown[]
          ).map((s) => String(s))
        : null;
      const { consumedCost, shortfall } = await consumeFifoLayers(tx, {
        itemId: line.itemId,
        warehouseId: info.defaultWarehouseId,
        qty,
        allowShortfall: false,
        serialNumbers: lineSerials,
        // F-2026-10-21-011: lot kedaluwarsa ditolak + FEFO fisik, sama
        // seperti material issue (F-79). Biaya tetap lapisan FIFO.
        documentDate: invoice.date,
      });
      const lineCogs = consumedCost + shortfall * fallbackUnitCost;
      cogsAmount += lineCogs;
      const moveUnitCost = qty > 0 ? lineCogs / qty : fallbackUnitCost;
      await tx.stockMove.create({
        data: {
          documentNo: smDocNo,
          slug: slugify(smDocNo),
          itemId: line.itemId,
          warehouseId: info.defaultWarehouseId ?? null,
          qty,
          cost: moveUnitCost,
          impact: "OUT",
          status: "posted",
          referenceType: "SalesInvoice",
          referenceId: invoice.id,
          notes: `Penjualan ${invoice.documentNo}`,
          createdBy: userId ?? null,
        },
      });
    }

    if (
      cogsAmount > 0 &&
      settings.cogsAccountId &&
      settings.inventoryAccountId
    ) {
      const cogsJournalNumber = await generateJournalNumber(
        tx,
        "INV-COGS",
        invoiceId,
      );
      const cogsJournal = await tx.journal.create({
        data: {
          journalNumber: cogsJournalNumber,
          transactionDate: invoice.date,
          referenceType: "SalesInvoiceCOGS",
          referenceId: invoice.id,
          description: `COGS Invoice ${invoice.documentNo}`,
          type: "GENERAL",
          status: "POSTED",
          totalDebit: cogsAmount,
          totalCredit: cogsAmount,
          createdBy: userId ?? null,
        },
      });

      // Batch create the two journal entries for the COGS journal (eliminates N+1)
      await tx.journalEntry.createMany({
        data: [
          {
            journalId: cogsJournal.id,
            accountId: settings.cogsAccountId,
            debit: cogsAmount,
            credit: 0,
            memo: "Harga Pokok Penjualan",
          },
          {
            journalId: cogsJournal.id,
            accountId: settings.inventoryAccountId,
            debit: 0,
            credit: cogsAmount,
            memo: "Pengeluaran Persediaan atas Penjualan",
          },
        ],
      });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. onSalesPaymentCreated
//    Dr. Cash/Bank (amount)
//    Cr. Receivable (amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onSalesPaymentCreated(
  paymentId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  assertJournalClaimRef("SalesPayment", paymentId);
  const settings = await getSystemSettings(db);
  if (!settings.salesReceivableAccountId) {
    throw new Error(
      "Akun Piutang Usaha belum dikonfigurasi untuk penerimaan pembayaran penjualan",
    );
  }

  const payment = await db.salesPayment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { salesInvoice: true, withholdingType: true },
  });

  // Idempotency check
  const existing = await db.journal.findFirst({
    where: { referenceType: "SalesPayment", referenceId: paymentId },
  });
  if (existing) {
    console.info(
      `[accounting.hook] pembayaran jual #${paymentId} sudah punya jurnal ${existing.journalNumber ?? existing.id} — posting dilewati`,
    );
    return;
  }

  // PPh yang dipotong pelanggan: kas yang diterima (amount) lebih kecil dari
  // pelunasan piutang (amount + potongan), dan selisihnya menjadi PPh dibayar
  // dimuka. Fail-closed seperti sisi pembelian: jenis PPh tanpa akun piutang pajak
  // akan membuat jurnal tidak seimbang, jadi lebih baik gagal terang-terangan
  // daripada memposting pelunasan yang salah.
  const withholdingAmount = Number(payment.withholdingAmount ?? 0);
  const withholdingAccountId = payment.withholdingType?.receivableAccountId ?? null;
  if (withholdingAmount > 0 && !withholdingAccountId) {
    throw new Error(
      `Potongan PPh ${payment.withholdingType?.code ?? "-"} tidak bisa dijurnal: jenis PPh itu belum punya ` +
        `akun "PPh dibayar dimuka". Lengkapi di Pengaturan → Pajak Potong.`,
    );
  }

  const settledAmount = Number(payment.amount) + withholdingAmount;

  await assertPeriodOpen(payment.paymentDate ?? new Date(), txClient);

  await executeInTx(txClient, async (tx) => {
    // double-check inside tx
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "SalesPayment", referenceId: paymentId },
    });
    if (existingInTx) {
      console.info(
        `[accounting.hook] pembayaran jual #${paymentId} sudah punya jurnal ${existingInTx.journalNumber ?? existingInTx.id} — posting di dalam transaksi dilewati`,
      );
      return;
    }

    const journalNumber = await generateJournalNumber(tx, "PAY", paymentId);

    // Determine cash/bank account from payment method or default
    const cashAccountId = payment.accountId ?? settings.cashBankAccountId;

    if (!cashAccountId) {
      throw new Error(
        "Akun kas/bank belum dikonfigurasi untuk penerimaan pembayaran penjualan",
      );
    }
    await assertAccountsExist(tx, [cashAccountId, withholdingAccountId, settings.salesReceivableAccountId], "Pembayaran penjualan");

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: payment.paymentDate ?? new Date(),
        referenceType: "SalesPayment",
        referenceId: payment.id,
        description:
          `Pembayaran Invoice ${payment.salesInvoice?.documentNo ?? ""}` +
          (withholdingAmount > 0 ? ` (dipotong PPh ${withholdingAmount.toLocaleString("id-ID")})` : ""),
        type: "GENERAL",
        status: "POSTED",
        totalDebit: settledAmount,
        totalCredit: settledAmount,
        createdBy: userId ?? null,
      },
    });

    // Dr. Kas/Bank (kas diterima) [+ Dr. PPh dibayar dimuka] / Cr. Piutang Usaha
    // (nilai pelunasan penuh = kas + potongan).
    await tx.journalEntry.createMany({
      data: [
        {
          journalId: journal.id,
          accountId: cashAccountId,
          debit: payment.amount,
          credit: 0,
          memo: "Penerimaan Kas/Bank",
        },
        ...(withholdingAmount > 0 && withholdingAccountId
          ? [
              {
                journalId: journal.id,
                accountId: withholdingAccountId,
                debit: withholdingAmount,
                credit: 0,
                memo: `PPh dipotong pelanggan${payment.withholdingCertificateNo ? ` (bukti ${payment.withholdingCertificateNo})` : ""}`,
              },
            ]
          : []),
        {
          journalId: journal.id,
          accountId: settings.salesReceivableAccountId!,
          debit: 0,
          credit: settledAmount,
          memo: "Pelunasan Piutang",
        },
      ],
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. onPurchaseOrderReceived
//    Dr. Inventory (subtotal) + Dr. Tax (tax_amount)
//    Cr. Payable (total_amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onPurchaseOrderReceived(
  orderId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  assertJournalClaimRef("PurchaseOrder", orderId);
  const settings = await getSystemSettings(db);
  if (!settings.inventoryAccountId || !settings.purchasePayableAccountId) {
    throw new Error(
      "Akun Persediaan dan Hutang Usaha harus dikonfigurasi sebelum penerimaan pembelian diposting",
    );
  }

  const order = await db.purchaseOrder.findUniqueOrThrow({
    where: { id: orderId },
  });

  // Idempotency check
  const existing = await db.journal.findFirst({
    where: { referenceType: "PurchaseOrder", referenceId: orderId },
  });
  if (existing) {
    console.info(
      `[accounting.hook] pesanan beli #${orderId} sudah punya jurnal ${existing.journalNumber ?? existing.id} — posting dilewati`,
    );
    return;
  }

  await assertPeriodOpen(order.date, txClient);

  await executeInTx(txClient, async (tx) => {
    // double-check inside tx: two concurrent calls both pass the early
    // `findFirst` (returns null) and both open their own $transaction;
    // without this in-tx re-check the second call's `tx.journal.create` trips
    // the @@unique([referenceType, referenceId]) constraint and surfaces as
    // a confusing Prisma P2002 error to the user even though the operation
    // logically succeeded once.
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "PurchaseOrder", referenceId: orderId },
    });
    if (existingInTx) {
      console.info(
        `[accounting.hook] pesanan beli #${orderId} sudah punya jurnal ${existingInTx.journalNumber ?? existingInTx.id} — posting di dalam transaksi dilewati`,
      );
      return;
    }

    const journalNumber = await generateJournalNumber(tx, "PO-RCV", orderId);

    const taxAmount = Number(order.tax ?? 0);
    const hasTaxAccount = taxAmount > 0 && !!settings.purchaseTaxAccountId;
    // Keep balanced: inventory absorbs tax when no input-tax account is set.
    const inventoryDebit = hasTaxAccount
      ? Number(order.totalAmount) - taxAmount
      : Number(order.totalAmount);

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: order.date,
        referenceType: "PurchaseOrder",
        referenceId: order.id,
        description: `Penerimaan PO ${order.documentNo}`,
        type: "GENERAL",
        status: "POSTED",
        totalDebit: order.totalAmount,
        totalCredit: order.totalAmount,
        createdBy: userId ?? null,
      },
    });

    // Dr. Persediaan + Dr. PPN Masukan (only when configured) + Cr. Hutang Usaha
    const purchaseOrderEntries: Prisma.JournalEntryCreateManyInput[] = [
      {
        journalId: journal.id,
        accountId: settings.inventoryAccountId!,
        debit: inventoryDebit,
        credit: 0,
        memo: "Persediaan Masuk",
      },
    ];
    if (hasTaxAccount) {
      purchaseOrderEntries.push({
        journalId: journal.id,
        accountId: settings.purchaseTaxAccountId!,
        debit: taxAmount,
        credit: 0,
        memo: "PPN Masukan",
      });
    }
    purchaseOrderEntries.push({
      journalId: journal.id,
      accountId: settings.purchasePayableAccountId!,
      debit: 0,
      credit: order.totalAmount,
      memo: "Hutang Usaha",
    });
    await tx.journalEntry.createMany({ data: purchaseOrderEntries });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTE: GL for Stock Adjustment, Production-Order material issue/completion,
// and Material Issue is posted by `stockJournalService`
// (src/lib/services/stock-journal.service.ts), invoked from the stock hooks
// (stock-adjustment.hook / material-issue.hook) and the production-order
// actions at the exact point FIFO layers are consumed — so the journal uses the
// REAL consumed cost, not a stored master-cost snapshot.
// Duplicate accounting-hook implementations of those three events were removed
// here: keeping them risked double-posting the same journals. Do NOT re-add
// stock-movement GL in this file; extend stockJournalService instead.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 6. onExpenseApproved
//    Dr. Expense Account (amount)
//    Cr. Paid From Account (amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onExpenseApproved(
  expenseId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  assertJournalClaimRef("Expense", expenseId);
  const expense = await db.expense.findUniqueOrThrow({
    where: { id: expenseId },
  });

  // Fail loudly instead of returning silently. `markExpensePaid` flips the expense
  // to "paid" as soon as this resolves, so a silent return means money leaves the
  // cash/bank account with NO journal at all and no error anywhere — the worst kind
  // of accounting gap (uang keluar tanpa jejak GL). `accountId` is NOT NULL in the
  // schema, so the reachable gap is a missing `paidFromAccountId` (source of funds).
  if (!expense.accountId || !expense.paidFromAccountId) {
    const missing = !expense.accountId ? "akun beban" : "akun sumber dana (kas/bank)"
    throw new Error(
      `Pengeluaran ${expense.documentNo} tidak dapat dijurnal: ${missing} belum diisi. ` +
        `Lengkapi ${missing} lebih dulu, baru tandai pengeluaran sebagai lunas.`,
    )
  }

  // Idempotency check
  const existing = await db.journal.findFirst({
    where: { referenceType: "Expense", referenceId: expenseId },
  });
  if (existing) {
    console.info(
      `[accounting.hook] pengeluaran #${expenseId} sudah punya jurnal ${existing.journalNumber ?? existing.id} — posting dilewati`,
    );
    return;
  }

  await assertPeriodOpen(expense.date ?? new Date(), txClient);

  await executeInTx(txClient, async (tx) => {
    // double-check inside tx: two concurrent calls both pass the early
    // `findFirst` (returns null) and both open their own $transaction;
    // without this in-tx re-check the second call's `tx.journal.create` trips
    // the @@unique([referenceType, referenceId]) constraint and surfaces as
    // a confusing Prisma P2002 error to the user even though the operation
    // logically succeeded once.
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "Expense", referenceId: expenseId },
    });
    if (existingInTx) {
      console.info(
        `[accounting.hook] pengeluaran #${expenseId} sudah punya jurnal ${existingInTx.journalNumber ?? existingInTx.id} — posting di dalam transaksi dilewati`,
      );
      return;
    }

    const journalNumber = await generateJournalNumber(tx, "EXP", expenseId);
    await assertAccountsExist(tx, [expense.accountId, expense.paidFromAccountId], "Pengeluaran");

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: expense.date ?? new Date(),
        referenceType: "Expense",
        referenceId: expense.id,
        description: `Pengeluaran: ${expense.description ?? expense.documentNo}`,
        type: "GENERAL",
        status: "POSTED",
        totalDebit: expense.amount,
        totalCredit: expense.amount,
        createdBy: userId ?? null,
      },
    });

    // Dr. Akun Biaya + Cr. Akun Sumber Dana (batch — eliminates N+1)
    await tx.journalEntry.createMany({
      data: [
        {
          journalId: journal.id,
          accountId: expense.accountId!,
          debit: expense.amount,
          credit: 0,
          // F-133-V Putusan 4(3): memo debit L3 menyebut nomor WO;
          // referenceType tetap Expense (F-127-V).
          memo: (() => {
            const tag = parseL3Tag(expense.description);
            return tag
              ? `Biaya: biaya telat non-job L3 ${tag.workOrderNo} — ${expense.description ?? ""}`
              : `Biaya: ${expense.description ?? ""}`;
          })(),
          costCenterId: expense.costCenterId ?? null,
        },
        {
          journalId: journal.id,
          accountId: expense.paidFromAccountId!,
          debit: 0,
          credit: expense.amount,
          memo: "Pembayaran dari Kas/Bank",
        },
      ],
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 6b. Klaim reimbursement karyawan (F-2026-10-25-017-S + vonis
//     F-2026-10-25-018-V Putusan 2): jurnal DUA tahap khusus klaim
//     tertanda pengaju. Expense operasional NON-klaim TIDAK memakai
//     jalur ini (tetap onExpenseApproved satu tahap saat bayar).
//     J-RB1 akrual saat approve: Dr Beban / Cr Utang Reimbursement
//     Karyawan (setting, kode COA 210209). J-RB2 saat bayar:
//     Dr Utang Reimbursement / Cr Kas-Bank. Pembedah tahap =
//     referenceType terpisah karena @@unique jurnal aktif mengikat
//     (referenceType, referenceId) — satu klaim tepat dua jurnal.
// ─────────────────────────────────────────────────────────────────────────────

export const REIMBURSEMENT_ACCRUAL_REFERENCE_TYPE = "ExpenseReimbursementAccrual"
export const REIMBURSEMENT_PAYMENT_REFERENCE_TYPE = "ExpenseReimbursementPayment"

async function resolveReimbursementLiabilityAccountId(db: TxClient): Promise<number> {
  const settings = await getSystemSettings(db)
  const accountId = settings.reimbursementLiabilityAccountId
  if (!accountId) {
    throw new Error(
      "Klaim reimbursement tidak dapat diproses: akun Utang Reimbursement Karyawan (kode 210209) belum dipetakan di Pengaturan → Mapping Akun. Petakan lebih dulu — approve/bayar klaim ditolak fail-closed (vonis F-2026-10-25-018-V Putusan 3).",
    )
  }
  const account = await db.account.findUnique({
    where: { id: accountId },
    select: { id: true, code: true, isActive: true, deletedAt: true },
  })
  if (!account) {
    throw new Error(
      `Klaim reimbursement tidak dapat diproses: akun liabilitas klaim (id: ${accountId}) tidak ditemukan. Pilih ulang akun 210209 di Mapping Akun.`,
    )
  }
  if (account.deletedAt) {
    throw new Error(
      "Klaim reimbursement tidak dapat diproses: akun Utang Reimbursement Karyawan (kode 210209) sudah terhapus. Petakan akun 210209 aktif di Mapping Akun — approve/bayar klaim ditolak fail-closed (vonis F-2026-10-25-018-V Putusan 3).",
    )
  }
  if (!account.isActive) {
    throw new Error(
      "Klaim reimbursement tidak dapat diproses: akun Utang Reimbursement Karyawan (kode 210209) nonaktif. Aktifkan kembali atau petakan akun 210209 aktif di Mapping Akun — approve/bayar klaim ditolak fail-closed (vonis F-2026-10-25-018-V Putusan 3).",
    )
  }
  if (account.code !== "210209") {
    throw new Error(
      `Klaim reimbursement tidak dapat diproses: akun liabilitas klaim wajib berkode 210209 (Utang Reimbursement Karyawan), terpetakan kode ${account.code}. Dilarang memakai 210204/210101/210205 (vonis F-2026-10-25-018-V Putusan 3).`,
    )
  }
  return account.id
}

async function postReimbursementJournal(
  tx: TxClient,
  input: {
    referenceType: string
    expenseId: number
    debitAccountId: number
    creditAccountId: number
    amount: Prisma.Decimal
    transactionDate: Date
    description: string
    debitMemo: string
    creditMemo: string
    userId?: number
    costCenterId?: number | null
  },
): Promise<void> {
  assertJournalClaimRef(input.referenceType, input.expenseId)
  // Jurnal aktif saja = idempotensi; J-RB reversed/terhapus tidak menghalangi posting ulang.
  const existing = await tx.journal.findFirst({
    where: {
      referenceType: input.referenceType,
      referenceId: input.expenseId,
      status: { not: "REVERSED" },
      deletedAt: null,
    },
  })
  if (existing) {
    console.info(
      `[accounting.hook] klaim #${input.expenseId} tahap ${input.referenceType} sudah punya jurnal ${existing.journalNumber ?? existing.id} — posting dilewati`,
    )
    return
  }
  await assertPeriodOpen(input.transactionDate, tx)
  await assertAccountsExist(tx, [input.debitAccountId, input.creditAccountId], "Klaim reimbursement")
  const journalNumber = await generateJournalNumber(tx, "EXP", input.expenseId)
  const journal = await tx.journal.create({
    data: {
      journalNumber,
      transactionDate: input.transactionDate,
      referenceType: input.referenceType,
      referenceId: input.expenseId,
      description: input.description,
      type: "GENERAL",
      status: "POSTED",
      totalDebit: input.amount,
      totalCredit: input.amount,
      createdBy: input.userId ?? null,
    },
  })
  await tx.journalEntry.createMany({
    data: [
      {
        journalId: journal.id,
        accountId: input.debitAccountId,
        debit: input.amount,
        credit: 0,
        memo: input.debitMemo,
        costCenterId: input.costCenterId ?? null,
      },
      {
        journalId: journal.id,
        accountId: input.creditAccountId,
        debit: 0,
        credit: input.amount,
        memo: input.creditMemo,
      },
    ],
  })
}

/** J-RB1: akrual klaim saat disetujui. Dipanggil dalam tx approve klaim. */
export async function onReimbursementClaimApproved(
  expenseId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma
  const expense = await db.expense.findUniqueOrThrow({ where: { id: expenseId } })
  if (!expense.isReimbursementClaim) {
    throw new Error("Jurnal akrual J-RB1 hanya untuk klaim reimbursement tertanda pengaju.")
  }
  const liabilityAccountId = await resolveReimbursementLiabilityAccountId(db)
  await executeInTx(txClient, async (tx) => {
    await postReimbursementJournal(tx, {
      referenceType: REIMBURSEMENT_ACCRUAL_REFERENCE_TYPE,
      expenseId,
      debitAccountId: expense.accountId,
      creditAccountId: liabilityAccountId,
      amount: expense.amount,
      transactionDate: new Date(),
      description: `Klaim reimbursement disetujui: ${expense.description ?? expense.documentNo}`,
      debitMemo: `Beban klaim: ${expense.description ?? ""}`,
      creditMemo: "Utang Reimbursement Karyawan",
      userId,
      costCenterId: expense.costCenterId,
    })
  })
}

/** J-RB2: bayar klaim. Dipanggil dalam tx markExpensePaid khusus klaim. */
export async function onReimbursementClaimPaid(
  expenseId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma
  const expense = await db.expense.findUniqueOrThrow({ where: { id: expenseId } })
  if (!expense.isReimbursementClaim) {
    throw new Error("Jurnal bayar J-RB2 hanya untuk klaim reimbursement tertanda pengaju.")
  }
  if (!expense.paidFromAccountId) {
    throw new Error(
      `Klaim ${expense.documentNo} tidak dapat dibayar: akun sumber dana (kas/bank) belum diisi.`,
    )
  }
  // Hanya J-RB1 AKTIF (bukan REVERSED, belum terhapus) sah sebagai dasar bayar (Putusan 2).
  const accrued = await db.journal.findFirst({
    where: {
      referenceType: REIMBURSEMENT_ACCRUAL_REFERENCE_TYPE,
      referenceId: expenseId,
      status: { not: "REVERSED" },
      deletedAt: null,
    },
    select: { id: true },
  })
  if (!accrued) {
    throw new Error(
      `Klaim ${expense.documentNo} belum punya jurnal akrual J-RB1 — bayar ditolak. Setujui klaim lebih dulu sampai akrual terposting.`,
    )
  }
  const liabilityAccountId = await resolveReimbursementLiabilityAccountId(db)
  await executeInTx(txClient, async (tx) => {
    await postReimbursementJournal(tx, {
      referenceType: REIMBURSEMENT_PAYMENT_REFERENCE_TYPE,
      expenseId,
      debitAccountId: liabilityAccountId,
      creditAccountId: expense.paidFromAccountId!,
      amount: expense.amount,
      transactionDate: new Date(),
      description: `Klaim reimbursement dibayar: ${expense.description ?? expense.documentNo}`,
      debitMemo: "Pelunasan Utang Reimbursement Karyawan",
      creditMemo: "Pembayaran klaim dari Kas/Bank",
      userId,
    })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. onPettyCashCreated
//    IN:  Dr. PettyCash Account, Cr. Source Account
//    OUT: Dr. Expense Account, Cr. PettyCash Account
// ─────────────────────────────────────────────────────────────────────────────

export async function onPettyCashCreated(
  pettyCashId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  assertJournalClaimRef("PettyCash", pettyCashId);
  const settings = await getSystemSettings(db);
  if (!settings.pettyCashAccountId) {
    throw new Error(
      "Akun Kas Kecil belum dikonfigurasi sebelum transaksi kas kecil diposting",
    );
  }

  const pettyCash = await db.pettyCash.findUniqueOrThrow({
    where: { id: pettyCashId },
  });

  // Idempotency check
  const existing = await db.journal.findFirst({
    where: { referenceType: "PettyCash", referenceId: pettyCashId },
  });
  if (existing) {
    console.info(
      `[accounting.hook] kas kecil #${pettyCashId} sudah punya jurnal ${existing.journalNumber ?? existing.id} — posting dilewati`,
    );
    return;
  }

  // Use the authoritative transaction date. `date` is the user-input transaction
  // date and is always populated; `transactionDate` is an optional legacy field
  // that callers leave null. Previously the code fell back to `new Date()` (today)
  // whenever `transactionDate` was null, which silently bypassed the period lock
  // for back-dated petty-cash entries and posted the journal dated today while
  // the subledger record sat on a closed-period date — corrupting the GL.
  const postingDate = pettyCash.transactionDate ?? pettyCash.date;
  await assertPeriodOpen(postingDate, txClient);

  await executeInTx(txClient, async (tx) => {
    // double-check inside tx: two concurrent calls both pass the early
    // `findFirst` (returns null) and both open their own $transaction;
    // without this in-tx re-check the second call's `tx.journal.create` trips
    // the @@unique([referenceType, referenceId]) constraint and surfaces as
    // a confusing Prisma P2002 error to the user even though the operation
    // logically succeeded once.
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "PettyCash", referenceId: pettyCashId },
    });
    if (existingInTx) {
      console.info(
        `[accounting.hook] kas kecil #${pettyCashId} sudah punya jurnal ${existingInTx.journalNumber ?? existingInTx.id} — posting di dalam transaksi dilewati`,
      );
      return;
    }

    const journalNumber = await generateJournalNumber(tx, "PC", pettyCashId);
    const isInflow = pettyCash.type === "IN";
    await assertAccountsExist(
      tx,
      isInflow
        ? [settings.pettyCashAccountId, pettyCash.sourceAccountId ?? settings.cashBankAccountId]
        : [pettyCash.expenseAccountId ?? settings.generalExpenseAccountId, settings.pettyCashAccountId],
      "Kas kecil",
    );

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: postingDate,
        referenceType: "PettyCash",
        referenceId: pettyCash.id,
        description: isInflow
          ? `Pengisian Kas Kecil ${pettyCash.documentNo}`
          : `Pengeluaran Kas Kecil ${pettyCash.documentNo}`,
        type: "GENERAL",
        status: "POSTED",
        totalDebit: pettyCash.amount,
        totalCredit: pettyCash.amount,
        createdBy: userId ?? null,
      },
    });

    // Build the petty-cash lines based on direction, then insert in a single
    // batch — eliminates 2 sequential tx.journalEntry.create round-trips.
    const pettyCashEntries: Prisma.JournalEntryCreateManyInput[] = [];
    if (isInflow) {
      // IN: Dr. PettyCash, Cr. Source Account
      const sourceAccountId =
        pettyCash.sourceAccountId ?? settings.cashBankAccountId;
      if (!sourceAccountId) {
        throw new Error(
          "Akun sumber dana (sourceAccountId/cashBankAccountId) belum dikonfigurasi untuk pengisian kas kecil",
        );
      }

      pettyCashEntries.push(
        {
          journalId: journal.id,
          accountId: settings.pettyCashAccountId!,
          debit: pettyCash.amount,
          credit: 0,
          memo: "Pengisian Kas Kecil",
        },
        {
          journalId: journal.id,
          accountId: sourceAccountId,
          debit: 0,
          credit: pettyCash.amount,
          memo: "Sumber Dana Kas Kecil",
        },
      );
    } else {
      // OUT: Dr. Expense Account, Cr. PettyCash
      const expenseAccountId =
        pettyCash.expenseAccountId ?? settings.generalExpenseAccountId;
      if (!expenseAccountId) {
        throw new Error(
          "Akun beban (expenseAccountId/generalExpenseAccountId) belum dikonfigurasi untuk pengeluaran kas kecil",
        );
      }

      pettyCashEntries.push(
        {
          journalId: journal.id,
          accountId: expenseAccountId,
          debit: pettyCash.amount,
          credit: 0,
          memo: `Pengeluaran: ${pettyCash.description ?? ""}`,
        },
        {
          journalId: journal.id,
          accountId: settings.pettyCashAccountId!,
          debit: 0,
          credit: pettyCash.amount,
          memo: "Pengeluaran Kas Kecil",
        },
      );
    }
    await tx.journalEntry.createMany({ data: pettyCashEntries });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. onSalesReturnCompleted
//    Dr. Sales Return (amount)
//    Cr. Receivable (amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onSalesReturnCompleted(
  returnId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  assertJournalClaimRef("SalesReturn", returnId);
  const settings = await getSystemSettings(db);
  // Sales-return + inventory mappings are always needed (jalur dagang).
  // The AR mapping is only needed when the return is tied to an invoice
  // (see below) — resolved after we know whether there is a linked invoice.
  if (!settings.salesReturnAccountId || !settings.inventoryAccountId) {
    throw new Error(
      "Akun Retur Penjualan dan Persediaan harus dikonfigurasi sebelum retur diposting",
    );
  }

  const salesReturn = await db.salesReturn.findUniqueOrThrow({
    where: { id: returnId },
    include: { items: true },
  });

  // F-2026-10-24-137-V Putusan 1 (tahap 2): klasifikasi PER-BARIS retur.
  // Baris scrap = itemId ter-resolve isScrapSaleItem=true. Retur scrap
  // murni dibukukan jurnal khusus di bawah (Dr scrapSaleIncomeAccountId +
  // Dr PPN Keluaran snapshot / Cr Piutang|Kas; nol persediaan/COGS).
  // Retur campuran scrap+dagang ditolak berisik: faktur campuran tak
  // pernah terposting (E135-6), jadi baris campuran = data tak konsisten.
  let scrapClass: "none" | "all" | "mixed" = "none";
  if (salesReturn.salesInvoiceId != null && salesReturn.items.length > 0) {
    const returnItemIds = [
      ...new Set(
        salesReturn.items
          .map((it) => it.itemId)
          .filter((id): id is number => typeof id === "number"),
      ),
    ];
    if (returnItemIds.length > 0) {
      const scrapRows = await db.item.findMany({
        where: { id: { in: returnItemIds } },
        select: { id: true, isScrapSaleItem: true },
      });
      const isScrap = new Map(
        (scrapRows as { id: number; isScrapSaleItem: boolean }[]).map((r) => [
          r.id,
          r.isScrapSaleItem,
        ]),
      );
      const activeItems = salesReturn.items.filter((it) => Number(it.qty) > 0);
      const scrapCount = activeItems.filter(
        (it) => typeof it.itemId === "number" && isScrap.get(it.itemId),
      ).length;
      if (scrapCount > 0 && scrapCount === activeItems.length) scrapClass = "all";
      else if (scrapCount > 0) scrapClass = "mixed";
    }
  }
  if (scrapClass === "mixed") {
    throw new Error(
      "Retur penjualan campuran besi tua (scrap) dan dagang ditolak: pisahkan retur besi tua dari retur dagang — " +
        "pendapatan besi tua masuk akun lain-lain dan nilai bukunya Rp0.",
    );
  }
  const isScrapReturn = scrapClass === "all";
  if (isScrapReturn) {
    // Fail-closed akun scrap (pola posting faktur besi tua): kosong /
    // nonaktif / bukan OINC = tolak sebelum jurnal apa pun lahir.
    if (!settings.scrapSaleIncomeAccountId) {
      throw new Error(
        "Akun pendapatan besi tua (scrap) belum dipetakan. " +
          "Atur scrapSaleIncomeAccountId di Pengaturan → Akun sebelum memposting retur besi tua.",
      );
    }
    const scrapAccount = await db.account.findFirst({
      where: { id: settings.scrapSaleIncomeAccountId },
      select: { id: true, isActive: true, reportGroup: true },
    });
    if (!scrapAccount || !scrapAccount.isActive || scrapAccount.reportGroup !== "OINC") {
      throw new Error(
        "Akun pendapatan besi tua (scrap) tidak valid: wajib akun aktif grup pendapatan lain-lain (OINC). " +
          "Atur scrapSaleIncomeAccountId di Pengaturan → Akun sebelum memposting retur besi tua.",
      );
    }
  }

  // A return tied to an invoice relieves the customer's receivable. A return
  // NOT tied to any invoice has no receivable to reduce — booking Cr. Piutang
  // anyway would drive AR negative with no offsetting invoice. For that case we
  // book only the inventory/cost legs (goods physically come back) and skip the
  // price/AR legs entirely.
  const linkedToInvoice = salesReturn.salesInvoiceId != null;
  if (linkedToInvoice && !settings.salesReceivableAccountId) {
    throw new Error(
      "Akun Piutang Usaha belum dikonfigurasi untuk retur penjualan yang terkait faktur",
    );
  }

  // Idempotency check
  const existing = await db.journal.findFirst({
    where: { referenceType: "SalesReturn", referenceId: returnId },
  });
  if (existing) {
    console.info(
      `[accounting.hook] retur jual #${returnId} sudah punya jurnal ${existing.journalNumber ?? existing.id} — posting dilewati`,
    );
    return;
  }

  // Revenue side valued at the selling price (reduces A/R by what was invoiced);
  // goods come back into inventory at cost. The margin nets into the Sales Return
  // contra-revenue account. This single journal owns all GL for a sales return
  // (the stock hook only moves stock now).
  // Retur scrap: cost dipaksa 0 oleh konstruksi (nilai buku Rp0) — angka
  // Item.cost master tidak pernah masuk jurnal scrap (E136-2).
  // F-2026-10-28-137-V V2 (SAL-BR-013 G2): cost baris jasa/non-stok
  // (isProduct=false) = 0 — nol kaki persediaan/COGS; koreksi nilai saja.
  const serviceItemIds =
    salesReturn.items.length > 0
      ? new Set(
          (
            await db.item.findMany({
              where: { id: { in: salesReturn.items.map((it) => it.itemId) } },
              select: { id: true, isProduct: true },
            })
          )
            .filter((r: { id: number; isProduct: boolean }) => r.isProduct === false)
            .map((r: { id: number }) => r.id),
        )
      : new Set<number>();
  const priceTotal = linkedToInvoice
    ? salesReturn.items.reduce(
        (sum, item) => sum + Number(item.qty) * Number(item.price ?? 0),
        0,
      )
    : 0;
  const costTotal = isScrapReturn
    ? 0
    : salesReturn.items.reduce(
        (sum, item) =>
          sum + (serviceItemIds.has(item.itemId) ? 0 : Number(item.qty) * Number(item.cost ?? 0)),
        0,
      );
  if (priceTotal <= 0 && costTotal <= 0) return;

  await assertPeriodOpen(salesReturn.date, txClient);

  await executeInTx(txClient, async (tx) => {
    // F-004: bekukan snapshot pajak retur + guard kumulatif keras DALAM tx.
    // Baris dengan snapshot = potongan SPT dari snapshot (bukan hitung
    // ulang); tanpa faktur asal PPN-retur = 0. Jurnal GL tetap tanpa kaki
    // PPN — lapisan SPT membaca snapshot ini.
    if (linkedToInvoice && salesReturn.salesInvoiceId != null) {
      await tx.$queryRaw`SELECT id FROM sales_invoices WHERE id = ${salesReturn.salesInvoiceId} FOR UPDATE`;
      const invoice = await tx.salesInvoice.findUniqueOrThrow({
        where: { id: salesReturn.salesInvoiceId },
        select: { subtotal: true, discount: true, taxAmount: true },
      });
      const source = {
        subtotal: Number(invoice.subtotal),
        discount: Number(invoice.discount),
        taxAmount: Number(invoice.taxAmount),
      };
      const sourceDpp = source.subtotal - source.discount;
      const candidateLines: { id: number; snap: ReturnType<typeof snapshotReturnLine> }[] = [];
      let candidateDpp = 0;
      let candidateVat = 0;
      for (const item of salesReturn.items) {
        const snap = snapshotReturnLine({
          qty: Number(item.qty),
          price: Number(item.price ?? 0),
          source,
        });
        candidateLines.push({ id: item.id, snap });
        candidateDpp += snap.returnDpp;
        candidateVat += snap.returnVat;
      }
      const completedOthers = await tx.salesReturnItem.findMany({
        where: {
          salesReturn: { salesInvoiceId: salesReturn.salesInvoiceId, status: "completed" },
          returnDpp: { not: null },
          id: { notIn: candidateLines.map((c) => c.id) },
        },
        select: { returnDpp: true, returnVat: true },
      });
      const completedDpp = completedOthers.reduce((s, r) => s + Number(r.returnDpp ?? 0), 0);
      const completedVat = completedOthers.reduce((s, r) => s + Number(r.returnVat ?? 0), 0);
      const cap = checkCumulativeReturnCap({
        sourceDpp,
        sourceVat: source.taxAmount,
        completedDpp,
        completedVat,
        candidateDpp,
        candidateVat,
      });
      if (!cap.allowed) {
        throw new Error(
          `Potongan retur kumulatif (DPP ${cap.projectedDpp} / PPN ${cap.projectedVat}) melebihi faktur asal (DPP ${sourceDpp} / PPN ${source.taxAmount}) — retur ditolak`,
        );
      }
      for (const line of candidateLines) {
        await tx.salesReturnItem.update({
          where: { id: line.id },
          data: {
            returnDpp: new Prisma.Decimal(line.snap.returnDpp.toFixed(2)),
            returnVat: new Prisma.Decimal(line.snap.returnVat.toFixed(2)),
            sourceTaxRate: new Prisma.Decimal(line.snap.sourceTaxRate.toFixed(2)),
          },
        });
      }
      // Tautan TaxInvoice asal bila sudah ada dokumennya (nullable: belum).
      const taxInvoice = await tx.taxInvoice.findFirst({
        where: { direction: "out", salesInvoiceId: salesReturn.salesInvoiceId, djpStatus: { notIn: ["cancelled", "replaced"] } },
        orderBy: { id: "desc" },
        select: { id: true },
      });
      if (taxInvoice && salesReturn.sourceTaxInvoiceId == null) {
        await tx.salesReturn.update({
          where: { id: salesReturn.id },
          data: { sourceTaxInvoiceId: taxInvoice.id },
        });
      }
    }

    // F-137-V tahap 2: jurnal retur besi tua dari snapshot F-004 di atas.
    // Dr scrapSaleIncomeAccountId (DPP retur) + Dr PPN Keluaran (PPN retur,
    // hanya bila > 0) / Cr Piutang bila faktur asal masih punya outstanding
    // (grandTotal − returnCredit POSTED existing − paidAmount), selain itu
    // Cr Kas (sudah dibayar → pengembalian kas). Nol kaki 400003, nol
    // persediaan/COGS. Idempoten per (SalesReturn, jurnal) dipertahankan.
    if (isScrapReturn) {
      const existingInTx = await tx.journal.findFirst({
        where: { referenceType: "SalesReturn", referenceId: returnId },
      });
      if (existingInTx) {
        console.info(
          `[accounting.hook] retur jual #${returnId} sudah punya jurnal ${existingInTx.journalNumber ?? existingInTx.id} — posting di dalam transaksi dilewati`,
        );
        return;
      }
      const dppTotal = safeAdd(
        salesReturn.items.reduce(
          (s, it) =>
            safeAdd(s, Number(it.qty) * Number(it.price ?? 0), 2),
          0,
        ),
        0,
        2,
      );
      const sourceInvoice = await tx.salesInvoice.findUniqueOrThrow({
        where: { id: salesReturn.salesInvoiceId! },
        select: { subtotal: true, discount: true, taxAmount: true },
      });
      const sourceForSnap = {
        subtotal: Number(sourceInvoice.subtotal),
        discount: Number(sourceInvoice.discount),
        taxAmount: Number(sourceInvoice.taxAmount),
      };
      const vatTotal = safeAdd(
        salesReturn.items.reduce((s, it) => {
          const snap = snapshotReturnLine({
            qty: Number(it.qty),
            price: Number(it.price ?? 0),
            source: sourceForSnap,
          });
          return safeAdd(s, snap.returnVat, 2);
        }, 0),
        0,
        2,
      );
      if (vatTotal > 0 && !settings.salesTaxAccountId) {
        throw new Error(
          "Retur besi tua ditolak: PPN Keluaran belum dipetakan padahal retur memuat PPN snapshot. " +
            "Atur salesTaxAccountId di Pengaturan → Akun.",
        );
      }
      const invoiceFull = await tx.salesInvoice.findUniqueOrThrow({
        where: { id: salesReturn.salesInvoiceId! },
        select: { grandTotal: true, paidAmount: true },
      });
      const priorReturns = await tx.salesReturn.findMany({
        where: {
          salesInvoiceId: salesReturn.salesInvoiceId!,
          status: "completed",
          id: { not: returnId },
        },
        select: { id: true },
      });
      let priorReturnCredit = 0;
      if (priorReturns.length > 0 && settings.salesReceivableAccountId) {
        const priorJournals = await tx.journal.findMany({
          where: {
            referenceType: "SalesReturn",
            referenceId: { in: priorReturns.map((r) => r.id) },
            status: "POSTED",
            deletedAt: null,
          },
          select: {
            entries: {
              where: { accountId: settings.salesReceivableAccountId },
              select: { credit: true },
            },
          },
        });
        for (const j of priorJournals) {
          for (const e of j.entries) {
            priorReturnCredit = safeAdd(priorReturnCredit, Number(e.credit), 2);
          }
        }
      }
      const outstanding = safeSubtract(
        safeSubtract(
          Number(invoiceFull.grandTotal),
          priorReturnCredit,
          2,
        ),
        Number(invoiceFull.paidAmount),
        2,
      );
      const creditTotal = safeAdd(dppTotal, vatTotal, 2);
      const useReceivable = outstanding > 0;
      let creditAccountId: number;
      if (useReceivable) {
        if (!settings.salesReceivableAccountId) {
          throw new Error(
            "Akun Piutang Usaha belum dikonfigurasi untuk retur penjualan yang terkait faktur",
          );
        }
        creditAccountId = settings.salesReceivableAccountId;
      } else {
        if (!settings.cashBankAccountId) {
          throw new Error(
            "Akun kas/bank belum dikonfigurasi untuk pengembalian kas retur besi tua (faktur asal sudah dibayar).",
          );
        }
        creditAccountId = settings.cashBankAccountId;
      }
      const journalNumber = await generateJournalNumber(tx, "SR", returnId);
      const journal = await tx.journal.create({
        data: {
          journalNumber,
          transactionDate: salesReturn.date,
          referenceType: "SalesReturn",
          referenceId: salesReturn.id,
          description: `Retur Penjualan Besi Tua ${salesReturn.documentNo}`,
          type: "GENERAL",
          status: "POSTED",
          totalDebit: creditTotal,
          totalCredit: creditTotal,
          createdBy: userId ?? null,
        },
      });
      const scrapEntryRows: {
        journalId: number;
        accountId: number;
        debit: number;
        credit: number;
        memo: string;
      }[] = [
        {
          journalId: journal.id,
          accountId: settings.scrapSaleIncomeAccountId!,
          debit: dppTotal,
          credit: 0,
          memo: "Pengurang Pendapatan Lain-lain Besi Tua (Retur)",
        },
      ];
      if (vatTotal > 0) {
        scrapEntryRows.push({
          journalId: journal.id,
          accountId: settings.salesTaxAccountId!,
          debit: vatTotal,
          credit: 0,
          memo: "PPN Keluaran (Retur Besi Tua)",
        });
      }
      scrapEntryRows.push({
        journalId: journal.id,
        accountId: creditAccountId,
        debit: 0,
        credit: creditTotal,
        memo: useReceivable
          ? "Pengurangan Piutang (Retur Besi Tua)"
          : "Pengembalian Kas (Retur Besi Tua)",
      });
      await tx.journalEntry.createMany({ data: scrapEntryRows });
      return;
    }

    // double-check inside tx
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "SalesReturn", referenceId: returnId },
    });
    if (existingInTx) {
      console.info(
        `[accounting.hook] retur jual #${returnId} sudah punya jurnal ${existingInTx.journalNumber ?? existingInTx.id} — posting di dalam transaksi dilewati`,
      );
      return;
    }

    const journalNumber = await generateJournalNumber(tx, "SR", returnId);

    const totalAmount = priceTotal + costTotal;

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: salesReturn.date,
        referenceType: "SalesReturn",
        referenceId: salesReturn.id,
        description: `Retur Penjualan ${salesReturn.documentNo}`,
        type: "GENERAL",
        status: "POSTED",
        totalDebit: totalAmount,
        totalCredit: totalAmount,
        createdBy: userId ?? null,
      },
    });

    // Dr. Retur Penjualan (harga jual) + Cr. Piutang (harga jual) +
    // Dr. Persediaan (cost) + Cr. Retur Penjualan (cost) — batch eliminates 4
    // sequential tx.journalEntry.create round-trips. The price/AR legs are only
    // included when the return is tied to an invoice (see `linkedToInvoice`).
    const entryRows: {
      journalId: number;
      accountId: number;
      debit: number;
      credit: number;
      memo: string;
    }[] = [];
    if (linkedToInvoice && priceTotal > 0) {
      entryRows.push(
        {
          journalId: journal.id,
          accountId: settings.salesReturnAccountId!,
          debit: priceTotal,
          credit: 0,
          memo: "Retur Penjualan",
        },
        {
          journalId: journal.id,
          accountId: settings.salesReceivableAccountId!,
          debit: 0,
          credit: priceTotal,
          memo: "Pengurangan Piutang (Retur)",
        },
      );
    }
    if (costTotal > 0) {
      entryRows.push(
        {
          journalId: journal.id,
          accountId: settings.inventoryAccountId!,
          debit: costTotal,
          credit: 0,
          memo: "Persediaan Masuk (Retur)",
        },
        {
          journalId: journal.id,
          accountId: settings.salesReturnAccountId!,
          debit: 0,
          credit: costTotal,
          memo: "HPP Retur Masuk Kembali",
        },
      );
    }
    await tx.journalEntry.createMany({ data: entryRows });

    // TASK-011 BUG-04: jurnal di atas mengkredit Piutang (GL), jadi subledger
    // faktur WAJIB turun dalam transaksi yang sama — pola recalc kanonis
    // pembayaran (sales-payment.hook): outstanding = grandTotal - paidAmount,
    // status diturunkan dari paidAmount vs grandTotal. Retur mengurangi
    // grandTotal sebesar porsi yang masih terutang; kelebihan di atas sisa
    // (faktur sudah lunas / terbayar lebih) menjadi CustomerCredit terstruktur
    // (pola DownPayment/RevisionDown), bukan outstanding negatif.
    if (
      linkedToInvoice &&
      priceTotal > 0 &&
      salesReturn.salesInvoiceId != null &&
      typeof tx.salesInvoice?.update === "function"
    ) {
      const inv = await tx.salesInvoice.findUniqueOrThrow({
        where: { id: salesReturn.salesInvoiceId },
        select: {
          grandTotal: true,
          paidAmount: true,
          customerId: true,
          documentNo: true,
        },
      });
      const grandSen = Math.round(Number(inv.grandTotal) * 100);
      const paidSen = Math.round(Number(inv.paidAmount) * 100);
      if (Number.isFinite(grandSen) && Number.isFinite(paidSen)) {
        const returnSen = Math.round(priceTotal * 100);
        const reliefSen = Math.min(returnSen, Math.max(grandSen - paidSen, 0));
        const excessSen = returnSen - reliefSen;
        const newGrandSen = grandSen - reliefSen;
        // FIN-BR-006: lunas dari outstanding valid dalam toleransi Rp1.
        const invStatus: "posted" | "partial" | "paid" =
          isSettled(newGrandSen / 100, paidSen / 100) ? "paid" : paidSen > 0 ? "partial" : "posted";
        await tx.salesInvoice.update({
          where: { id: salesReturn.salesInvoiceId },
          data: {
            grandTotal: newGrandSen / 100,
            totalAmount: newGrandSen / 100,
            paidAmount: paidSen / 100,
            status: invStatus,
            paymentStatus: invStatus,
          },
        });
        if (
          excessSen > 0 &&
          typeof tx.customerCredit?.findFirst === "function" &&
          typeof tx.customerCredit?.create === "function"
        ) {
          const existingCredit = await tx.customerCredit.findFirst({
            where: { sourceType: "SalesReturn", sourceId: returnId },
          });
          if (!existingCredit) {
            const creditDocNo =
              typeof generateDocumentNumber === "function"
                ? await generateDocumentNumber("CC")
                : `CC-RET-${returnId}`;
            await tx.customerCredit.create({
              data: {
                documentNo: creditDocNo,
                customerId: inv.customerId,
                sourceType: "SalesReturn",
                sourceId: returnId,
                receivedAmount: excessSen / 100,
                notes: `Kelebihan retur penjualan ${salesReturn.documentNo} atas faktur ${inv.documentNo ?? salesReturn.salesInvoiceId} yang sudah lunas. Bisa dipakai ulang / di-refund.`,
                createdBy: userId ?? null,
              },
            });
          }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. onPurchaseReturnProcessed
//    Dr. Payable (amount)
//    Cr. Inventory (amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onPurchaseReturnProcessed(
  returnId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  assertJournalClaimRef("PurchaseReturn", returnId);
  const settings = await getSystemSettings(db);
  if (!settings.purchasePayableAccountId || !settings.inventoryAccountId) {
    throw new Error(
      "Akun Hutang Usaha dan Persediaan harus dikonfigurasi sebelum retur pembelian diposting",
    );
  }

  const purchaseReturn = await db.purchaseReturn.findUniqueOrThrow({
    where: { id: returnId },
    include: { items: true },
  });

  // Idempotency check
  const existing = await db.journal.findFirst({
    where: { referenceType: "PurchaseReturn", referenceId: returnId },
  });
  if (existing) {
    console.info(
      `[accounting.hook] retur beli #${returnId} sudah punya jurnal ${existing.journalNumber ?? existing.id} — posting dilewati`,
    );
    return;
  }

  // AP relief = harga retur BEKU per baris (`price`, harga beli dari tagihan
  // asal saat retur dibuat) — what the vendor credits back. `cost` adalah cost
  // master yang bergerak, jadi memakainya melegakan hutang sebesar harga kini,
  // bukan harga kesepakatan asal. Baris legacy tanpa `price` (null) jatuh ke
  // `cost` karena tidak ada harga beku yang bisa dipakai.
  const totalAmount = purchaseReturn.items.reduce(
    (sum, item) => sum + Number(item.qty) * Number(item.price ?? item.cost),
    0,
  );
  if (totalAmount <= 0) return;

  // Inventory relief = ACTUAL FIFO carrying cost that left stock, read back from
  // the OUT stock moves the stock hook (purchase-return.hook) created. This is
  // what was really removed from inventory; it can differ from the agreed return
  // price when purchase prices drifted since the goods were received.
  const outMoves = await db.stockMove.findMany({
    where: {
      referenceType: "PurchaseReturn",
      referenceId: returnId,
      impact: "OUT",
    },
    select: { qty: true, cost: true },
  });
  const inventoryAmount = outMoves.reduce(
    (sum, m) => sum + Number(m.qty) * Number(m.cost),
    0,
  );

  await assertPeriodOpen(purchaseReturn.date, txClient);

  await executeInTx(txClient, async (tx) => {
    // double check
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "PurchaseReturn", referenceId: returnId },
    });
    if (existingInTx) {
      console.info(
        `[accounting.hook] retur beli #${returnId} sudah punya jurnal ${existingInTx.journalNumber ?? existingInTx.id} — posting di dalam transaksi dilewati`,
      );
      return;
    }

    const journalNumber = await generateJournalNumber(tx, "PR", returnId);

    // Build double-entry:
    //   Dr Hutang Usaha     = return price (AP reduced by what the vendor credits)
    //   Cr Persediaan       = FIFO carrying cost actually relieved from stock
    //   Dr/Cr Selisih Retur = price variance (return price vs carrying cost)
    // When no variance account is configured or the carrying cost is unavailable,
    // fall back to crediting Inventory at the return price (old behavior) so the
    // journal stays balanced.
    const varianceAccount = settings.purchaseReturnAccountId ?? null;
    const useVariance =
      varianceAccount != null &&
      inventoryAmount > 0 &&
      Math.abs(totalAmount - inventoryAmount) > 0.001;

    const inventoryCredit = useVariance ? inventoryAmount : totalAmount;
    const variance = totalAmount - inventoryAmount; // >0: gain (Cr), <0: loss (Dr)

    const entries: {
      accountId: number;
      debit: number;
      credit: number;
      memo: string;
    }[] = [
      {
        accountId: settings.purchasePayableAccountId!,
        debit: totalAmount,
        credit: 0,
        memo: "Pengurangan Hutang (Retur)",
      },
      {
        accountId: settings.inventoryAccountId!,
        debit: 0,
        credit: inventoryCredit,
        memo: "Pengembalian Persediaan (biaya FIFO)",
      },
    ];

    if (useVariance) {
      if (variance > 0) {
        // Return price > carrying cost → credit the variance (gain on return).
        entries.push({
          accountId: varianceAccount!,
          debit: 0,
          credit: variance,
          memo: "Selisih harga retur pembelian",
        });
      } else {
        // Return price < carrying cost → debit the variance (loss on return).
        entries.push({
          accountId: varianceAccount!,
          debit: -variance,
          credit: 0,
          memo: "Selisih harga retur pembelian",
        });
      }
    }

    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

    // Balance guard: this hook writes journalEntry rows directly, bypassing
    // JournalService.createJournal's validation. The variance branches above
    // are provably balanced, but guard explicitly so a future edit can never
    // silently persist an unbalanced purchase-return journal.
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new Error(
        `Jurnal retur pembelian tidak balance. Debit: ${totalDebit.toFixed(2)}, Kredit: ${totalCredit.toFixed(2)}.`,
      );
    }

    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: purchaseReturn.date,
        referenceType: "PurchaseReturn",
        referenceId: purchaseReturn.id,
        description: `Retur Pembelian ${purchaseReturn.documentNo}`,
        type: "GENERAL",
        status: "POSTED",
        totalDebit,
        totalCredit,
        createdBy: userId ?? null,
      },
    });

    if (entries.length > 0) {
      await tx.journalEntry.createMany({
        data: entries.map((e) => ({
          journalId: journal.id,
          accountId: e.accountId,
          debit: e.debit,
          credit: e.credit,
          memo: e.memo,
        })),
      });
    }

    // TASK-011 BUG-04: jurnal di atas mendebit Hutang Usaha (GL), jadi
    // subledger tagihan WAJIB turun dalam transaksi yang sama — pola recalc
    // kanonis pembayaran vendor (confirmVendorPayment): sisa neto =
    // (grandTotal - withholding) - paidAmount, status dari sisa. Tagihan asal
    // dipilih seperti snapshot pajak retur (terbaru non-batal per PO).
    // balanceDue yang turun membuat confirmVendorPayment menolak pembayaran
    // melebihi sisa neto retur (alokasi dibatasi balanceDue + guard total).
    if (
      typeof tx.vendorBill?.findFirst === "function" &&
      typeof tx.vendorBill?.update === "function"
    ) {
      const bill = await tx.vendorBill.findFirst({
        where: {
          purchaseOrderId: purchaseReturn.purchaseOrderId,
          status: { in: ["posted", "partial", "paid"] },
        },
        orderBy: { id: "desc" },
        select: {
          id: true,
          grandTotal: true,
          paidAmount: true,
          withholdingAmount: true,
          balanceDue: true,
        },
      });
      if (bill) {
        const grandSen = Math.round(Number(bill.grandTotal) * 100);
        const paidSen = Math.round(Number(bill.paidAmount) * 100);
        const withholdingSen = Math.round(Number(bill.withholdingAmount ?? 0) * 100);
        const balanceSen = Math.round(Number(bill.balanceDue) * 100);
        if (
          Number.isFinite(grandSen) &&
          Number.isFinite(paidSen) &&
          Number.isFinite(balanceSen)
        ) {
          const reliefSen = Math.min(Math.round(totalAmount * 100), Math.max(balanceSen, 0));
          if (reliefSen > 0) {
            const newGrandSen = grandSen - reliefSen;
            const newBalanceSen = Math.max(newGrandSen - withholdingSen - paidSen, 0);
            // FIN-BR-006: lunas dari outstanding NETO valid dalam toleransi
            // Rp1 (100 sen) — konsisten dengan confirmVendorPayment.
            const billStatus: "posted" | "partial" | "paid" =
              isSettled((newGrandSen - withholdingSen) / 100, paidSen / 100) ? "paid" : paidSen > 0 ? "partial" : "posted";
            await tx.vendorBill.update({
              where: { id: bill.id },
              data: {
                grandTotal: newGrandSen / 100,
                balanceDue: newBalanceSen / 100,
                status: billStatus,
              },
            });
          }
        }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. onDownPaymentReceived
//     Dr. Bank/Cash (amount)
//     Cr. Uang Muka Penjualan / Unearned Revenue (amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onDownPaymentReceived(
  dpId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  assertJournalClaimRef("DownPayment", dpId);
  const settings = await getSystemSettings(db);
  // AUD-FIN-01 (putusan akuntan): DP yang belum jadi pendapatan = KEWAJIBAN
  // (CoA 210102 Uang Muka Penjualan), BUKAN Piutang 1103. Kredit ke Piutang
  // mengecilkan AR palsu + menyembunyikan kewajiban. Null = instalasi lama
  // belum mapping → TOLAK posting (fail-closed), jangan salah catat diam-diam.
  const dpLiabilityAccountId = (settings as { customerDownPaymentAccountId?: number | null }).customerDownPaymentAccountId ?? null;
  if (!settings.cashBankAccountId || !dpLiabilityAccountId) {
    throw new Error(
      "Akun kas/bank dan akun kewajiban Uang Muka Penjualan (210102) harus dikonfigurasi sebelum uang muka diterima",
    );
  }

  const dp = await db.downPayment.findUniqueOrThrow({
    where: { id: dpId },
    include: { quotation: { select: { tax: true } } },
  });

  const existing = await db.journal.findFirst({
    where: { referenceType: "DownPayment", referenceId: dpId },
  });
  if (existing) {
    console.info(
      `[accounting.hook] uang muka #${dpId} sudah punya jurnal ${existing.journalNumber ?? existing.id} — posting dilewati`,
    );
    return;
  }

  await assertPeriodOpen(dp.paymentDate || new Date(), txClient);

  await executeInTx(txClient, async (tx) => {
    // double-check inside tx: two concurrent calls both pass the early
    // `findFirst` (returns null) and both open their own $transaction;
    // without this in-tx re-check the second call's `tx.journal.create` trips
    // the @@unique([referenceType, referenceId]) constraint and surfaces as
    // a confusing Prisma P2002 error to the user even though the operation
    // logically succeeded once.
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "DownPayment", referenceId: dpId },
    });
    if (existingInTx) {
      console.info(
        `[accounting.hook] uang muka #${dpId} sudah punya jurnal ${existingInTx.journalNumber ?? existingInTx.id} — posting di dalam transaksi dilewati`,
      );
      return;
    }

    const journalNumber = await generateJournalNumber(tx, "DP", dpId);

    // F-2026-10-25-004-V (vonis PR #760) + B1 re-audit Accountant PR #785:
    // bekukan snapshot PPN uang muka SEKALI saat jurnal terima lahir. DP
    // yang sudah terjurnal (replay / legacy pra-fitur) tidak dibekukan
    // belakangan — return awal di atas sudah menangani replay. Tarif
    // WAJIB dari master Tax efektif pada paymentDate (kandidat dibatasi
    // accountId = akun PPN Keluaran setting; nol/ambigu = fail-closed
    // resolveEffectiveVatRate) lalu dibekukan ke kolom DP — edit master
    // sesudah confirm tidak mengubah snapshot. Kode transaksi: master
    // Tax tidak menyimpan kode transaksi DJP, jadi tetap
    // DEFAULT_TRANSACTION_CODE repo ("04") dan dibekukan apa adanya.
    let snapshot = snapshotFromDownPaymentRow(dp as never);
    if (!snapshot) {
      const quotationTax = Number((dp as { quotation?: { tax?: unknown } }).quotation?.tax ?? 0);
      const paymentDate = dp.paymentDate || new Date();
      // F-2026-10-25-015-V Putusan 2-3: gerbang PKP perusahaan menilai
      // terutang SEBELUM tarif dicari — unknown ber-PPN dan pkp tanpa
      // tanggal mulai kewajiban fail-closed di sini (dalam tx, sesudah
      // assertPeriodOpen); non-PKP/belum efektif sah J-DP2 bruto.
      // Status + tanggal yang dipakai dibekukan ke baris DP bersama
      // snapshot vat* (edit master sesudahnya nol efek retroaktif).
      // Gerbang TIDAK membaca status PKP lawan / transactionCode.
      const pkpGate = resolveCompanyPkpGate({ setting: settings, quotationTax, paymentDate });
      let nominalRate = 0;
      if (pkpGate.taxableByPkp) {
        if (!settings.salesTaxAccountId) {
          throw new Error(
            "Akun PPN Keluaran (210201) harus dikonfigurasi sebelum uang muka terutang PPN diterima",
          );
        }
        const taxRows = await tx.tax.findMany({
          where: { accountId: settings.salesTaxAccountId, isActive: true, deletedAt: null },
          select: { rate: true, effectiveFrom: true, effectiveTo: true, isActive: true, deletedAt: true },
        });
        nominalRate = resolveEffectiveVatRate(
          taxRows.map((r) => ({ ...r, rate: Number(r.rate) })),
          dp.paymentDate || new Date(),
        );
      }
      snapshot = computeDownPaymentVatSnapshot({
        amount: Number(dp.amount),
        // Gerbang PKP sudah menilai terutang: non-PKP/belum efektif
        // dipaksa snapshot bruto (quotationTax 0) walau quotation
        // memuat PPN — FP UM tidak lahir untuk masa non-PKP.
        quotationTax: pkpGate.taxableByPkp ? quotationTax : 0,
        paymentDate,
        transactionCode: DEFAULT_TRANSACTION_CODE,
        nominalRate,
      });
      await tx.downPayment.update({
        where: { id: dpId },
        data: {
          vatTransactionCode: snapshot.transactionCode,
          vatRate: snapshot.nominalRate,
          vatDpp: snapshot.dppUangMuka,
          vatAmount: snapshot.ppnUangMuka,
          vatTaxPeriod: snapshot.taxPeriod,
          companyPkpStatusSnapshot: pkpGate.pkpStatus,
          companyPkpEffectiveFromSnapshot: pkpGate.pkpEffectiveFrom,
        },
      });
    }
    if (snapshot.ppnUangMuka > 0 && !settings.salesTaxAccountId) {
      throw new Error(
        "Akun PPN Keluaran (210201) harus dikonfigurasi sebelum uang muka terutang PPN diterima",
      );
    }
    const accountByKey = {
      cashBank: settings.cashBankAccountId!,
      downPaymentLiability: dpLiabilityAccountId!,
      salesTax: settings.salesTaxAccountId ?? 0,
      receivable: settings.salesReceivableAccountId ?? 0,
    } as const;

    await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: dp.paymentDate || new Date(),
        referenceType: "DownPayment",
        referenceId: dp.id,
        description: `Down Payment ${dp.documentNo || dpId}`,
        type: "AUTO",
        status: "POSTED",
        totalDebit: dp.amount,
        totalCredit: dp.amount,
        createdBy: userId,
        entries: {
          create: buildDownPaymentReceiptLines({ amount: Number(dp.amount), snapshot }).map((line) => ({
            accountId: accountByKey[line.account],
            debit: line.debit,
            credit: line.credit,
            memo: line.memo,
          })),
        },
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. onVendorBillPosted
//     Dr. Expense/Inventory (amount)
//     Cr. Accounts Payable (amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onVendorBillPosted(
  billId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  assertJournalClaimRef("VendorBill", billId);
  const settings = await getSystemSettings(db);
  if (!settings.purchasePayableAccountId) {
    throw new Error(
      "Akun Hutang Usaha belum dikonfigurasi untuk tagihan vendor",
    );
  }

  const bill = await db.vendorBill.findUniqueOrThrow({
    where: { id: billId },
  });

  const existing = await db.journal.findFirst({
    where: { referenceType: "VendorBill", referenceId: billId },
  });
  if (existing) {
    console.info(
      `[accounting.hook] tagihan vendor #${billId} sudah punya jurnal ${existing.journalNumber ?? existing.id} — posting dilewati`,
    );
    return;
  }

  await assertPeriodOpen(bill.date, txClient);

  // A bill linked to a PO that already had goods received is "goods-based": the
  // goods already hit Inventory at GR (Dr Inventory / Cr clearing). The bill must
  // therefore DEBIT the clearing account (purchaseInventory) to clear it — not an
  // expense account — otherwise the same goods are counted twice (Inventory + Expense)
  // and the clearing account is never relieved. Service/expense bills (no GR) keep
  // debiting the expense account.
  const grandTotal = Number(bill.grandTotal);
  const hasGoodsReceipt =
    bill.purchaseOrderId != null &&
    (await db.goodsReceipt.count({
      where: { purchaseOrderId: bill.purchaseOrderId },
    })) > 0;
  if (hasGoodsReceipt && !settings.purchaseInventoryAccountId) {
    throw new Error(
      "Akun clearing penerimaan barang belum dikonfigurasi untuk tagihan vendor berbasis penerimaan barang",
    );
  }
  const goodsBased = hasGoodsReceipt;

  const debitEntries: {
    accountId: number;
    debit: number;
    credit: number;
    memo: string;
  }[] = [];
  if (goodsBased) {
    const taxAmount = settings.purchaseTaxAccountId ? Number(bill.tax ?? 0) : 0;
    // A bill's grand total must cover its tax; if not (data-entry error / legacy
    // bad row) the clearing leg would go negative and book a negative asset line
    // while the payable stays at grandTotal. Fail closed instead.
    if (taxAmount > grandTotal) {
      throw new Error(
        `Pajak tagihan (${taxAmount}) melebihi total keseluruhan (${grandTotal}) — periksa data tagihan vendor`,
      );
    }
    const clearingAmount = grandTotal - taxAmount;
    debitEntries.push({
      accountId: settings.purchaseInventoryAccountId!,
      debit: clearingAmount,
      credit: 0,
      memo: "Clearing penerimaan barang",
    });
    if (taxAmount > 0) {
      debitEntries.push({
        accountId: settings.purchaseTaxAccountId!,
        debit: taxAmount,
        credit: 0,
        memo: "PPN Masukan",
      });
    }
  } else {
    // Service/expense bill (no goods receipt): debit the expense account. Fail
    // closed when it is unconfigured rather than falling back to the payable
    // account — that fallback produced a net-zero Dr AP / Cr AP entry that
    // looked "posted" but never actually recognised the liability in the GL.
    // Mirrors the fail-closed convention used by onPettyCashCreated/onExpenseApproved.
    if (!settings.purchaseExpenseAccountId) {
      throw new Error(
        "Akun beban pembelian (purchaseExpenseAccountId) belum dikonfigurasi untuk tagihan jasa/biaya",
      );
    }
    debitEntries.push({
      accountId: settings.purchaseExpenseAccountId,
      debit: grandTotal,
      credit: 0,
      memo: "Purchase expense",
    });
  }

  await executeInTx(txClient, async (tx) => {
    // double check
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "VendorBill", referenceId: billId },
    });
    if (existingInTx) {
      console.info(
        `[accounting.hook] tagihan vendor #${billId} sudah punya jurnal ${existingInTx.journalNumber ?? existingInTx.id} — posting di dalam transaksi dilewati`,
      );
      return;
    }

    // Fix: Re-fetch the bill inside the transaction under a lock to prevent
    // stale data from being used in the journal.
    const b = await tx.vendorBill.findUnique({
      where: { id: billId },
      select: {
        id: true,
        grandTotal: true,
        tax: true,
        date: true,
        documentNo: true,
        notes: true,
        withholdingAmount: true,
        withholdingType: { select: { name: true, liabilityAccountId: true } },
      },
    });
    if (!b) throw new Error("Bill tidak ditemukan");

    const latestGrandTotal = Number(b.grandTotal);
    const latestTaxAmount = settings.purchaseTaxAccountId
      ? Number(b.tax ?? 0)
      : 0;

    // PPh potong-putut: only the net amount is owed to the vendor; the withheld
    // part becomes a tax liability. Fail closed when the type carries no
    // liability account — silently crediting AP with the full total would hide
    // the liability and overstate what the vendor is owed.
    const latestWithholding = Number(b.withholdingAmount ?? 0);
    if (latestWithholding > latestGrandTotal) {
      throw new Error(
        `Pemotongan PPh (${latestWithholding}) melebihi total keseluruhan tagihan (${latestGrandTotal}) — periksa data tagihan vendor`,
      );
    }
    const withholdingAccountId = b.withholdingType?.liabilityAccountId ?? null;
    if (latestWithholding > 0 && !withholdingAccountId) {
      throw new Error(
        "Jenis PPh pada tagihan ini belum memiliki akun Hutang PPh — lengkapi di Pengaturan → Pajak Potong",
      );
    }

    const journalNumber = await generateJournalNumber(tx, "BILL", billId);

    const latestDebitEntries: {
      accountId: number;
      debit: number;
      credit: number;
      memo: string;
    }[] = [];
    if (goodsBased) {
      if (latestTaxAmount > latestGrandTotal) {
        throw new Error(
          `Pajak tagihan (${latestTaxAmount}) melebihi total keseluruhan (${latestGrandTotal}) — periksa data tagihan vendor`,
        );
      }
      const clearingAmount = latestGrandTotal - latestTaxAmount;
      latestDebitEntries.push({
        accountId: settings.purchaseInventoryAccountId!,
        debit: clearingAmount,
        credit: 0,
        memo: "Clearing penerimaan barang",
      });
      if (latestTaxAmount > 0) {
        latestDebitEntries.push({
          accountId: settings.purchaseTaxAccountId!,
          debit: latestTaxAmount,
          credit: 0,
          memo: "PPN Masukan",
        });
      }
    } else {
      if (!settings.purchaseExpenseAccountId) {
        throw new Error(
          "Akun beban pembelian (purchaseExpenseAccountId) belum dikonfigurasi untuk tagihan jasa/biaya",
        );
      }
      // F-2026-10-24-133-V Putusan 4(3): memo debit jurnal L3 menyebut
      // nomor WO; referenceType tetap VendorBill (F-127-V).
      const l3BillTag = parseL3Tag(b.notes);
      latestDebitEntries.push({
        accountId: settings.purchaseExpenseAccountId,
        debit: latestGrandTotal,
        credit: 0,
        memo: l3BillTag
          ? `Purchase expense — biaya telat non-job L3 ${l3BillTag.workOrderNo}`
          : "Purchase expense",
      });
    }

    await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: b.date,
        referenceType: "VendorBill",
        referenceId: b.id,
        description: `Vendor Bill ${b.documentNo}`,
        type: "AUTO",
        status: "POSTED",
        totalDebit: b.grandTotal,
        totalCredit: b.grandTotal,
        createdBy: userId,
        entries: {
          create: [
            ...latestDebitEntries,
            ...(latestWithholding > 0 && withholdingAccountId
              ? [
                  {
                    accountId: withholdingAccountId,
                    debit: 0,
                    credit: latestWithholding,
                    memo: `PPh dipotong — ${b.withholdingType?.name ?? "PPh"}`,
                  },
                ]
              : []),
            {
              accountId: settings.purchasePayableAccountId!,
              debit: 0,
              credit: latestGrandTotal - latestWithholding,
              memo: "Accounts Payable",
            },
          ],
        },
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. onVendorPaymentCreated
//     Dr. Accounts Payable (amount)
//     Cr. Bank/Cash (amount)
// ─────────────────────────────────────────────────────────────────────────────

export async function onVendorPaymentCreated(
  paymentId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  assertJournalClaimRef("VendorPayment", paymentId);
  const settings = await getSystemSettings(db);
  if (!settings.purchasePayableAccountId) {
    throw new Error(
      "Akun Hutang Usaha belum dikonfigurasi untuk pembayaran vendor",
    );
  }

  const payment = await db.vendorPayment.findUniqueOrThrow({
    where: { id: paymentId },
  });

  // Bank/transfer admin fee is a real cost on top of the bill amount. It is NOT
  // allocated to any bill (the payment settles bills with `amount` only); it is
  // expensed to the purchase admin-fee account. A fee without its debit account
  // must stop the posting: omitting it would understate the bank outflow.
  const fee = Number(payment.adminFee ?? 0);
  const feeAccount = settings.purchaseAdminFeeAccountId;
  if (fee > 0 && !feeAccount) {
    throw new Error(
      "Akun beban admin bank belum dikonfigurasi untuk pembayaran vendor yang memiliki biaya admin",
    );
  }
  const bankAccountId = payment.accountId ?? settings.cashBankAccountId;
  if (!bankAccountId) {
    throw new Error(
      "Akun kas/bank belum dikonfigurasi untuk pembayaran vendor",
    );
  }
  const bankOut = Number(payment.amount) + fee;

  const existing = await db.journal.findFirst({
    where: { referenceType: "VendorPayment", referenceId: paymentId },
  });
  if (existing) {
    console.info(
      `[accounting.hook] pembayaran vendor #${paymentId} sudah punya jurnal ${existing.journalNumber ?? existing.id} — posting dilewati`,
    );
    return;
  }

  await assertPeriodOpen(payment.paymentDate || new Date(), txClient);

  await executeInTx(txClient, async (tx) => {
    // double check
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "VendorPayment", referenceId: paymentId },
    });
    if (existingInTx) {
      console.info(
        `[accounting.hook] pembayaran vendor #${paymentId} sudah punya jurnal ${existingInTx.journalNumber ?? existingInTx.id} — posting di dalam transaksi dilewati`,
      );
      return;
    }

    const journalNumber = await generateJournalNumber(tx, "VP", paymentId);
    await assertAccountsExist(tx, [settings.purchasePayableAccountId, feeAccount, bankAccountId], "Pembayaran vendor");

    const entries: {
      accountId: number;
      debit: number;
      credit: number;
      memo: string;
    }[] = [
      // Dr. Hutang Usaha
      {
        accountId: settings.purchasePayableAccountId!,
        debit: Number(payment.amount),
        credit: 0,
        memo: "Accounts Payable",
      },
    ];
    if (fee > 0) {
      // Dr. Beban Admin Bank (fee of paying)
      entries.push({
        accountId: feeAccount!,
        debit: fee,
        credit: 0,
        memo: "Beban Admin Bank",
      });
    }
    // Fix #28: Cr. Bank/Cash (bukan salesReceivableAccountId!)
    entries.push({
      accountId: bankAccountId,
      debit: 0,
      credit: bankOut,
      memo: "Bank/Cash paid",
    });

    await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: payment.paymentDate || new Date(),
        referenceType: "VendorPayment",
        referenceId: payment.id,
        description: `Vendor Payment ${payment.documentNo || paymentId}`,
        type: "AUTO",
        status: "POSTED",
        totalDebit: bankOut,
        totalCredit: bankOut,
        createdBy: userId,
        entries: { create: entries },
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. onPayrollPaid
//    Dr. Salary Expense (grossSalary)
//    Cr. Bank/Cash (netSalary)
//    Cr. Tax/BPJS Payable (statutory)
//    Cr. Piutang Karyawan (loanDeduction)
//    Cr. Salaries Payable (late + absent + manual deductions)
// ─────────────────────────────────────────────────────────────────────────────

export async function onPayrollPaid(
  payrollId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  assertJournalClaimRef("Payroll", payrollId);
  const settings = await getSystemSettings(db);
  if (!settings.salaryExpenseAccountId || !settings.payrollBankAccountId) {
    throw new Error(
      "Akun beban gaji dan bank payroll harus dikonfigurasi sebelum payroll diposting",
    );
  }

  // Idempotency: skip when an ACTIVE journal already exists. A REVERSED
  // journal is history, not a block (HR-BR-005 B4 §5.2 F-2026-10-28-133-S,
  // E-HRCR-6). NOTE: tidak ada jalur reversal Payroll yang hidup — satu-satunya
  // penulis jurnal Payroll adalah onPayrollPaid. Jadi saringan ini no-op hari
  // ini dan membuka jalan re-post yang benar bila reversal lahir (SalesInvoice).
  const existing = await db.journal.findFirst({
    where: { referenceType: "Payroll", referenceId: payrollId, status: { not: "REVERSED" } },
  });
  if (existing) {
    console.info(
      `[accounting.hook] penggajian #${payrollId} sudah punya jurnal ${existing.journalNumber ?? existing.id} — posting ganda dilewati`,
    );
    throw new Error(
      `Penggajian #${payrollId} sudah punya jurnal aktif — posting ganda ditolak. Koreksi slip paid hanya lewat dokumen koreksi.`,
    );
  }

  const payroll = await db.payroll.findUniqueOrThrow({
    where: { id: payrollId },
  });
  // E-HRCR-6b (135-V, selaras main): re-post payrollId asal sesudah reversal
  // SELALU ditolak berisik — slip koreksi sah selalu memakai referenceId BARU
  // (id slip koreksi), sehingga penjaga ini tak pernah menghalangi jalur sah.
  // Pesan menyebut nomor dokumen tanpa nominal gaji.
  const reversedOnly = await db.journal.findFirst({
    where: { referenceType: "Payroll", referenceId: payrollId, status: "REVERSED" },
    select: { id: true },
  });
  if (reversedOnly) {
    const docNo = (payroll as { documentNo?: unknown }).documentNo;
    throw new Error(
      typeof docNo === "string" && docNo.length > 0
        ? `Slip ${docNo} sudah pernah dijurnal lalu di-reverse — posting ulang slip asal ditolak; buat slip koreksi baru.`
        : "Slip ini sudah pernah dijurnal lalu di-reverse — posting ulang slip asal ditolak; buat slip koreksi baru.",
    );
  }

  // Defensive floor: legacy rows may carry a negative net_salary (before the
  // write-path clamp). A negative value would credit the bank account a negative
  // amount (the company "receiving" cash from the employee) and corrupt the
  // ledger. Clamp at 0 for posting.
  const netSalary = Math.max(0, Number(payroll.netSalary) || 0);
  const grossSalary = Number(payroll.grossSalary) || 0;
  const loanDeduction = Number(payroll.loanDeduction) || 0;
  const lateDeduction = Number(payroll.lateDeduction) || 0;
  const absentDeduction = Number(payroll.absentDeduction) || 0;
  const otherDeductions = Number(payroll.deductions) || 0;
  const statutory =
    Number(payroll.bpjsHealthEmployee ?? 0) +
    Number(payroll.bpjsEmploymentEmployee ?? 0) +
    Number(payroll.pph21 ?? 0);
  // Everything withheld from gross that is NOT the cash paid to the employee.
  // gross = net + statutory + loanDeduction + lateDeduction + absentDeduction + deductions
  const withholdings = safeAdd(
    safeAdd(statutory, loanDeduction, 2),
    safeAdd(lateDeduction, safeAdd(absentDeduction, otherDeductions, 2), 2),
    2,
  );
  // Debit the FULL gross salary cost, not (net + statutory): otherwise the
  // loan repayment, late/absent and manual deductions are never booked, the
  // salary expense is understated, and the employee receivable (Piutang
  // Karyawan) is never relieved as the loan is repaid through payroll.
  const totalExpense = safeAdd(netSalary, withholdings, 2);
  // Prefer the stored gross; fall back to the reconstructed total when gross is
  // 0 (legacy rows) so the journal still balances.
  const debitTotal = grossSalary > 0 ? grossSalary : totalExpense;

  if (debitTotal <= 0) return;

  const otherWithheld = safeAdd(
    safeAdd(lateDeduction, absentDeduction, 2),
    otherDeductions,
    2,
  );
  if (statutory > 0 && !settings.salariesPayableAccountId) {
    throw new Error(
      "Akun hutang gaji belum dikonfigurasi untuk potongan BPJS/PPh21 payroll",
    );
  }
  if (loanDeduction > 0 && !settings.employeeReceivableAccountId) {
    throw new Error(
      "Akun piutang karyawan belum dikonfigurasi untuk angsuran pinjaman payroll",
    );
  }
  if (otherWithheld > 0 && !settings.salariesPayableAccountId) {
    throw new Error(
      "Akun hutang gaji belum dikonfigurasi untuk potongan payroll",
    );
  }

  await assertPeriodOpen(payroll.paymentDate ?? new Date(), txClient);

  // F-2026-10-24-132-V Putusan 5: baris kompensasi PKWT di slip ini memecah
  // kaki debit — snapshot baris menentukan akun (210207 terakrual / 600028
  // belum terakrual), BUKAN tebakan hook. Tanpa baris: debitTotal utuh ke
  // salaryExpense seperti biasa.
  const pkwtLines = await db.payrollComponentLine.findMany({
    where: { payrollId, pkwtEventId: { not: null } },
    select: { pkwtEventId: true, pkwtSettledViaAccrual: true, amount: true, accountIdSnapshot: true },
  });
  const pkwtTotal = pkwtLines.reduce((s, l) => safeAdd(s, Number(l.amount) || 0, 2), 0);
  if (pkwtTotal > debitTotal) {
    throw new Error(
      "Baris kompensasi PKWT melebihi bruto slip — jurnal payroll ditolak (snapshot baris tidak konsisten dengan gross slip).",
    );
  }
  if (pkwtTotal > 0) {
    const s2 = settings as typeof settings & {
      pkwtCompensationExpenseAccountId?: number | null;
      pkwtCompensationPayableAccountId?: number | null;
    };
    if (!s2.pkwtCompensationExpenseAccountId || !s2.pkwtCompensationPayableAccountId) {
      throw new Error(
        "Mapping akun kompensasi PKWT belum lengkap — isi pkwtCompensationExpenseAccountId (600028) dan pkwtCompensationPayableAccountId (210207) di Pengaturan > Mapping Akun sebelum slip berisi kompensasi PKWT diposting.",
      );
    }
    for (const l of pkwtLines) {
      const expected = l.pkwtSettledViaAccrual
        ? s2.pkwtCompensationPayableAccountId
        : s2.pkwtCompensationExpenseAccountId;
      if (l.accountIdSnapshot !== expected) {
        throw new Error(
          "Snapshot akun baris kompensasi PKWT tidak cocok dengan mapping kompensasi berjalan — jurnal payroll ditolak; buat ulang baris dari peristiwa terbekukan.",
        );
      }
    }
  }

  // TASK-018 (5): porsi utang (210207) per baris dibatasi akrual subledger
  // aktual peristiwa itu — boolean settled saja membebankan nominal penuh
  // ke utang walau baru terakrual sebagian (peristiwa Rp2,5jt terakrual
  // Rp2,0jt -> saldo utang -Rp500rb). Sisa di atas akrual = beban (600028).
  const pkwtPayablePortion = new Map<number, number>();
  if (pkwtTotal > 0) {
    for (const l of pkwtLines) {
      const amount = Number(l.amount) || 0;
      if (!l.pkwtSettledViaAccrual || l.pkwtEventId == null) {
        if (l.pkwtEventId != null) pkwtPayablePortion.set(l.pkwtEventId, 0);
        continue;
      }
      const event = await db.pkwtCompensationEvent?.findUnique({
        where: { id: l.pkwtEventId },
        select: { employeeId: true, segmentStart: true },
      });
      let payable = amount;
      if (event) {
        const agg = await db.pkwtCompensationAccrual?.aggregate({
          where: { employeeId: event.employeeId, segmentStart: event.segmentStart },
          _sum: { amount: true },
        });
        const accrued = Number(agg?._sum?.amount ?? 0) || 0;
        payable = Math.min(amount, Math.max(0, accrued));
      }
      pkwtPayablePortion.set(l.pkwtEventId, payable);
    }
  }

  await executeInTx(txClient, async (tx) => {
    // double-check inside tx: two concurrent calls both pass the early
    // `findFirst` (returns null) and both open their own $transaction;
    // without this in-tx re-check the second call's `tx.journal.create` trips
    // the @@unique([referenceType, referenceId]) constraint and surfaces as
    // a confusing Prisma P2002 error to the user even though the operation
    // logically succeeded once.
    // E-HRCR-6b (HR-BR-005, vonis 135-V): re-post payrollId ASAL sesudah
    // reversal DITOLAK BERISIK. Slip koreksi sah selalu memakai referenceId
    // BARU (dokumen baru), bukan payrollId asal — jadi histori REVERSED atas
    // payrollId asal = bukti reversal sudah terjadi, bukan undangan re-post.
    const reversedHistory = await tx.journal.findFirst({
      where: { referenceType: "Payroll", referenceId: payrollId, status: "REVERSED" },
      select: { id: true },
    });
    if (reversedHistory) {
      const docNo = (payroll as { documentNo?: unknown }).documentNo;
      throw new Error(
        typeof docNo === "string" && docNo.length > 0
          ? `Slip ${docNo} sudah pernah dijurnal lalu di-reverse — posting ulang slip asal ditolak; buat slip koreksi baru.`
          : "Slip ini sudah pernah dijurnal lalu di-reverse — posting ulang slip asal ditolak; buat slip koreksi baru.",
      );
    }
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "Payroll", referenceId: payrollId, status: { not: "REVERSED" } },
    });
    if (existingInTx) {
      console.info(
        `[accounting.hook] penggajian #${payrollId} sudah punya jurnal ${existingInTx.journalNumber ?? existingInTx.id} — posting ganda di dalam transaksi dilewati`,
      );
      throw new Error(
        `Penggajian #${payrollId} sudah punya jurnal aktif — posting ganda ditolak. Koreksi slip paid hanya lewat dokumen koreksi.`,
      );
    }

    const journalNumber = await generateJournalNumber(tx, "PAY", payrollId);

    const entries: Array<{
      accountId: number;
      debit: number;
      credit: number;
      memo: string;
      costCenterId?: number | null;
    }> = [
      // Dr. Salary Expense (gross dikurangi kaki kompensasi PKWT)
      {
        accountId: settings.salaryExpenseAccountId!,
        debit: safeAdd(debitTotal, -pkwtTotal, 2),
        credit: 0,
        memo: "Beban Gaji",
        costCenterId: payroll.costCenterId ?? null,
      },
      // Cr. Bank/Cash (net paid to employee)
      {
        accountId: settings.payrollBankAccountId!,
        debit: 0,
        credit: netSalary,
        memo: "Pembayaran Gaji",
      },
    ];

    // Dr. kaki kompensasi PKWT per snapshot baris (Putusan 5): terakrual ->
    // Dr 210207 (pelunasan utang, TANPA beban kedua); belum terakrual ->
    // Dr 600028. Digabung per akun.
    if (pkwtTotal > 0) {
      const s2 = settings as typeof settings & {
        pkwtCompensationExpenseAccountId?: number | null;
        pkwtCompensationPayableAccountId?: number | null;
      };
      const byAccount = new Map<number, number>();
      for (const l of pkwtLines) {
        const amount = Number(l.amount) || 0;
        // TASK-018 (5): baris terakrual parsial dipecah — porsi utang
        // sebesar akrual aktual, sisanya beban periode berjalan.
        const payableAmt = l.pkwtEventId != null ? (pkwtPayablePortion.get(l.pkwtEventId) ?? 0) : 0;
        const expenseAmt = safeAdd(amount, -payableAmt, 2);
        if (payableAmt > 0) {
          const acct = s2.pkwtCompensationPayableAccountId!;
          byAccount.set(acct, safeAdd(byAccount.get(acct) ?? 0, payableAmt, 2));
        }
        if (expenseAmt > 0) {
          const acct = s2.pkwtCompensationExpenseAccountId!;
          byAccount.set(acct, safeAdd(byAccount.get(acct) ?? 0, expenseAmt, 2));
        }
      }
      for (const [accountId, amt] of byAccount) {
        if (amt > 0) {
          entries.push({
            accountId,
            debit: amt,
            credit: 0,
            memo:
              accountId === s2.pkwtCompensationPayableAccountId
                ? "Pelunasan Utang Kompensasi PKWT"
                : "Beban Kompensasi PKWT",
            costCenterId: payroll.costCenterId ?? null,
          });
        }
      }
    }

    // Cr. Salaries Payable for statutory (BPJS+PPh).
    if (statutory > 0) {
      entries.push({
        accountId: settings.salariesPayableAccountId!,
        debit: 0,
        credit: statutory,
        memo: "BPJS + PPh21 karyawan",
      });
    }

    // Cr. Piutang Karyawan for the loan instalment withheld from pay — this is
    // the repayment side of onEmployeeLoanDisbursed (Dr Piutang / Cr Bank).
    // Without it the receivable grows forever and is never collected.
    if (loanDeduction > 0) {
      entries.push({
        accountId: settings.employeeReceivableAccountId!,
        debit: 0,
        credit: loanDeduction,
        memo: "Angsuran Pinjaman Karyawan",
      });
    }

    // Cr. Potongan (late / absent / manual deductions) — withheld, not paid as
    // cash, so they reduce the salary expense via a payable leg.
    if (otherWithheld > 0) {
      entries.push({
        accountId: settings.salariesPayableAccountId!,
        debit: 0,
        credit: otherWithheld,
        memo: "Potongan (terlambat/absen/lainnya)",
      });
    }

    // Balance assertion: the journal must have Σdebit == Σcredit. The debit is
    // the gross salary (or the reconstructed net+withholdings), and the credits
    // are net + statutory + loan + other withheld. When a payroll row's stored
    // gross disagrees with its parts (employer-funded BPJS, manual adjustments,
    // legacy rows), these diverge — fail loudly instead of committing a
    // permanently unbalanced GL row under a header that claims it balances.
    const creditTotal = entries.reduce((s, e) => safeAdd(s, e.credit, 2), 0);
    const debitSum = entries.reduce((s, e) => safeAdd(s, e.debit, 2), 0);
    if (Math.abs(debitSum - creditTotal) > 0.001) {
      // Self-heal the common case: a stored gross that is slightly larger/smaller
      // than the sum of its parts is really just the parts. Re-drive the debit
      // leg from the credit total so the entry stays balanced and no salary is
      // lost or invented. Kaki PKWT (entries sesudah index 0) TIDAK disentuh:
      // entries[0] = kredit − Σ debit lain.
      const otherDebit = entries.slice(1).reduce((s, e) => safeAdd(s, e.debit, 2), 0);
      entries[0].debit = safeAdd(creditTotal, -otherDebit, 2);
    }

    await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: payroll.paymentDate ?? new Date(),
        referenceType: "Payroll",
        referenceId: payrollId,
        description: `Penggajian ${payroll.documentNo}`,
        type: "AUTO",
        status: "POSTED",
        totalDebit: creditTotal,
        totalCredit: creditTotal,
        createdBy: userId ?? null,
        entries: {
          create: entries,
        },
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// onEmployeeLoanDisbursed
//   Dr. Piutang Karyawan (employeeReceivable)   total
//   Cr. Bank/Kas Payroll (payrollBank)          total
// Posted when an employee loan becomes active (cash disbursed to the employee).
// Mirrors YaraERP EmployeeLoanObserver. Idempotent on (referenceType, referenceId).
// ─────────────────────────────────────────────────────────────────────────────
export async function onEmployeeLoanDisbursed(
  loanId: number,
  userId?: number,
  txClient?: TxClient,
): Promise<void> {
  const db = txClient || prisma;
  assertJournalClaimRef("EmployeeLoan", loanId);
  const settings = await getSystemSettings(db);
  if (!settings.employeeReceivableAccountId || !settings.payrollBankAccountId) {
    throw new Error(
      "Akun piutang karyawan dan bank payroll harus dikonfigurasi sebelum pinjaman dicairkan",
    );
  }

  const loan = await db.employeeLoan.findUniqueOrThrow({ where: { id: loanId } });
  const amount = Number(loan.totalAmount);
  if (amount <= 0) return;

  const existing = await db.journal.findFirst({
    where: { referenceType: "EmployeeLoan", referenceId: loanId },
  });
  if (existing) {
    console.info(
      `[accounting.hook] pinjaman karyawan #${loanId} sudah punya jurnal ${existing.journalNumber ?? existing.id} — posting dilewati`,
    );
    return;
  }

  await assertPeriodOpen(loan.loanDate || new Date(), txClient);

  await executeInTx(txClient, async (tx) => {
    const existingInTx = await tx.journal.findFirst({
      where: { referenceType: "EmployeeLoan", referenceId: loanId },
    });
    if (existingInTx) {
      console.info(
        `[accounting.hook] pinjaman karyawan #${loanId} sudah punya jurnal ${existingInTx.journalNumber ?? existingInTx.id} — posting di dalam transaksi dilewati`,
      );
      return;
    }

    const journalNumber = await generateJournalNumber(tx, "LOAN", loanId);

    await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: loan.loanDate || new Date(),
        referenceType: "EmployeeLoan",
        referenceId: loan.id,
        description: `Pencairan pinjaman karyawan #${loanId}`,
        type: "AUTO",
        status: "POSTED",
        totalDebit: amount,
        totalCredit: amount,
        createdBy: userId,
        entries: {
          create: [
            {
              accountId: settings.employeeReceivableAccountId!,
              debit: amount,
              credit: 0,
              memo: "Piutang Karyawan (pinjaman)",
            },
            {
              accountId: settings.payrollBankAccountId!,
              debit: 0,
              credit: amount,
              memo: "Pencairan pinjaman",
            },
          ],
        },
      },
    });
  });
}
