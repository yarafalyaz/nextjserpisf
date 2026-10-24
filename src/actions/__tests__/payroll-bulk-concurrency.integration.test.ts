import { Prisma, PrismaClient } from "@prisma/client"
import { afterAll, beforeAll, expect, it } from "vitest"
import { findPayrollRangeConflict } from "@/lib/reports/payroll-frequency"
import {
  createTestClient,
  deferred,
  describeIntegration,
  warnIntegrationSkip,
} from "./integration-concurrency-fixtures"

// ============================================================================
// Tes konkurensi MySQL 8 NYATA untuk penjaga irisan generateBulkPayroll
// (F-2026-10-22-076-S; gap LOW audit pasca-merge #672, t_44b6862a) —
// bukan mock.
//
// DUA LAPIS BUKTI, jangan tertukar:
// 1. FILE INI (DB nyata): transaksi di bawah meniru PERSIS segmen tulis
//    bertransaksi produksi di generateBulkPayroll
//    (src/actions/hrm.actions.ts):
//      a. `SELECT id FROM employees WHERE id IN (...) ORDER BY id
//         FOR UPDATE` — kunci baris karyawan populasi target, urutan id
//         menaik anti-deadlock;
//      b. baca ulang slip aktif di dalam transaksi (jendela kasar yang
//         sama: startDate <= rangeEnd, endDate >= rangeStart − 90 hari,
//         status selain cancelled/canceled) lalu keputusan irisan oleh
//         builder produksi yang SAMA, findPayrollRangeConflict dari
//         src/lib/reports/payroll-frequency.ts (bukan logika tiruan);
//      c. createMany({ skipDuplicates: true }) hanya untuk baris lolos;
//         karyawan kalah dicatat skip alasan "irisan" menyebut
//         conflictDocumentNo penabrak — bentuk PayrollRunSkip produksi.
//    File ini membuktikan pola itu aman di MySQL 8 sungguhan: transaksi
//    kedua benar-benar tertahan di kunci baris sampai transaksi pertama
//    commit, lalu cek ulangnya melihat slip pemenang. Mock Prisma tidak
//    bisa memberlakukan SELECT ... FOR UPDATE, jadi bukti perilaku DB
//    hanya bisa dari sini.
// 2. UNIT GUARD MOCK (hrm.actions.test.ts, describe "penjaga irisan
//    bertransaksi"): memverifikasi URUTAN PANGGILAN action produksi yang
//    sebenarnya (lock:1,2 -> txFindMany -> txCreateMany). Guard itu tidak
//    menyentuh DB nyata, jadi sendirian ia tidak membuktikan perilaku
//    lock apa pun. Kombinasi keduanya = bukti utuh.
//
// BATAS JUJUR: file ini SENGAJA tidak memanggil Server Action produksi
// langsung — action butuh sesi NextAuth (requirePermission), estimasi
// BPJS/TER dari master, generateDocumentNumberBatch, logActivity, dan
// revalidatePath, dan repo tidak punya harness action-test DB nyata
// (semua tes action eksisting memakai Prisma termock; lihat juga header
// bank-statement-concurrency.integration.test.ts). Yang diuji di sini
// adalah level transaksi yang sama persis dengan segmen penjaga irisan
// produksi; langkah di luar transaksi itu (estimasi, nomor dokumen,
// log) tidak menyentuh penjaga irisan dan tidak ditiru. Satu-satunya
// tambahan non-produksi adalah barrier tes (deferred) yang menahan
// transaksi sesaat SESUDAH cek ulang, saat kunci masih dipegang —
// setara eksekusi yang lambat di titik itu, tidak mengubah semantik,
// dan justru membuat interleaving berbahaya deterministik: tanpa kunci,
// transaksi kedua ikut lolos cek ulang sebelum siapa pun createMany.
//
// Skenario (rentang beririsan TAK IDENTIK, karyawan tumpang-tindih):
//   Run A: 2099-03-01..2099-03-15 untuk [shared, onlyA]
//   Run B: 2099-03-10..2099-03-25 untuk [shared, onlyB]
// A memegang kunci lebih dulu dan ditahan sesudah cek ulangnya. Selama
// itu B tidak boleh melewati kunci (bukti: sinyal cek ulang B belum
// menyala). Sesudah A commit, B lolos kunci, cek ulangnya menabrak slip
// A untuk shared -> skip "irisan"; onlyB tetap terbit.
// Hasil akhir wajib: shared tepat 1 slip (milik A), onlyA 1, onlyB 1.
//
// Falsifikasi (manual, tercatat di PR t_44b6862a): menghapus baris lock
// FOR UPDATE pada tiruan -> sinyal cek ulang B menyala saat A ditahan
// (MERAH); menghapus cek ulang -> B ikut menerbitkan shared (MERAH).
//
// Env: INTEGRATION_DB_URL wajib diset eksplisit, mis.
//   INTEGRATION_DB_URL='mysql://root@127.0.0.1:3309/silengkap?allowPublicKeyRetrieval=true' \
//     npx vitest run src/actions/__tests__/payroll-bulk-concurrency.integration.test.ts
// Tanpa env itu seluruh suite SKIP (skip TIDAK dihitung lulus; CI
// db-integration menggagalkan job bila output mengandung 'skipped').
// DB harus sudah termigrasi (fixture hanya butuh tabel employees +
// payrolls). Engine target: MySQL 8.
// ============================================================================

