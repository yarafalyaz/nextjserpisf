import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { Prisma, PrismaClient } from "@prisma/client"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// ============================================================================
// Tes konkurensi MariaDB NYATA (audit v5 gate 1-3) — bukan mock.
//
// Mock Prisma tidak bisa memberlakukan SELECT ... FOR UPDATE (lihat
// finance-concurrency-lock.test.ts: "coverage theater"). File ini meniru
// urutan lock produksi jalur bank statement line terhadap DB sungguhan dan
// membuktikan serialisasi / tidak-deadlock / konsistensi agregat header.
//
// Jalur produksi yang ditiru (src/actions/finance.actions.ts):
// - create-like: assertPeriodOpen(tx)  -> locking-read system_settings
//   (SELECT ... ORDER BY id LIMIT 1 FOR UPDATE, period-lock.service.ts),
//   lalu lockBankStatementHeaders (SELECT id FROM bank_statements ...
//   ORDER BY id FOR UPDATE), create baris, recalcBankStatementTotals.
//   Catatan: urutan setting/header di jalur create vs update berbeda di
//   produksi dan aman karena close-period hanya menahan kunci setting.
//   Skenario A vs B di bawah memakai urutan literal yang diminta gate:
//   A = header -> setting, B = baris -> header -> setting; keduanya
//   mengakuisisi header SEBELUM setting sehingga tidak membentuk siklus.
// - update-like: lock baris FOR UPDATE -> lock header -> locking-read
//   setting -> update baris -> recalc header.
//
// Env: INTEGRATION_DB_URL wajib diset eksplisit, mis.
//   INTEGRATION_DB_URL='mysql://root@127.0.0.1:3310/yara_erp' \
//     npx vitest run src/actions/__tests__/bank-statement-concurrency.integration.test.ts
// Tanpa env itu seluruh suite SKIP (CI unit biasa tidak boleh gagal, dan
// skip TIDAK dihitung lulus). DB harus sudah termigrasi (tabel e2e).
// ============================================================================

const INTEGRATION_DB_URL = process.env.INTEGRATION_DB_URL

const describeIntegration = INTEGRATION_DB_URL ? describe : describe.skip

if (!INTEGRATION_DB_URL) {
  console.warn(
    "[bank-statement-concurrency] SKIP: INTEGRATION_DB_URL tidak diset — " +
      "tes konkurensi MariaDB nyata tidak dijalankan (bukan lulus). " +
      "Set INTEGRATION_DB_URL ke DB tes termigrasi untuk menjalankannya.",
  )
}

// Prisma 7 MariaDB adapter menerima connection string / config; bentuk
// string sama dengan yang dipakai src/lib/db/prisma.ts (DATABASE_URL).
function createTestClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaMariaDb(INTEGRATION_DB_URL as string),
  })
}

type Tx = Prisma.TransactionClient

/** Deferred manual: barrier antar-langkah supaya interleaving deterministik. */
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const isDeadlock = (e: unknown): boolean => {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.includes("1213") || /deadlock/i.test(msg)
}

