import { afterAll, describe, expect, it } from "vitest"
import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db/prisma"

/**
 * Kabar state penomoran tersimpan (putaran 251) — READ-ONLY, gate
 * `RUN_DB_INTEGRATION=1`, aman terhadap DB dev yang dirawat tangan.
 *
 * `findMaxSequence` (src/lib/utils/document-number.ts) hanya hitung on-the-fly
 * sebagai FLOOR; kunci counter yang tersimpan di `document_sequences` harus
 * MUTAKHIR terhadap nomor yang sudah terbit di tabel data. Bila DB pernah
 * di-restore parsial, counter yang lebih tua dari data akan menyebabkan
 * nomor dobel/baru-nabrak-unique. Invarian yang dijaga:
 *
 *  1. Format KOMPLEKS `NNN/PREFIX/CODE/MM/YYYY` → kunci counter
 *     `PREFIX-YYYY-MM` wajib ada dan `current_value >= max(NNN)` per
 *     perserikat yang terdeteksi. Pemindaian mencakup baris soft-deleted
 *     (kolom nomor @unique, persis komentar floor di document-number.ts).
 *  2. Format SIMPLE `PREFIX-0001` → kunci counter = prefix itu sendiri
 *     wajib ada dan `current_value >= max(NNNN)`.
 *  3. Jurnal punya tiga rezim sah: digit-first kompleks, stamp slash
 *     `Pfx/NN/timestamp-NNNN` (tanggal dari timestamp, kunci
 *     `JRN-<pfx>-YYYY-MM`), dan stamp polos `JRN-YYYYMM-NNNNN`
 *     (kunci `JRN-YYYY-MM`). Baris hidup di luar semuanya merah.
 *  4. Baris di luar ketiga format hanya boleh dengan allowlist dua arah
 *     (`NUMBERING_EXCEPTIONS`) — konvensi penjaga repo.
 */

const SKIP = process.env.RUN_DB_INTEGRATION !== "1"

interface Pair {
  table: string
  column: string
  softDeleted: boolean
}

/** Kolom nomor dokumen format kompleks/simple. */
const DOCUMENT_PAIRS: Pair[] = [
  { table: "quotations", column: "document_no", softDeleted: true },
  { table: "sales_invoices", column: "document_no", softDeleted: true },
  { table: "sales_orders", column: "document_no", softDeleted: true },
  { table: "sales_payments", column: "document_no", softDeleted: false },
  { table: "sales_returns", column: "document_no", softDeleted: false },
  { table: "purchase_orders", column: "document_no", softDeleted: true },
  { table: "purchase_requests", column: "document_no", softDeleted: false },
  { table: "purchase_returns", column: "document_no", softDeleted: false },
  { table: "goods_receipts", column: "document_no", softDeleted: false },
  { table: "vendor_bills", column: "document_no", softDeleted: true },
  { table: "vendor_payments", column: "document_no", softDeleted: true },
  { table: "delivery_orders", column: "document_no", softDeleted: false },
  { table: "down_payments", column: "document_no", softDeleted: false },
  { table: "stock_adjustments", column: "document_no", softDeleted: true },
  { table: "material_issues", column: "document_no", softDeleted: false },
  { table: "expenses", column: "document_no", softDeleted: false },
  { table: "petty_cash", column: "document_no", softDeleted: true },
  { table: "projects", column: "document_no", softDeleted: false },
  { table: "work_orders", column: "document_no", softDeleted: false },
  { table: "production_orders", column: "document_no", softDeleted: false },
  { table: "inventory_transfers", column: "document_no", softDeleted: false },
  { table: "material_requests", column: "document_no", softDeleted: false },
  { table: "stock_moves", column: "document_no", softDeleted: false },
]

/** Kolom kode/nomor format simple (master + dokumen ber-prefiks). */
const SIMPLE_PAIRS: Pair[] = [
  { table: "customers", column: "code", softDeleted: true },
  { table: "vendors", column: "code", softDeleted: true },
  { table: "employees", column: "employee_no", softDeleted: true },
  { table: "positions", column: "code", softDeleted: false },
  { table: "leads", column: "lead_number", softDeleted: true },
  { table: "cheques", column: "document_no", softDeleted: true },
  { table: "bank_transfers", column: "document_no", softDeleted: true },
  { table: "tax_payments", column: "document_no", softDeleted: true },
]

const JOURNAL_PAIR: Pair = { table: "journals", column: "journal_number", softDeleted: false }