warnIntegrationSkip("payroll-bulk-concurrency")

type Tx = Prisma.TransactionClient

interface BulkRow {
  documentNo: string
  employeeId: number
  period: string
  startDate: Date
  endDate: Date
  status: string
}

interface BulkRunResult {
  count: number
  skips: { employeeId: number; reason: "irisan"; conflictDocumentNo: string | null }[]
}

describeIntegration("konkurensi MySQL 8 nyata: generateBulkPayroll penjaga irisan", () => {
  // Client terpisah per "run" supaya pool koneksi / sesi MySQL benar-benar
  // berbeda. $transaction interaktif Prisma meminjam satu koneksi per
  // transaksi, jadi dua $transaction bersamaan = dua koneksi.
  let admin: PrismaClient
  let clientA: PrismaClient
  let clientB: PrismaClient

  // Dibuat berurutan: shared ber-id terkecil, jadi kedua run mengunci
  // baris shared lebih dulu (urutan id menaik) — kontensi langsung.
  let sharedId = 0
  let onlyAId = 0
  let onlyBId = 0
  const fixtureEmployeeIds: number[] = []

  const RANGE_A = {
    start: new Date("2099-03-01T00:00:00.000Z"),
    end: new Date("2099-03-15T00:00:00.000Z"),
  }
  const RANGE_B = {
    start: new Date("2099-03-10T00:00:00.000Z"),
    end: new Date("2099-03-25T00:00:00.000Z"),
  }

  beforeAll(async () => {
    admin = createTestClient()
    clientA = createTestClient()
    clientB = createTestClient()

    const stamp = Date.now()
    const mkEmployee = async (tag: string) => {
      const emp = await admin.employee.create({
        data: {
          employeeNo: `INTEG-PAY-${stamp}-${tag}`,
          name: `Integ Pay Conc ${tag} ${stamp}`,
          joinDate: new Date("2099-01-01T00:00:00.000Z"),
          isActive: true,
        },
        select: { id: true },
      })
      fixtureEmployeeIds.push(emp.id)
      return emp.id
    }
    sharedId = await mkEmployee("SH")
    onlyAId = await mkEmployee("OA")
    onlyBId = await mkEmployee("OB")
  }, 30_000)

  afterAll(async () => {
    // Cleanup scoped ke fixture sendiri (bukan deleteMany global).
    try {
      if (fixtureEmployeeIds.length) {
        await admin.payroll.deleteMany({
          where: { employeeId: { in: fixtureEmployeeIds } },
        })
        await admin.employee.deleteMany({
          where: { id: { in: fixtureEmployeeIds } },
        })
      }
    } finally {
      await Promise.all([
        admin.$disconnect(),
        clientA.$disconnect(),
        clientB.$disconnect(),
      ])
    }
  })

  /**
   * Tiruan segmen tulis bertransaksi generateBulkPayroll, urutan persis
   * produksi: lock employees FOR UPDATE (id menaik) -> baca ulang slip
   * aktif + findPayrollRangeConflict -> createMany skipDuplicates.
   * `control` hanya barrier tes: sinyal sesudah cek ulang + tahan
   * sebelum createMany, keduanya saat kunci masih dipegang.
   */
  async function runBulkTransaction(
    client: PrismaClient,
    rangeStart: Date,
    rangeEnd: Date,
    rows: BulkRow[],
    control?: { onRechecked?: () => void; holdBeforeCreate?: Promise<void> },
  ): Promise<BulkRunResult> {
    return client.$transaction(
      async (tx: Tx) => {
        const lockIds = [...new Set(rows.map((r) => r.employeeId))].sort((a, b) => a - b)
        await tx.$queryRaw`SELECT id FROM employees WHERE id IN (${Prisma.join(lockIds)}) ORDER BY id FOR UPDATE`
        const freshByEmployee = new Map<number, { startDate: Date; endDate: Date; status: string; documentNo: string }[]>()
        if (lockIds.length > 0) {
          const fresh = await tx.payroll.findMany({
            where: {
              employeeId: { in: lockIds },
              status: { notIn: ["cancelled", "canceled"] },
              startDate: { lte: rangeEnd },
              endDate: { gte: new Date(rangeStart.getTime() - 90 * 24 * 60 * 60 * 1000) },
            },
            select: { employeeId: true, startDate: true, endDate: true, status: true, documentNo: true },
          })
          for (const slip of fresh) {
            if (slip.employeeId == null) continue
            const arr = freshByEmployee.get(slip.employeeId) ?? []
            arr.push(slip)
            freshByEmployee.set(slip.employeeId, arr)
          }
        }
        const skips: BulkRunResult["skips"] = []
        const keptRows: BulkRow[] = []
        for (const row of rows) {
          const conflict = findPayrollRangeConflict(
            freshByEmployee.get(row.employeeId) ?? [],
            rangeStart,
            rangeEnd,
          )
          if (conflict) {
            skips.push({
              employeeId: row.employeeId,
              reason: "irisan",
              conflictDocumentNo: conflict.documentNo,
            })
          } else {
            keptRows.push(row)
          }
        }
        control?.onRechecked?.()
        if (control?.holdBeforeCreate) await control.holdBeforeCreate
        if (keptRows.length === 0) return { count: 0, skips }
        await tx.payroll.createMany({ data: keptRows, skipDuplicates: true })
        return { count: keptRows.length, skips }
      },
      { timeout: 30_000, maxWait: 15_000 },
    )
  }

  function rowFor(runTag: string, employeeId: number, range: typeof RANGE_A): BulkRow {
    return {
      documentNo: `INTEG-PAY-${runTag}-${employeeId}`,
      employeeId,
      period: "2099-03",
      startDate: range.start,
      endDate: range.end,
      status: "draft",
    }
  }

  it("dua run konkuren rentang beririsan tak identik: shared tepat satu slip, kalah skip irisan, non-irisan tetap terbit", async () => {
    const aRechecked = deferred()
    const bRechecked = deferred()
    const aMayCreate = deferred()
    const commitOrder: string[] = []
    let bRecheckedFired = false
    void bRechecked.promise.then(() => {
      bRecheckedFired = true
    })

    // Run A: mengunci [shared, onlyA] lebih dulu, cek ulang (bersih),
    // lalu ditahan sebelum createMany — kunci masih dipegang.
    const txA = runBulkTransaction(
      clientA,
      RANGE_A.start,
      RANGE_A.end,
      [rowFor("A", sharedId, RANGE_A), rowFor("A", onlyAId, RANGE_A)],
      { onRechecked: () => aRechecked.resolve(), holdBeforeCreate: aMayCreate.promise },
    )

    // Run B mulai hanya sesudah A melewati cek ulangnya. Bila kunci
    // produksi bekerja, B tertahan di SELECT ... FOR UPDATE atas baris
    // shared dan TIDAK boleh mencapai cek ulangnya selama A menahan.
    const txB = (async () => {
      await aRechecked.promise
      return runBulkTransaction(
        clientB,
        RANGE_B.start,
        RANGE_B.end,
        [rowFor("B", sharedId, RANGE_B), rowFor("B", onlyBId, RANGE_B)],
        { onRechecked: () => bRechecked.resolve() },
      )
    })()

    const watchedA = txA.then(
      (result) => {
        commitOrder.push("A")
        return { ok: true as const, result }
      },
      (e: unknown) => ({ ok: false as const, error: e }),
    )
    const watchedB = txB.then(
      (result) => {
        commitOrder.push("B")
        return { ok: true as const, result }
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

    // Bukti serialisasi, bukan timing kasar: A sudah cek ulang dan
    // menahan kunci; B sudah dimulai tetapi sinyal cek ulangnya belum
    // boleh menyala (ia menunggu kunci baris shared di MySQL).
    // Cabut lock pada tiruan -> sinyal B menyala di sini -> MERAH.
    await aRechecked.promise
    await new Promise((r) => setTimeout(r, 500))
    expect(bRecheckedFired).toBe(false)
    expect(aSettled).toBe(false)
    expect(bSettled).toBe(false)

    // Lepas A: menerbitkan shared + onlyA, lalu commit.
    aMayCreate.resolve()
    const resA = await watchedA
    expect(resA.ok, resA.ok ? undefined : String(resA.error)).toBe(true)
    if (!resA.ok) throw new Error("run A gagal")
    expect(resA.result.count).toBe(2)
    expect(resA.result.skips).toEqual([])

    // B kini lolos kunci; cek ulangnya wajib menabrak slip A untuk
    // shared (skip irisan menyebut nomor slip A) dan onlyB tetap terbit.
    // Cabut cek ulang pada tiruan -> B ikut menerbitkan shared -> MERAH
    // pada assert count/skips di bawah dan jumlah slip shared final.
    const resB = await watchedB
    expect(resB.ok, resB.ok ? undefined : String(resB.error)).toBe(true)
    if (!resB.ok) throw new Error("run B gagal")
    expect(resB.result.count).toBe(1)
    expect(resB.result.skips).toEqual([
      {
        employeeId: sharedId,
        reason: "irisan",
        conflictDocumentNo: `INTEG-PAY-A-${sharedId}`,
      },
    ])

    // Urutan commit deterministik dari konstruksi barrier di atas.
    expect(commitOrder).toEqual(["A", "B"])

    // Keadaan akhir di DB (dibaca di luar kedua transaksi): karyawan
    // tumpang-tindih tepat SATU slip aktif — milik pemenang A dengan
    // rentang A; karyawan non-irisan masing-masing tetap terbit.
    const sharedSlips = await admin.payroll.findMany({
      where: { employeeId: sharedId },
      select: { documentNo: true, startDate: true, endDate: true, status: true },
    })
    expect(sharedSlips).toHaveLength(1)
    expect(sharedSlips[0].documentNo).toBe(`INTEG-PAY-A-${sharedId}`)
    expect(sharedSlips[0].startDate.getTime()).toBe(RANGE_A.start.getTime())
    expect(sharedSlips[0].endDate.getTime()).toBe(RANGE_A.end.getTime())

    const onlyASlips = await admin.payroll.findMany({
      where: { employeeId: onlyAId },
      select: { documentNo: true },
    })
    expect(onlyASlips.map((s) => s.documentNo)).toEqual([`INTEG-PAY-A-${onlyAId}`])

    const onlyBSlips = await admin.payroll.findMany({
      where: { employeeId: onlyBId },
      select: { documentNo: true, startDate: true, endDate: true },
    })
    expect(onlyBSlips).toHaveLength(1)
    expect(onlyBSlips[0].documentNo).toBe(`INTEG-PAY-B-${onlyBId}`)
    expect(onlyBSlips[0].startDate.getTime()).toBe(RANGE_B.start.getTime())
    expect(onlyBSlips[0].endDate.getTime()).toBe(RANGE_B.end.getTime())
  }, 60_000)
})