describeIntegration("konkurensi MariaDB nyata: bank statement line", () => {
  // Client terpisah per "transaksi" supaya pool koneksi / sesi MariaDB
  // benar-benar berbeda. $transaction interaktif Prisma meminjam satu
  // koneksi per transaksi, jadi dua $transaction bersamaan = dua koneksi.
  let admin: PrismaClient
  let clientA: PrismaClient
  let clientB: PrismaClient
  let clientC: PrismaClient

  let headerId = 0
  let existingLineId = 0
  let originalLockDate: Date | null = null
  let lockDateCaptured = false

  const LINE_DATE = new Date("2099-01-15T00:00:00.000Z")

  beforeAll(async () => {
    admin = createTestClient()
    clientA = createTestClient()
    clientB = createTestClient()
    clientC = createTestClient()

    const account = await admin.account.findFirst({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { id: "asc" },
    })
    if (!account) throw new Error("Fixture gagal: tidak ada baris accounts.")

    const setting = await admin.systemSetting.findFirst({
      select: { id: true, periodLockDate: true },
      orderBy: { id: "asc" },
    })
    if (!setting) throw new Error("Fixture gagal: tidak ada baris system_settings.")
    originalLockDate = setting.periodLockDate
    lockDateCaptured = true

    const header = await admin.bankStatement.create({
      data: {
        accountId: account.id,
        date: LINE_DATE,
        reference: `INTEG-CONC-${Date.now()}`,
        status: "draft",
        totalDebits: 0,
        totalCredits: 0,
      },
      select: { id: true },
    })
    headerId = header.id

    // Baris awal milik fixture sendiri; skenario update-like mengubahnya.
    const line = await admin.bankStatementLine.create({
      data: {
        bankStatementId: headerId,
        date: LINE_DATE,
        description: "fixture awal integ-conc",
        amount: 100,
        debit: 100,
        credit: 0,
        type: "debit",
        status: "unmatched",
      },
      select: { id: true },
    })
    existingLineId = line.id
    await admin.bankStatement.update({
      where: { id: headerId },
      data: { totalDebits: 100, totalCredits: 0 },
    })
  }, 30_000)

  afterAll(async () => {
    // Cleanup scoped ke fixture sendiri (bukan deleteMany global).
    // Urutan: kembalikan period_lock_date lebih dulu (scoped id setting
    // pertama, nilai ditangkap di beforeAll), lalu baris, lalu header.
    try {
      if (lockDateCaptured) {
        const setting = await admin.systemSetting.findFirst({
          select: { id: true },
          orderBy: { id: "asc" },
        })
        if (setting) {
          await admin.systemSetting.update({
            where: { id: setting.id },
            data: { periodLockDate: originalLockDate },
          })
        }
      }
    } finally {
      if (existingLineId) {
        await admin.bankStatementLine.deleteMany({
          where: { bankStatementId: headerId },
        })
      }
      if (headerId) {
        await admin.bankStatement.delete({ where: { id: headerId } })
      }
      await Promise.all([
        admin.$disconnect(),
        clientA.$disconnect(),
        clientB.$disconnect(),
        clientC.$disconnect(),
      ])
    }
  })

  /** Agregat baris fixture lewat koneksi admin (di luar tx skenario). */
  async function aggregateFixture() {
    const agg = await admin.bankStatementLine.aggregate({
      where: { bankStatementId: headerId },
      _sum: { debit: true, credit: true },
    })
    const header = await admin.bankStatement.findUniqueOrThrow({
      where: { id: headerId },
      select: { totalDebits: true, totalCredits: true },
    })
    return {
      sumDebit: Number(agg._sum.debit ?? 0),
      sumCredit: Number(agg._sum.credit ?? 0),
      headerDebit: Number(header.totalDebits),
      headerCredit: Number(header.totalCredits),
    }
  }

  async function lockSettingRows(tx: Tx) {
    // Sama persis dengan period-lock.service.ts jalur tx.
    return tx.$queryRaw<Array<{ id: number; period_lock_date: Date | string | null }>>`
      SELECT id, period_lock_date FROM system_settings ORDER BY id LIMIT 1 FOR UPDATE
    `
  }

  async function lockHeader(tx: Tx, id: number) {
    // Sama persis dengan lockBankStatementHeaders untuk satu header.
    await tx.$queryRaw`
      SELECT id FROM bank_statements WHERE id IN (${Prisma.join([id])}) ORDER BY id FOR UPDATE
    `
  }

  async function recalc(tx: Tx, id: number) {
    // Sama persis dengan recalcBankStatementTotals.
    const totals = await tx.bankStatementLine.aggregate({
      where: { bankStatementId: id },
      _sum: { debit: true, credit: true },
    })
    await tx.bankStatement.update({
      where: { id },
      data: {
        totalDebits: Math.round(Number(totals._sum.debit ?? 0) * 100) / 100,
        totalCredits: Math.round(Number(totals._sum.credit ?? 0) * 100) / 100,
      },
    })
  }

  it("create-like vs update-like bersamaan: keduanya commit, tanpa deadlock 1213, total header = agregat baris", async () => {
    const aLockedHeader = deferred()
    const bLockedLine = deferred()
    const aMayFinish = deferred()
    const bMayFinish = deferred()
    const commitOrder: string[] = []

    // A (create-like): lock header -> locking-read setting -> create -> recalc.
    const txA = clientA.$transaction(
      async (tx) => {
        await lockHeader(tx, headerId)
        aLockedHeader.resolve()
        // Tahan header sampai B sudah mengunci barisnya dan (seharusnya)
        // sedang menunggu header yang sama di langkah berikutnya.
        await bLockedLine.promise
        await lockSettingRows(tx)
        const created = await tx.bankStatementLine.create({
          data: {
            bankStatementId: headerId,
            date: LINE_DATE,
            description: "integ-conc A create-like",
            amount: 50,
            debit: 50,
            credit: 0,
            type: "debit",
            status: "unmatched",
          },
          select: { id: true },
        })
        await recalc(tx, headerId)
        await aMayFinish.promise
        return created.id
      },
      { timeout: 30_000, maxWait: 15_000 },
    )

    // B (update-like): lock baris -> lock header -> locking-read setting
    // -> update baris -> recalc.
    const txB = (async () => {
      await aLockedHeader.promise
      return clientB.$transaction(
        async (tx) => {
          await tx.$executeRaw`
            SELECT id FROM bank_statement_lines WHERE id = ${existingLineId} FOR UPDATE
          `
          bLockedLine.resolve()
          // Langkah ini wajib menunggu: header ditahan A.
          await lockHeader(tx, headerId)
          await lockSettingRows(tx)
          await tx.bankStatementLine.update({
            where: { id: existingLineId },
            data: { amount: 130, debit: 130, credit: 0 },
          })
          await recalc(tx, headerId)
          await bMayFinish.promise
        },
        { timeout: 30_000, maxWait: 15_000 },
      )
    })()

    const watchedA = txA.then(
      (id) => {
        commitOrder.push("A")
        return { ok: true as const, id }
      },
      (e: unknown) => ({ ok: false as const, error: e }),
    )
    const watchedB = txB.then(
      () => {
        commitOrder.push("B")
        return { ok: true as const }
      },
      (e: unknown) => ({ ok: false as const, error: e }),
    )

    let aSettled = false
    let bSettled = false
    void watchedA.then(() => {
      aSettled = true
    })
    void watchedB.then(() => {
      bSettled = true
    })

    // Bukti serialisasi, bukan timing kasar: B sudah mengunci barisnya
    // tetapi belum boleh commit selama A menahan header.
    await bLockedLine.promise
    await new Promise((r) => setTimeout(r, 300))
    expect(bSettled).toBe(false)
    expect(aSettled).toBe(false)

    // Lepas A dulu; B tetap belum boleh selesai sebelum gilirannya dilepas.
    aMayFinish.resolve()
    const resA = await watchedA
    expect(resA.ok, resA.ok ? undefined : String(resA.error)).toBe(true)
    await new Promise((r) => setTimeout(r, 300))
    expect(bSettled).toBe(false)

    bMayFinish.resolve()
    const resB = await watchedB
    expect(resB.ok, resB.ok ? undefined : String(resB.error)).toBe(true)

    for (const res of [resA, resB]) {
      if (!res.ok) expect(isDeadlock(res.error)).toBe(false)
    }
    // Urutan commit deterministik dari konstruksi barrier di atas.
    expect(commitOrder).toEqual(["A", "B"])

    // Agregat akhir: baris awal 130 (hasil update B) + baris A 50 = 180 debit.
    const totals = await aggregateFixture()
    expect(totals.headerDebit).toBeCloseTo(totals.sumDebit, 2)
    expect(totals.headerCredit).toBeCloseTo(totals.sumCredit, 2)
    expect(totals.sumDebit).toBeCloseTo(180, 2)
    expect(totals.sumCredit).toBeCloseTo(0, 2)
  }, 60_000)

  it("close-period vs post-like: update period_lock_date menunggu locking-read setting, lalu jalan sesudah commit", async () => {
    const postHoldsSetting = deferred()
    const closeFinished = deferred()
    const postMayFinish = deferred()
    const events: string[] = []

    const newLockDate = new Date("2099-01-31T00:00:00.000Z")

    // Tx1 (post-like): locking-read setting dan tahan sampai dilepas.
    // Ini kunci yang sama dengan yang diambil assertPeriodOpen(tx).
    const txPost = clientA.$transaction(
      async (tx) => {
        const rows = await lockSettingRows(tx)
        events.push("post:locked-setting")
        postHoldsSetting.resolve()
        await postMayFinish.promise
        // Baca ulang di dalam tx yang sama: nilai lama, karena close
        // belum bisa menulis selama kunci ini ditahan.
        const reread = await lockSettingRows(tx)
        const seen =
          reread[0]?.period_lock_date == null
            ? null
            : new Date(reread[0].period_lock_date).getTime()
        expect(seen).toBe(
          rows[0]?.period_lock_date == null
            ? null
            : new Date(rows[0].period_lock_date).getTime(),
        )
        events.push("post:commit")
      },
      { timeout: 30_000, maxWait: 15_000 },
    )

    // Tx2 (close-period-like): update baris setting yang sama. UPDATE atas
    // baris yang terkunci FOR UPDATE wajib menunggu Tx1 selesai.
    const txClose = (async () => {
      await postHoldsSetting.promise
      const result = await clientC.$transaction(
        async (tx) => {
          const setting = await tx.systemSetting.findFirst({
            select: { id: true },
            orderBy: { id: "asc" },
          })
          if (!setting) throw new Error("system_settings kosong")
          await tx.systemSetting.update({
            where: { id: setting.id },
            data: { periodLockDate: newLockDate },
          })
          events.push("close:updated")
          return setting.id
        },
        { timeout: 30_000, maxWait: 15_000 },
      )
      closeFinished.resolve()
      return result
    })()

    let closeSettled = false
    const watchedClose = txClose.then(
      (id) => {
        closeSettled = true
        return { ok: true as const, id }
      },
      (e: unknown) => {
        closeSettled = true
        return { ok: false as const, error: e }
      },
    )
    const watchedPost = txPost.then(
      () => ({ ok: true as const }),
      (e: unknown) => ({ ok: false as const, error: e }),
    )

    await postHoldsSetting.promise
    // Assert serialisasi: selama Tx1 menahan kunci setting, Tx2 belum
    // boleh selesai — berapa pun lamanya (cek berulang, bukan satu sleep).
    for (let i = 0; i < 10 && !closeSettled; i++) {
      await new Promise((r) => setTimeout(r, 50))
    }
    expect(closeSettled).toBe(false)
    expect(events).toEqual(["post:locked-setting"])

    postMayFinish.resolve()
    const resPost = await watchedPost
    expect(resPost.ok, resPost.ok ? undefined : String(resPost.error)).toBe(true)

    await closeFinished.promise
    const resClose = await watchedClose
    expect(resClose.ok, resClose.ok ? undefined : String(resClose.error)).toBe(true)
    if (!resClose.ok) expect(isDeadlock(resClose.error)).toBe(false)

    // Urutan hasil: close hanya berjalan sesudah post commit.
    expect(events).toEqual(["post:locked-setting", "post:commit", "close:updated"])

    // Nilai akhir terlihat oleh pembaca baru; afterAll mengembalikannya.
    const after = await admin.systemSetting.findFirst({
      select: { periodLockDate: true },
      orderBy: { id: "asc" },
    })
    expect(after?.periodLockDate?.getTime()).toBe(newLockDate.getTime())
  }, 60_000)
})
