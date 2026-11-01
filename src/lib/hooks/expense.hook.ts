
import { prisma } from "@/lib/db/prisma";
import { generateDocumentNumber } from "@/lib/utils/document-number";
import { computePettyCashChain, findFirstNegativeBalance } from "@/lib/finance/petty-cash-chain";
import { assertPeriodOpen } from "@/lib/services/period-lock.service";
import { getSystemSettings } from "@/lib/utils/settings";

/**
 * Expense Hook - Observer pattern replacement.
 * When expense is approved AND paid from petty cash account, auto-create PettyCash OUT record.
 */

function isPettyCashAccountName(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("petty cash") || n.includes("kas kecil");
}

export async function onExpenseApprovedSyncPettyCash(
  expenseId: number,
  approvedByUserId?: number,
  txClient?: unknown,
): Promise<void> {
  const run = async (tx: any) => {
    // Kunci baris expense lebih dulu: dua approval konkuren untuk expense yang
    // sama men-serialize di sini, sehingga cek duplikat + create di bawah tak
    // bisa sama-sama lolos. Baris dibaca ulang di dalam tx (keadaan terkunci).
    if (typeof tx.$queryRaw === "function") {
      await tx.$queryRaw`SELECT id FROM expenses WHERE id = ${expenseId} FOR UPDATE`;
    }
    const expense = await tx.expense.findUniqueOrThrow({
      where: { id: expenseId },
    });

    // R8-KEU-04/05: sync hanya boleh menulis untuk expense yang masih hidup di
    // status pra/sesudah-approve. Bila penghapusan atau reject menang lebih
    // dulu, jangan bangkitkan kas kecil untuk dokumen yang sudah selesai.
    if (!["draft", "pending", "approved"].includes(expense.status)) {
      throw new Error("Pengeluaran sudah diproses atau status tidak valid");
    }

    // Only sync if paid from a petty cash type account
    if (!expense.paidFromAccountId) {
      console.warn(
        `[expense.hook] expense ${expense.documentNo ?? expenseId} tanpa paidFromAccountId — sinkron kas kecil dilewati`
      );
      return;
    }

    const paidFromAccount = await tx.account.findUnique({
      where: { id: expense.paidFromAccountId },
      select: { id: true, name: true, isActive: true, deletedAt: true },
    });
    if (!paidFromAccount) {
      console.warn(
        `[expense.hook] expense ${expense.documentNo ?? expenseId} bukan dari akun kas kecil (akun: ${expense.paidFromAccountId}) — sinkron dilewati`
      );
      return;
    }

    // Deteksi akun kas kecil: setting kanonis pettyCashAccountId didahulukan
    // (akun terkonfigurasi tak bergantung ejaan nama). Bila setting kosong,
    // fallback pola nama lama — perilaku saat setting cocok nama tak berubah.
    // getSystemSettings sendiri fallback memori saat DB tak terjangkau dan
    // hanya throw pada schema drift — biar throw itu keras terlihat, jangan
    // ditelan di sini.
    const settings = await getSystemSettings();
    const canonicalId = (settings as { pettyCashAccountId?: number | null })?.pettyCashAccountId ?? null;
    const isPettyCash = canonicalId != null
      ? expense.paidFromAccountId === canonicalId
      : isPettyCashAccountName(paidFromAccount.name);
    if (!isPettyCash) {
      console.warn(
        `[expense.hook] expense ${expense.documentNo ?? expenseId} bukan dari akun kas kecil (akun: ${paidFromAccount.name}) — sinkron dilewati`
      );
      return;
    }

    // Putaran 51: akun kas kecil sumber yang sudah nonaktif/terhapus bukan
    // skip senyap — baris OUT tidak akan pernah lahir dan subledger kas kecil
    // tak selaras GL. Tolak keras; expense non-kas-kecil tetap skip by-design.
    if (!paidFromAccount.isActive || paidFromAccount.deletedAt !== null) {
      throw new Error(
        `Sinkronisasi kas kecil: akun tidak aktif/terhapus atau tidak ditemukan (id: ${paidFromAccount.id}). Pilih ulang akun sebelum posting.`,
      );
    }

    // Period gate sebelum create: expense bertanggal periode tertutup ditolak
    // di dalam tx yang sama (lock expense sudah dipegang).
    await assertPeriodOpen(expense.date, tx);

    // Idempotency: check if PettyCash record already exists for this expense
    const existing = await tx.pettyCash.findFirst({
      where: { referenceNo: expense.documentNo },
    });
    if (existing) {
      console.info(
        `[expense.hook] expense ${expense.documentNo ?? expenseId} sudah punya kas kecil ${existing.documentNo} — sinkron dilewati`,
      );
      return;
    }

    // Nomor dokumen baru diambil hanya sesudah lolos cek akun/periode/duplikat:
    // DocumentSequenceService.next menaikkan counter atomik, jadi mengambilnya
    // sebelum cek akan membuang nomor urut tiap expense non-kas-kecil/duplikat.
    // Gap-lock tabel kas kecil sebelum create + recalc rantai: penulis
    // rantai lain (createPettyCash/updatePettyCash/deletePettyCash di
    // finance.actions) mengambil kunci yang sama. Tanpa ini dua approval
    // expense berbeda (masing-masing hanya mengunci baris expensenya)
    // membaca snapshot rantai sendiri-sendiri lalu menimpa balanceBefore/
    // balanceAfter absolut per baris — rantai final milik penulis terakhir
    // dan cek negatif dinilai atas rantai tak lengkap. Urutan kunci:
    // expense dulu (di atas), lalu petty_cash; jalur finance tidak pernah
    // mengunci expense, jadi tak ada siklus kunci.
    if (typeof tx.$executeRaw === "function") {
      await tx.$executeRaw`SELECT id FROM petty_cash FOR UPDATE`;
    }

    const documentNo = await generateDocumentNumber("PC");

    await tx.pettyCash.create({
      data: {
        documentNo,
        type: "OUT",
        amount: expense.amount,
        description: `Expense: ${expense.description ?? expense.documentNo}`,
        accountId: expense.paidFromAccountId!,
        date: expense.date ?? new Date(),
        transactionDate: expense.date ?? new Date(),
        referenceNo: expense.documentNo,
        balanceBefore: 0,
        balanceAfter: 0,
        createdBy: approvedByUserId ?? expense.approvedBy ?? null,
      },
    });

    // Validate the running-balance chain in chronological (date,id) order
    // BEFORE persisting any updates, mirroring the negative-balance guard
    // in `recalcPettyCashChain` (used by createPettyCash / updatePettyCash /
    // deletePettyCash). Petty cash must not go negative, so approving an
    // expense that overdraws the chain (e.g. a back-dated OUT after later
    // INs) must be rejected — otherwise the negative balance would be
    // silently saved by the recompute loop below, breaking the invariant
    // enforced everywhere else.
    //
    // Reuse the shared `computePettyCashChain` + `findFirstNegativeBalance`
    // helpers from @/lib/finance/petty-cash-chain (the same source of truth
    // used by recalcPettyCashChain in finance.actions.ts) so the chain math
    // is float-drift-safe (safeAdd/safeSubtract) and the overdraw error
    // message is byte-identical with the one the rest of the app emits.
    // Previously this loop hand-rolled raw `+`/`-` arithmetic, which could
    // round differently from the canonical path and silently desync the
    // balanceAfter values that other code paths depend on.
    //
    // Hanya record posted & belum terhapus yang ikut rantai: void/deleted
    // dibekukan sebagai snapshot historis (GL-BR-003) dan tidak ditulis ulang.
    const all = await tx.pettyCash.findMany({
      where: { status: "posted", deletedAt: null },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: { id: true, documentNo: true, type: true, amount: true, balanceBefore: true, balanceAfter: true, status: true },
    });

    const records = all.map((r: (typeof all)[number]) => ({
      id: r.id,
      documentNo: r.documentNo,
      type: r.type,
      amount: Number(r.amount),
    }));

    const negative = findFirstNegativeBalance(records);
    if (negative) {
      throw new Error(
        `Saldo kas kecil menjadi negatif pada transaksi ${negative.record.documentNo ?? `#${negative.record.id}`} ` +
          `(saldo: ${negative.balanceAfter.toLocaleString("id-ID")}). Periksa urutan tanggal dan jumlah pengeluaran.`
      );
    }

    const balances = computePettyCashChain(records);
    const balanceById = new Map(balances.map((b) => [b.id, b]));
    const updates = all
      .map((r: (typeof all)[number]) => {
        const target = balanceById.get(r.id);
        if (!target) return null;
        if (Number(r.balanceBefore) === target.balanceBefore && Number(r.balanceAfter) === target.balanceAfter) {
          return null;
        }
        return tx.pettyCash.update({
          where: { id: r.id },
          data: { balanceBefore: target.balanceBefore, balanceAfter: target.balanceAfter },
        });
      })
      .filter((u: unknown) => u !== null);

    if (updates.length > 0) {
      // Parallelise the per-row updates — N sequential round-trips → 1
      // batched concurrent dispatch. Matches the Promise.all pattern used
      // in recalcPettyCashChain in finance.actions.ts.
      await Promise.all(updates);
    }
  };

  if (txClient) {
    await run(txClient);
    return;
  }
  await prisma.$transaction(run);
}
