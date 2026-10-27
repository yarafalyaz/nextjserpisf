import "dotenv/config"
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/db/prisma"
import { installBaseData } from "@/lib/setup/install"
import { JournalService } from "@/lib/services/journal.service"

/**
 * TASK-023 — Bukti konkurensi di DB NYATA (bukan mock transaksi).
 *
 * Klaim yang dibuktikan:
 *
 * 1. Wizard setup (`installBaseData`, TASK-021): transaksi Serializable +
 *    `SELECT ... FOR UPDATE` pada baris singleton `system_settings`, lalu
 *    hitung ulang `tx.user.count()` di dalam transaksi sebelum seeding.
 *    Dua panggilan bersamaan pada DB kosong harus menghasilkan TEPAT SATU
 *    pemenang; yang kalah gagal bersih ('Aplikasi sudah terpasang.' atau
 *    kegagalan serialisasi InnoDB) tanpa admin/pegawai yatim.
 *    Tes mock di `install.test.ts` hanya membuktikan logika; tes ini
 *    membuktikan perilaku InnoDB/MariaDB di bawah dua transaksi nyata.
 *
 * 2. Posting jurnal (`JournalService.createJournal`): transaksi
 *    Serializable + validasi debit=kredit, dijaga fisik oleh unique
 *    `journals_active_reference_unique` pada kolom generated
 *    `active_reference_key` (referenceType#referenceId untuk jurnal aktif).
 *    Dua posting paralel pada (referenceType, referenceId) yang sama harus
 *    menghasilkan TEPAT SATU jurnal POSTED yang seimbang; yang kalah
 *    ditolak (P2002). Berlaku juga untuk reversal ganda satu jurnal.
 *
 * Pola repo (lihat `inventory-integration.test.ts`): suite ini opt-in.
 * Tanpa `RUN_DB_INTEGRATION=1` — atau bila DB tidak terjangkau — setiap
 * tes skip bersih (return + warn), tidak pernah gagal.
 *
 * Cara menjalankan (DB scratch yang sudah di-migrate, HARUS kosong untuk
 * tes wizard):
 *
 *   DATABASE_URL="mysql://user:pass@host:3306/silengkap_test" \
 *     RUN_DB_INTEGRATION=1 \
 *     npx vitest run src/lib/__tests__/db-concurrency.integration.test.ts
 *
 * HASIL NYATA (27 Okt 2026, MySQL 8.0 scratch `silengkap_test` hasil
 * `prisma migrate deploy`, dijalankan dari container app): 3/3 HIJAU.
 * Catatan jujur: pihak kalah wizard menerima P2034 Prisma
 * ("Transaction failed due to a write conflict or a deadlock"), BUKAN
 * error domain 'Aplikasi sudah terpasang.' — Serializable membatalkan
 * transaksi kalah sebelum hitung-ulang user tercapai. Invariannya tetap
 * terbukti (tepat 1 user/pegawai, tanpa yatim); yang kalah hanya melihat
 * pesan teknis lewat `runSetup`. Dilaporkan sebagai temuan terpisah;
 * kode produksi tidak diubah dari tes ini.
 * Perhatian provisioning: scratch WAJIB hasil `migrate deploy`. Pada DB
 * hasil `prisma db push`, kolom `active_reference_key` bukan GENERATED
 * sehingga unique jurnal tidak pernah terpicu dan tes jurnal gagal —
 * itu artefak provisioning, bukan perilaku produksi.
 *
 * KEAMANAN: tes wizard MEMUTASI database (seed penuh + cleanup TRUNCATE).
 * Ia hanya berjalan bila nama database pada DATABASE_URL mengandung
 * `test`, `scratch`, `conc`, atau `ci`; di luar itu ia skip. Jangan
 * pernah menjalankannya melawan DB dev/produksi.
 */

let dbUp = false
beforeAll(async () => {
  if (process.env.RUN_DB_INTEGRATION !== "1") return
  try {
    await prisma.$queryRaw`SELECT 1`
    dbUp = true
  } catch {
    dbUp = false
  }
})
afterAll(async () => {
  try {
    await prisma.$disconnect()
  } catch {
    /* abaikan */
  }
})

function dbName(): string {
  const url = process.env.DATABASE_URL ?? ""
  const match = url.match(/\/([^/?]+)(\?|$)/)
  return match?.[1] ?? ""
}

function isScratchDb(): boolean {
  return /test|scratch|conc|ci/i.test(dbName())
}

/** Tabel yang di-seed `installBaseData` — dibersihkan sesudah tes wizard. */
const INSTALL_TABLES = [
  "employees",
  "users",
  "_RolePermissions",
  "_UserRoles",
  "roles",
  "permissions",
  "module_actions",
  "modules",
  "accounts",
  "withholding_tax_types",
  "warehouses",
  "departments",
  "positions",
  "payment_methods",
  "shipping_methods",
  "unit_of_measures",
  "expense_categories",
  "document_sequences",
  "system_settings",
]

