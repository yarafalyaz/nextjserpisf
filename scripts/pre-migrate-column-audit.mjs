/**
 * Audit isi kolom SEBELUM migrasi DROP dijalankan di produksi.
 * Baca-only: hanya SELECT COUNT, tidak menulis apa pun.
 * Exit 1 bila ada kolom target berisi data non-default — artinya asumsi
 * "kolom mati" salah untuk DB ini, JANGAN migrate.
 *
 * Node murni, nol dependensi sistem (tanpa bash/python3/klien mariadb):
 * jalan di image runner `node:26-alpine` memakai `@prisma/adapter-mariadb`
 * yang sudah ada di node_modules. Dipanggil dari layanan `migrate` SEBELUM
 * `prisma migrate deploy` (audit gagal = rilis gagal).
 *
 * Pakai: DATABASE_URL='mysql://user:pass@host:3306/db' node scripts/pre-migrate-column-audit.mjs
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

const TARGETS = [
  // [tabel, kolom, kondisi "berisi data"]
  ["bank_statement_lines", "balance", "`balance` IS NOT NULL AND `balance` != 0"],
  ["approval_workflow_steps", "can_skip", "`can_skip` = true"],
  ["bank_reconciliation_items", "cleared_date", "`cleared_date` IS NOT NULL"],
  ["bank_statement_lines", "matched_type", "`matched_type` IS NOT NULL AND `matched_type` != ''"],
];

function ident(s) {
  if (!/^[A-Za-z0-9_]+$/.test(s)) throw new Error(`identifier tidak sah: ${s}`);
  return `\`${s}\``;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL tidak diset.");
  process.exit(2);
}

const adapter = new PrismaMariaDb(url);
const prisma = new PrismaClient({ adapter });

let failed = false;
try {
  for (const [table, col, cond] of TARGETS) {
    const exists = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '${table}' AND column_name = '${col}'`,
    );
    if (Number(exists[0]?.n ?? 0) === 0) {
      console.log(`SKIP  ${table}.${col}: kolom sudah tidak ada.`);
      continue;
    }
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS n FROM ${ident(table)} WHERE ${cond}`,
    );
    const n = Number(rows[0]?.n ?? 0);
    if (n !== 0) {
      console.error(`GAGAL ${table}.${col}: ${n} baris berisi data — JANGAN jalankan migrate drop.`);
      failed = true;
    } else {
      console.log(`OK    ${table}.${col}: kosong (0 baris berisi data).`);
    }
  }
} finally {
  await prisma.$disconnect();
}

if (failed) {
  console.error("Audit GAGAL — migrate drop DITOLAK untuk DB ini.");
  process.exit(1);
}
console.log("Audit LULUS — kolom target kosong, migrate drop aman untuk DB ini.");
