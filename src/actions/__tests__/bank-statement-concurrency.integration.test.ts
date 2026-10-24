import { Prisma, PrismaClient } from "@prisma/client"
import { afterAll, beforeAll, expect, it } from "vitest"
import {
  createTestClient,
  deferred,
  describeIntegration,
  warnIntegrationSkip,
} from "./integration-concurrency-fixtures"

// ============================================================================
// Tes konkurensi MySQL 8 NYATA (audit v5 gate 1-3, audit v6 poin 3-4) —
// bukan mock.
//
// DUA LAPIS BUKTI, jangan tertukar:
// 1. FILE INI (DB nyata): transaksi di bawah adalah TIRUAN yang pola urutan
//    lock-nya ditiru dari produksi (pemetaan jalur di bawah). File ini
//    membuktikan pola urutan itu aman di MySQL 8 sungguhan: serialisasi,
//    tanpa deadlock 1213, dan total header = agregat baris sesudah
//    transaksi konkuren commit. Mock Prisma tidak bisa memberlakukan
//    SELECT ... FOR UPDATE (lihat finance-concurrency-lock.test.ts:
//    "coverage theater"), jadi bukti perilaku DB hanya bisa dari sini.
// 2. UNIT GUARD MOCK: finance-bankstatement-header-lock-guard.test.ts
//    memverifikasi URUTAN PANGGILAN action produksi yang sebenarnya
//    (createBankStatementLine / updateBankStatementLine /
//    deleteBankStatementLine dengan Prisma termock): produksi memang
//    memakai urutan lock yang ditiru di sini. Guard itu tidak menyentuh DB
//    nyata, jadi sendirian ia tidak membuktikan perilaku lock apa pun.
// Kombinasi keduanya = bukti: guard mengikat tiruan ini ke kode produksi,
// file ini membuktikan pola yang dikunci guard itu benar di DB nyata.
//
// File ini SENGAJA tidak memanggil Server Action produksi langsung:
// action produksi butuh sesi NextAuth (requirePermission), FormData, dan
// revalidatePath, dan repo tidak punya harness action-test DB nyata —
// semua tes action eksisting memakai Prisma termock, tes integration
// eksisting memanggil lib/service langsung, bukan Server Action. Tiruan
// transaksi + guard urutan di atas adalah pola yang disetujui untuk celah
// itu.
//
// Jalur produksi yang ditiru (src/actions/finance.actions.ts, sesudah
// R-15):
// - create-like: lockBankStatementHeaders (SELECT id FROM bank_statements
//   ... ORDER BY id FOR UPDATE) -> assertPeriodOpen(tx) (locking-read
//   system_settings: SELECT ... ORDER BY id LIMIT 1 FOR UPDATE,
//   period-lock.service.ts) -> buat baris -> recalcBankStatementTotals.
//   Sesudah R-15 urutan create produksi = header -> setting, SAMA dengan
//   update/delete. Catatan lama "urutan setting/header create berbeda"
//   sudah tidak berlaku: R-15 menyamakannya untuk menutup siklus tunggu
//   create (setting -> header) vs update/delete (header -> setting).
// - update-like: lock baris FOR UPDATE -> lock header -> locking-read
//   setting -> update baris -> recalc header. Bila baris pindah header,
//   header LAMA + BARU dikunci SORTED dalam satu panggilan helper
//   (lockHeaders di bawah meniru dedupe + sort naik + satu query itu),
//   lalu recalc KEDUA header (baru dulu, lalu lama — urutan produksi).
// - delete-like: lock baris FOR UPDATE -> lock header -> locking-read
//   setting -> hapus baris -> recalc header.
// Penulis baris produksi juga mengunci induk rekonsiliasi sesudah setting;
// fixture file ini tidak punya rekonsiliasi terkait dan langkah itu tidak
// menyentuh header/baris/setting, jadi tidak ditiru di sini.
//
// Env: INTEGRATION_DB_URL wajib diset eksplisit, mis.
//   INTEGRATION_DB_URL='mysql://root@127.0.0.1:3310/yara_erp?allowPublicKeyRetrieval=true' \
//     npx vitest run src/actions/__tests__/bank-statement-concurrency.integration.test.ts
// Tanpa env itu seluruh suite SKIP (CI unit biasa tidak boleh gagal, dan
// skip TIDAK dihitung lulus). DB harus sudah termigrasi + terseed minimal
// (fixture butuh >=1 accounts dan >=1 system_settings; `prisma/seed.ts`
// memenuhinya). Engine target: MySQL 8 (container lokal `silengkap-e2e-db`
// = mysql:8.0 port 3310). `allowPublicKeyRetrieval=true` wajib untuk auth
// caching_sha2_password MySQL 8 lewat adapter-mariadb di koneksi pertama.
// ============================================================================