/**
 * Nomor di luar rezim kanonis yang sengaja dipakai fixture seed E2E agar
 * spec bisa mencari teksnya langsung. Dihitung dua arah: jika nomor itu
 * kembali ke rezim kanonis (atau fixture dihapus dari DB), entri wajib
 * dipangkas persis konvensi penjaga repo.
 */
const NUMBERING_EXCEPTIONS = new Set([
  "purchase_orders/E2E-PO-CHAIN",
  "stock_moves/E2E-GR-POSTING",
  "vendors/E2E-BUY-VENDOR",
  "vendors/E2E-VEND",
  // Kode pelanggan manual (bukan output layanan penomoran): FIX-021 punya
  // format ITF021-<timestamp> langsung dari entri manual — tanpa kunci
  // counter. Entri dua arah: kalau kode itu diedit ke format kanonis,
  // entri wajib dipangkas.
  "customers/ITF021-1793412995628",
])

const exceptionKey = (table: string, value: string | null): string =>
  `${table}/${(value ?? "").trim()}`

/** `010/SO/IRO/10/2026` → seq 10, keluarga `SO-2026-10`. */
const COMPLEX_RE = /^(\d+)\/([A-Z0-9]+)\/[A-Z0-9]+\/(\d{2})\/(\d{4})$/
/** `EMP-00001` → prefix `EMP`, seq 1. */
const SIMPLE_RE = /^([A-Z0-9]+)-(\d+)$/

interface IssuedCell {
  maxSeq: number
  examples: string[]
}