async function wipeInstallTables(): Promise<void> {
  // Semua pernyataan harus berbagi SATU koneksi (transaksi interaktif),
  // kalau tidak SET FOREIGN_KEY_CHECKS mendarat di koneksi pool lain dan
  // TRUNCATE tetap ditolak 1701 oleh constraint dari tabel lain.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0")
    try {
      for (const table of INSTALL_TABLES) {
        await tx.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``)
      }
    } finally {
      await tx.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1")
    }
  })
}

function errorText(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`
  return String(err)
}

describe("Konkurensi DB nyata (TASK-023)", () => {
  it(
    "wizard setup: dua installBaseData paralel → tepat satu admin, kalah gagal bersih",
    async () => {
      if (process.env.RUN_DB_INTEGRATION !== "1") {
        console.warn("RUN_DB_INTEGRATION tidak aktif — lewati tes konkurensi wizard")
        return
      }
      if (!dbUp) {
        console.warn("DB tidak terjangkau — lewati tes konkurensi wizard")
        return
      }
      if (!isScratchDb()) {
        console.warn(
          `Nama database "${dbName()}" bukan DB scratch (test/scratch/conc/ci) — lewati tes wizard demi keamanan`,
        )
        return
      }
      const userCount = await prisma.user.count()
      if (userCount > 0) {
        console.warn(
          `DB scratch tidak kosong (${userCount} user) — lewati tes wizard; kosongkan dulu`,
        )
        return
      }

      const stamp = Date.now()
      const inputA = {
        companyName: "PT Konkurensi A",
        adminName: "Admin A",
        adminEmail: `conc-a-${stamp}@isf.test`,
        adminPassword: "rahasia-konkuren-a1",
      }
      const inputB = {
        companyName: "PT Konkurensi B",
        adminName: "Admin B",
        adminEmail: `conc-b-${stamp}@isf.test`,
        adminPassword: "rahasia-konkuren-b1",
      }

      try {
        // Barrier: kedua panggilan dimulai pada tick yang sama tanpa await
        // di antaranya, agar kedua transaksi benar-benar tumpang tindih.
        const results = await Promise.allSettled([
          installBaseData(inputA),
          installBaseData(inputB),
        ])

        const fulfilled = results.filter((r) => r.status === "fulfilled")
        const rejected = results.filter((r) => r.status === "rejected")
        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)

        // Yang kalah gagal bersih: error domain wizard, atau kegagalan
        // serialisasi/deadlock InnoDB (1213/1205/P2034) — keduanya berarti
        // transaksi kalah ter-rollback utuh, bukan sukses parsial.
        const loserReason = (rejected[0] as PromiseRejectedResult).reason
        expect(errorText(loserReason)).toMatch(
          /sudah terpasang|Deadlock|Lock wait timeout|P2034|40001/i,
        )

        // Tepat satu admin + satu pegawai pendamping, tanpa baris yatim.
        const users = await prisma.user.findMany({
          select: { id: true, email: true },
        })
        expect(users).toHaveLength(1)
        expect([inputA.adminEmail, inputB.adminEmail]).toContain(users[0].email)

        const employees = await prisma.employee.findMany({
          select: { userId: true },
        })
        expect(employees).toHaveLength(1)
        expect(employees[0].userId).toBe(users[0].id)

        const settingsCount = await prisma.systemSetting.count()
        expect(settingsCount).toBe(1)
      } finally {
        await wipeInstallTables()
      }
    },
    120_000,
  )

  it(
    "posting jurnal: dua createJournal paralel pada referensi sama → tepat satu jurnal POSTED seimbang",
    async () => {
      if (process.env.RUN_DB_INTEGRATION !== "1") {
        console.warn("RUN_DB_INTEGRATION tidak aktif — lewati tes konkurensi jurnal")
        return
      }
      if (!dbUp) {
        console.warn("DB tidak terjangkau — lewati tes konkurensi jurnal")
        return
      }

      const stamp = Date.now()
      const referenceType = "ConcurrencyProbe"
      const referenceId = stamp % 2_000_000_000
      const journalNumbers = [`JU-CONC-${stamp}-A`, `JU-CONC-${stamp}-B`]
      const accA = await prisma.account.create({
        data: { code: `ITC${stamp}A`, name: `IT Conc A ${stamp}`, type: "ASSET" },
      })
      const accB = await prisma.account.create({
        data: { code: `ITC${stamp}B`, name: `IT Conc B ${stamp}`, type: "LIABILITY" },
      })

      try {
        const service = new JournalService(prisma)
        const post = (journalNumber: string) =>
          service.createJournal({
            journalNumber,
            transactionDate: new Date(),
            referenceType,
            referenceId,
            description: "Probe konkurensi TASK-023",
            type: "GENERAL",
            entries: [
              { accountId: accA.id, debit: 100_000, credit: 0 },
              { accountId: accB.id, debit: 0, credit: 100_000 },
            ],
          })

        const results = await Promise.allSettled([
          post(journalNumbers[0]),
          post(journalNumbers[1]),
        ])
        const fulfilled = results.filter((r) => r.status === "fulfilled")
        const rejected = results.filter((r) => r.status === "rejected")
        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)

        // Yang kalah ditolak constraint fisik (P2002 pada
        // journals_active_reference_unique) atau serialisasi — bukan
        // jurnal ganda yang lolos.
        const loserReason = (rejected[0] as PromiseRejectedResult).reason
        expect(errorText(loserReason)).toMatch(
          /Unique constraint|P2002|Deadlock|Lock wait timeout|P2034|40001/i,
        )

        const journals = await prisma.journal.findMany({
          where: { referenceType, referenceId },
          include: { entries: true },
        })
        expect(journals).toHaveLength(1)
        const winner = journals[0]
        expect(winner.status).toBe("POSTED")
        expect(Number(winner.totalDebit)).toBe(100_000)
        expect(Number(winner.totalCredit)).toBe(100_000)
        const entryDebit = winner.entries.reduce((s, e) => s + Number(e.debit), 0)
        const entryCredit = winner.entries.reduce((s, e) => s + Number(e.credit), 0)
        expect(entryDebit).toBe(entryCredit)
      } finally {
        await prisma.journal.deleteMany({
          where: { journalNumber: { in: journalNumbers } },
        })
        await prisma.account.deleteMany({
          where: { id: { in: [accA.id, accB.id] } },
        })
      }
    },
    60_000,
  )

  it(
    "reversal jurnal: dua reverseJournal paralel → tepat satu reversal, pasangan neto nol",
    async () => {
      if (process.env.RUN_DB_INTEGRATION !== "1") {
        console.warn("RUN_DB_INTEGRATION tidak aktif — lewati tes konkurensi reversal")
        return
      }
      if (!dbUp) {
        console.warn("DB tidak terjangkau — lewati tes konkurensi reversal")
        return
      }

      const stamp = Date.now()
      const originNumber = `JU-CONC-${stamp}-ORIGIN`
      const reversalNumbers = [`JU-CONC-${stamp}-REV-A`, `JU-CONC-${stamp}-REV-B`]
      const accA = await prisma.account.create({
        data: { code: `ITR${stamp}A`, name: `IT Rev A ${stamp}`, type: "ASSET" },
      })
      const accB = await prisma.account.create({
        data: { code: `ITR${stamp}B`, name: `IT Rev B ${stamp}`, type: "LIABILITY" },
      })

      try {
        const service = new JournalService(prisma)
        const origin = await service.createJournal({
          journalNumber: originNumber,
          transactionDate: new Date(),
          referenceType: "ConcurrencyProbeReversal",
          referenceId: stamp % 2_000_000_000,
          type: "GENERAL",
          entries: [
            { accountId: accA.id, debit: 50_000, credit: 0 },
            { accountId: accB.id, debit: 0, credit: 50_000 },
          ],
        })

        const results = await Promise.allSettled([
          service.reverseJournal(origin.id, reversalNumbers[0]),
          service.reverseJournal(origin.id, reversalNumbers[1]),
        ])
        const fulfilled = results.filter((r) => r.status === "fulfilled")
        const rejected = results.filter((r) => r.status === "rejected")
        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)
        const loserReason = (rejected[0] as PromiseRejectedResult).reason
        expect(errorText(loserReason)).toMatch(
          /sudah di-reverse|tidak bisa dibalik|Unique constraint|P2002|Deadlock|Lock wait timeout|P2034|40001/i,
        )

        const after = await prisma.journal.findUniqueOrThrow({
          where: { id: origin.id },
        })
        expect(after.status).toBe("REVERSED")

        const reversals = await prisma.journal.findMany({
          where: { referenceType: "Journal", referenceId: origin.id },
        })
        expect(reversals).toHaveLength(1)
        // Pasangan reversal neto nol: total lawan meniadakan jurnal asal.
        expect(Number(reversals[0].totalDebit)).toBe(Number(after.totalCredit))
        expect(Number(reversals[0].totalCredit)).toBe(Number(after.totalDebit))
      } finally {
        await prisma.journal.deleteMany({
          where: {
            journalNumber: { in: [originNumber, ...reversalNumbers] },
          },
        })
        await prisma.account.deleteMany({
          where: { id: { in: [accA.id, accB.id] } },
        })
      }
    },
    60_000,
  )
})