warnIntegrationSkip("bank-statement-concurrency")

type Tx = Prisma.TransactionClient

const isDeadlock = (e: unknown): boolean => {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.includes("1213") || /deadlock/i.test(msg)
}

describeIntegration("konkurensi MySQL 8 nyata: bank statement line", () => {
  // Client terpisah per "transaksi" supaya pool koneksi / sesi MySQL
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
  let fixtureAccountId = 0
  // Semua header buatan suite (header lama + header per-skenario v6);
  // afterAll hanya membersihkan id ini, bukan header lain di DB.
  const fixtureHeaderIds: number[] = []

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
    fixtureAccountId = account.id

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
    fixtureHeaderIds.push(headerId)

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
      if (fixtureHeaderIds.length) {
        await admin.bankStatementLine.deleteMany({
          where: { bankStatementId: { in: fixtureHeaderIds } },
        })
        await admin.bankStatement.deleteMany({
          where: { id: { in: fixtureHeaderIds } },
        })
      }
      await Promise.all([
        admin.$disconnect(),
        clientA.$disconnect(),
        clientB.$disconnect(),
        clientC.$disconnect(),
      ])
    }
  })

  /** Agregat baris satu header lewat koneksi admin (di luar tx skenario). */
  async function aggregateHeader(id: number) {
    const agg = await admin.bankStatementLine.aggregate({
      where: { bankStatementId: id },
      _sum: { debit: true, credit: true },
    })
    const header = await admin.bankStatement.findUniqueOrThrow({
      where: { id },
      select: { totalDebits: true, totalCredits: true },
    })
    return {
      sumDebit: Number(agg._sum.debit ?? 0),
      sumCredit: Number(agg._sum.credit ?? 0),
      headerDebit: Number(header.totalDebits),
      headerCredit: Number(header.totalCredits),
    }
  }

  /** Agregat baris fixture lama lewat koneksi admin (di luar tx skenario). */
  async function aggregateFixture() {
    return aggregateHeader(headerId)
  }

  /** Header fixture baru terdaftar untuk cleanup scoped di afterAll. */
  async function makeHeader(tag: string) {
    const header = await admin.bankStatement.create({
      data: {
        accountId: fixtureAccountId,
        date: LINE_DATE,
        reference: `INTEG-CONC-${tag}-${Date.now()}`,
        status: "draft",
        totalDebits: 0,
        totalCredits: 0,
      },
      select: { id: true },
    })
    fixtureHeaderIds.push(header.id)
    return header.id
  }

  async function makeLine(
    bankStatementId: number,
    debit: number,
    credit: number,
    description: string,
  ) {
    const line = await admin.bankStatementLine.create({
      data: {
        bankStatementId,
        date: LINE_DATE,
        description,
        amount: debit + credit,
        debit,
        credit,
        type: credit > 0 ? "credit" : "debit",
        status: "unmatched",
      },
      select: { id: true },
    })
    return line.id
  }

  async function lockSettingRows(tx: Tx) {
    // Sama persis dengan period-lock.service.ts jalur tx.
    return tx.$queryRaw<Array<{ id: number; period_lock_date: Date | string | null }>>`
      SELECT id, period_lock_date FROM system_settings ORDER BY id LIMIT 1 FOR UPDATE
    `
  }

  async function lockHeaders(tx: Tx, ids: readonly number[]) {
    // Sama persis dengan lockBankStatementHeaders: dedupe + urut naik,
    // lalu SATU query ORDER BY id FOR UPDATE (urutan global anti-deadlock).
    const sorted = [...new Set(ids)].sort((a, b) => a - b)
    if (sorted.length === 0) return
    await tx.$queryRaw`
      SELECT id FROM bank_statements WHERE id IN (${Prisma.join(sorted)}) ORDER BY id FOR UPDATE
    `
  }

  async function lockHeader(tx: Tx, id: number) {
    return lockHeaders(tx, [id])
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

  it("create-like vs delete-like pada header sama: keduanya commit, tanpa deadlock 1213, baris terhapus hilang + baris baru ada, total header = agregat baris", async () => {
    // Fixture khusus skenario (header sendiri) supaya angka deterministik
    // dan tidak mengganggu skenario lain yang jalan serial di suite ini:
    // baris 80 debit dihapus delete-like; baris 50 debit dibuat create-like.
    const cdHeaderId = await makeHeader("CD")
    const doomedLineId = await makeLine(cdHeaderId, 80, 0, "integ-conc CD doomed")
    await admin.bankStatement.update({
      where: { id: cdHeaderId },
      data: { totalDebits: 80, totalCredits: 0 },
    })

    const dLockedLine = deferred()
    const cLockedHeader = deferred()
    const dMayFinish = deferred()
    const cMayFinish = deferred()
    const commitOrder: string[] = []

    // D (delete-like): lock baris -> lock header -> locking-read setting
    // -> hapus baris -> recalc.
    const txD = clientB.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT id FROM bank_statement_lines WHERE id = ${doomedLineId} FOR UPDATE
        `
        dLockedLine.resolve()
        // Deterministik: jangan rebut header sebelum C memegangnya.
        // Tanpa tunggu sinyal ini, D yang sudah di dalam transaksi hampir
        // pasti menang balapan header dan interleaving yang diuji hilang.
        await cLockedHeader.promise
        // Langkah ini wajib menunggu di DB: header ditahan C.
        await lockHeader(tx, cdHeaderId)
        await lockSettingRows(tx)
        await tx.bankStatementLine.delete({ where: { id: doomedLineId } })
        await recalc(tx, cdHeaderId)
        await dMayFinish.promise
      },
      { timeout: 30_000, maxWait: 15_000 },
    )

    // C (create-like): lock header -> locking-read setting -> buat baris
    // -> recalc. Mulai sesudah D mengunci barisnya: D memegang baris tetapi
    // belum header, C mengambil header dulu — pasangan urutan inilah yang
    // dulu bisa membentuk siklus (create setting -> header vs delete
    // header -> setting) sebelum R-15 menyamakan create ke header dulu.
    const txC = (async () => {
      await dLockedLine.promise
      return clientA.$transaction(
        async (tx) => {
          await lockHeader(tx, cdHeaderId)
          cLockedHeader.resolve()
          await lockSettingRows(tx)
          const created = await tx.bankStatementLine.create({
            data: {
              bankStatementId: cdHeaderId,
              date: LINE_DATE,
              description: "integ-conc CD create-like",
              amount: 50,
              debit: 50,
              credit: 0,
              type: "debit",
              status: "unmatched",
            },
            select: { id: true },
          })
          await recalc(tx, cdHeaderId)
          await cMayFinish.promise
          return created.id
        },
        { timeout: 30_000, maxWait: 15_000 },
      )
    })()

    const watchedD = txD.then(
      () => {
        commitOrder.push("D")
        return { ok: true as const }
      },
      (e: unknown) => ({ ok: false as const, error: e }),
    )
    const watchedC = txC.then(
      (id) => {
        commitOrder.push("C")
        return { ok: true as const, id }
      },
      (e: unknown) => ({ ok: false as const, error: e }),
    )

    let cSettled = false
    let dSettled = false
    void watchedC.then(() => {
      cSettled = true
    })
    void watchedD.then(() => {
      dSettled = true
    })

    // Bukti serialisasi: C memegang header, D sudah mengunci barisnya
    // tetapi belum boleh commit selama header ditahan C.
    await cLockedHeader.promise
    await new Promise((r) => setTimeout(r, 300))
    expect(cSettled).toBe(false)
    expect(dSettled).toBe(false)

    // Lepas C dulu; D tetap belum boleh selesai sebelum gilirannya dilepas.
    cMayFinish.resolve()
    const resC = await watchedC
    expect(resC.ok, resC.ok ? undefined : String(resC.error)).toBe(true)
    await new Promise((r) => setTimeout(r, 300))
    expect(dSettled).toBe(false)

    dMayFinish.resolve()
    const resD = await watchedD
    expect(resD.ok, resD.ok ? undefined : String(resD.error)).toBe(true)

    for (const res of [resC, resD]) {
      if (!res.ok) expect(isDeadlock(res.error)).toBe(false)
    }
    expect(commitOrder).toEqual(["C", "D"])

    // Baris terhapus memang hilang; baris baru memang ada di header sama.
    const doomed = await admin.bankStatementLine.findUnique({
      where: { id: doomedLineId },
      select: { id: true },
    })
    expect(doomed).toBeNull()
    if (!resC.ok) throw new Error("create-like gagal; id baris baru tidak ada")
    const createdLine = await admin.bankStatementLine.findUnique({
      where: { id: resC.id },
      select: { bankStatementId: true },
    })
    expect(createdLine?.bankStatementId).toBe(cdHeaderId)

    // Agregat akhir: hanya baris baru 50 debit (80 terhapus).
    const totals = await aggregateHeader(cdHeaderId)
    expect(totals.headerDebit).toBeCloseTo(totals.sumDebit, 2)
    expect(totals.headerCredit).toBeCloseTo(totals.sumCredit, 2)
    expect(totals.sumDebit).toBeCloseTo(50, 2)
    expect(totals.sumCredit).toBeCloseTo(0, 2)
  }, 60_000)

  it("update pindah header vs create-like di header tujuan: keduanya commit, tanpa deadlock 1213, total kedua header = agregat baris masing-masing", async () => {
    // H1: baris pindah 200 debit + baris tinggal 40 debit (total 240).
    // H2: baris 70 credit; create-like menambah 30 credit sesudahnya.
    const h1Id = await makeHeader("MV1")
    const h2Id = await makeHeader("MV2")
    const movingLineId = await makeLine(h1Id, 200, 0, "integ-conc MV pindah")
    await makeLine(h1Id, 40, 0, "integ-conc MV tinggal")
    await makeLine(h2Id, 0, 70, "integ-conc MV H2 awal")
    await admin.bankStatement.update({
      where: { id: h1Id },
      data: { totalDebits: 240, totalCredits: 0 },
    })
    await admin.bankStatement.update({
      where: { id: h2Id },
      data: { totalDebits: 0, totalCredits: 70 },
    })

    const uLockedHeaders = deferred()
    const cStarted = deferred()
    const uMayFinish = deferred()
    const cMayFinish = deferred()
    const commitOrder: string[] = []

    // U (update pindah header): lock baris -> lock header SORTED [H1,H2]
    // -> locking-read setting -> pindah bankStatementId=H2 -> recalc H2
    // lalu H1 (urutan recalc produksi: baru dulu, lalu lama).
    // Pemanggil meneruskan [lama, baru]; helper lockHeaders dedupe +
    // urut naik dalam satu query, sama seperti produksi. (Urutan argumen
    // tidak-terurut dari pemanggil — baru < lama — diuji unit guard
    // finance-bankstatement-header-lock-guard.test.ts: headerLockIds
    // [[3, 7]]; di sini h2Id > h1Id selalu karena dibuat sesudahnya.)
    const txU = clientB.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT id FROM bank_statement_lines WHERE id = ${movingLineId} FOR UPDATE
        `
        await lockHeaders(tx, [h1Id, h2Id])
        uLockedHeaders.resolve()
        // Tahan kedua header sampai create-like di H2 sudah mulai dan
        // (seharusnya) sedang menunggu header H2.
        await cStarted.promise
        await new Promise((r) => setTimeout(r, 300))
        await lockSettingRows(tx)
        await tx.bankStatementLine.update({
          where: { id: movingLineId },
          data: { bankStatementId: h2Id },
        })
        await recalc(tx, h2Id)
        await recalc(tx, h1Id)
        await uMayFinish.promise
      },
      { timeout: 30_000, maxWait: 15_000 },
    )

    // C (create-like di H2): lock header H2 -> locking-read setting ->
    // buat baris -> recalc H2. Wajib menunggu U yang memegang H2.
    const txC = (async () => {
      await uLockedHeaders.promise
      const pending = clientA.$transaction(
        async (tx) => {
          await lockHeader(tx, h2Id)
          await lockSettingRows(tx)
          const created = await tx.bankStatementLine.create({
            data: {
              bankStatementId: h2Id,
              date: LINE_DATE,
              description: "integ-conc MV create-like H2",
              amount: 30,
              debit: 0,
              credit: 30,
              type: "credit",
              status: "unmatched",
            },
            select: { id: true },
          })
          await recalc(tx, h2Id)
          await cMayFinish.promise
          return created.id
        },
        { timeout: 30_000, maxWait: 15_000 },
      )
      cStarted.resolve()
      return pending
    })()

    const watchedU = txU.then(
      () => {
        commitOrder.push("U")
        return { ok: true as const }
      },
      (e: unknown) => ({ ok: false as const, error: e }),
    )
    const watchedC = txC.then(
      (id) => {
        commitOrder.push("C")
        return { ok: true as const, id }
      },
      (e: unknown) => ({ ok: false as const, error: e }),
    )

    let uSettled = false
    let cSettled = false
    void watchedU.then(() => {
      uSettled = true
    })
    void watchedC.then(() => {
      cSettled = true
    })

    // Bukti serialisasi: U memegang kedua header; C belum boleh commit.
    await cStarted.promise
    await new Promise((r) => setTimeout(r, 300))
    expect(uSettled).toBe(false)
    expect(cSettled).toBe(false)

    // Lepas U dulu; C tetap belum boleh selesai sebelum gilirannya dilepas.
    uMayFinish.resolve()
    const resU = await watchedU
    expect(resU.ok, resU.ok ? undefined : String(resU.error)).toBe(true)
    await new Promise((r) => setTimeout(r, 300))
    expect(cSettled).toBe(false)

    cMayFinish.resolve()
    const resC = await watchedC
    expect(resC.ok, resC.ok ? undefined : String(resC.error)).toBe(true)

    for (const res of [resU, resC]) {
      if (!res.ok) expect(isDeadlock(res.error)).toBe(false)
    }
    expect(commitOrder).toEqual(["U", "C"])

    // Baris pindah memang kini milik H2.
    const moved = await admin.bankStatementLine.findUniqueOrThrow({
      where: { id: movingLineId },
      select: { bankStatementId: true },
    })
    expect(moved.bankStatementId).toBe(h2Id)

    // H1 akhir: hanya baris tinggal 40 debit. H2 akhir: baris pindah
    // 200 debit + credit 70 awal + 30 create-like = 100 credit.
    const totalsH1 = await aggregateHeader(h1Id)
    expect(totalsH1.headerDebit).toBeCloseTo(totalsH1.sumDebit, 2)
    expect(totalsH1.headerCredit).toBeCloseTo(totalsH1.sumCredit, 2)
    expect(totalsH1.sumDebit).toBeCloseTo(40, 2)
    expect(totalsH1.sumCredit).toBeCloseTo(0, 2)

    const totalsH2 = await aggregateHeader(h2Id)
    expect(totalsH2.headerDebit).toBeCloseTo(totalsH2.sumDebit, 2)
    expect(totalsH2.headerCredit).toBeCloseTo(totalsH2.sumCredit, 2)
    expect(totalsH2.sumDebit).toBeCloseTo(200, 2)
    expect(totalsH2.sumCredit).toBeCloseTo(100, 2)
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