describe.skipIf(SKIP)("kabar state penomoran tersimpan (DB, read-only)", () => {
  afterAll(async () => {
    await prisma.$disconnect()
  })

  /** Baca semua pasangan nomor → teks (SELECT murni). */
  async function loadRawRows(pair: Pair): Promise<Array<{ id: number; numberValue: string | null }>> {
    return await prisma.$queryRaw<Array<{ id: number; numberValue: string | null }>>(
      Prisma.sql`SELECT id, ${Prisma.raw(`\`${pair.column}\``)} AS numberValue
                 FROM ${Prisma.raw(`\`${pair.table}\``)}
                ${pair.softDeleted ? Prisma.sql`WHERE deleted_at IS NULL` : Prisma.empty}`,
    )
  }

  async function loadCounter(): Promise<Map<string, number>> {
    const rows = await prisma.$queryRaw<Array<{ key: string; current_value: number }>>(
      Prisma.sql`SELECT \`key\`, current_value FROM document_sequences`,
    )
    return new Map(rows.map((row) => [row.key, row.current_value]))
  }

  it("kunjungan keluarga nomor kompleks & simple: kunci counter ada, tak tertinggal dari nomor terbit", async () => {
    const counter = await loadCounter()

    // Perserikat sempat jatuh ke nama-kolom yang tidak sama; jika itu
    // terjadi, error kesah di sini lebih bermakna dari hasil dobel.
    const issued = new Map<string, IssuedCell>()
    const unexpected: string[] = []
    const bumpIssued = (key: string, seq: number, where: string) => {
      const bucket = issued.get(key) ?? { maxSeq: 0, examples: [] }
      if (seq > bucket.maxSeq) bucket.maxSeq = seq
      if (bucket.examples.length < 3) bucket.examples.push(`${where} #${key}=${seq}`)
      issued.set(key, bucket)
    }

    for (const pair of DOCUMENT_PAIRS) {
      for (const row of await loadRawRows(pair)) {
        const value = row.numberValue?.trim() ?? ""
        if (value === "") continue

        const complexMatch = COMPLEX_RE.exec(value)
        if (complexMatch) {
          const [, seq, prefix, mm, yyyy] = complexMatch
          bumpIssued(`${prefix}-${yyyy}-${mm}`, Number(seq), pair.table)
          continue
        }
        const simpleMatch = SIMPLE_RE.exec(value)
        if (simpleMatch) {
          const [, prefix, seq] = simpleMatch
          bumpIssued(`${prefix}`, Number(seq), pair.table)
          continue
        }
        if (!NUMBERING_EXCEPTIONS.has(exceptionKey(pair.table, value))) {
          unexpected.push(exceptionKey(pair.table, value))
        }
      }
    }

    for (const pair of SIMPLE_PAIRS) {
      for (const row of await loadRawRows(pair)) {
        const value = row.numberValue?.trim() ?? ""
        if (value === "") continue

        const simpleMatch = SIMPLE_RE.exec(value)
        if (simpleMatch) {
          const [, prefix, seq] = simpleMatch
          // Kode manual (nomor layanan selalu lahir BERSAMA kunci counter-nya)
          // di-hijaukan hanya via allowlist DUA ARAH.
          if (!counter.has(prefix) && NUMBERING_EXCEPTIONS.has(exceptionKey(pair.table, value))) continue
          bumpIssued(`${prefix}`, Number(seq), pair.table)
          continue
        }
        if (!NUMBERING_EXCEPTIONS.has(exceptionKey(pair.table, value))) {
          unexpected.push(exceptionKey(pair.table, value))
        }
      }
    }

    expect(unexpected).toEqual([])

    // Kunci counter yang tidak tersedia untuk keluarga yang sedang
    // terbentuk dinormalisasi sebagai out-of-regime juga: nomore keluarga
    // sah pasti lahir BERSAMA kunci counter-nya (upsert di layanan).
    // Keluarga dengan kunci hilang = baris nomor manual, bukan restore.
    const withoutCounter = [...issued.keys()].filter((key) => !counter.has(key))
    expect(
      withoutCounter,
      `keluarga nomor tanpa kunci counter (nomor manual): ${[...withoutCounter].join(", ")}`,
    ).toEqual([])

    for (const [key, bucket] of issued) {
      const current = counter.get(key)
      expect(
        current as number,
        `kunci counter \`${key}\` TERTINGGAL: tersimpan ${current}, nomor terbit max ${bucket.maxSeq} (${bucket.examples.join("; ")})`,
      ).toBeGreaterThanOrEqual(bucket.maxSeq)
    }
  })

  it("jurnal: tiga rezim nomor sah, counter perserikat tak tertinggal dari nomor terbit", async () => {
    const counter = await loadCounter()
    const rows = await loadRawRows(JOURNAL_PAIR)

    // Rezonora journal:
    //  (a) `005/JRN/IRO/10/2026`       → kunci `JRN-2026-10`, seq 5
    //  (b) `PAY/19/20261031155159-0008` → kunci `JRN-PAY-2026-10`, seq 8 (stamp slash)
    //  (c) `JRN-202610-00006`          → kunci `JRN-2026-10`, seq 6  (stamp polos)
    const stampSlashRe = /^([A-Za-z][A-Za-z0-9-]*)\/(\d+)\/(\d{14})-(\d+)$/
    const stampPlainRe = /^([A-Za-z][A-Za-z0-9-]*)-(\d{6})-(\d+)$/

    const issued = new Map<string, { maxSeq: number; example: string }>()
    const unexpected: string[] = []
    const bumpIssued = (key: string, seq: number, example: string) => {
      const bucket = issued.get(key)
      if (!bucket || seq > bucket.maxSeq) {
        issued.set(key, { maxSeq: seq, example })
      }
    }

    for (const row of rows) {
      const value = row.numberValue?.trim() ?? ""
      if (value === "") continue

      const complexMatch = COMPLEX_RE.exec(value)
      if (complexMatch) {
        const [, seq, prefix, mm, yyyy] = complexMatch
        bumpIssued(`${prefix}-${yyyy}-${mm}`, Number(seq), value)
        continue
      }
      const stampSlash = stampSlashRe.exec(value)
      if (stampSlash) {
        const [, prefix, , stamp, pad] = stampSlash
        // Seq keluarga stamp slash adalah pad `-NNNN` (segmen kedua adalah
        // nomor dokumen arah lain, bukan counter — lihat kunci JRN-PAY
        // = pad, bukan segmen PAY/19).
        bumpIssued(
          `JRN-${prefix}-${stamp.slice(0, 4)}-${stamp.slice(4, 6)}`,
          Number(pad),
          value,
        )
        continue
      }
      const stampPlain = stampPlainRe.exec(value)
      if (stampPlain) {
        const [, prefix, yyyymm, seq] = stampPlain
        bumpIssued(`${prefix}-${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`, Number(seq), value)
        continue
      }
      if (!NUMBERING_EXCEPTIONS.has(exceptionKey(JOURNAL_PAIR.table, value))) {
        unexpected.push(exceptionKey(JOURNAL_PAIR.table, value))
      }
    }

    expect(unexpected).toEqual([])

    for (const [key, bucket] of issued) {
      const current = counter.get(key)
      expect(
        current,
        `kunci counter \`${key}\` HILANG sedangkan jurnal terbit (max ${bucket.maxSeq}; ex ${bucket.example})`,
      ).toBeDefined()
      expect(
        current as number,
        `kunci counter \`${key}\` TERTINGGAL: tersimpan ${current}, jurnal max ${bucket.maxSeq} (ex ${bucket.example})`,
      ).toBeGreaterThanOrEqual(bucket.maxSeq)
    }
  })
})
