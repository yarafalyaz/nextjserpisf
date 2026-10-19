#!/usr/bin/env node
/**
 * Memverifikasi bahwa rantai `prisma/migrations/` benar-benar mereproduksi
 * `prisma/schema.prisma` — dijalankan seluruhnya di DB scratch yang dibuat lalu
 * dihapus skrip ini, jadi DB kerja Anda tidak tersentuh.
 *
 * Kenapa ini ada: rantai migrasi pernah **tidak bisa jalan dari DB kosong**
 * (beberapa tabel tak pernah dibuat oleh migrasi mana pun) dan tak ada yang sadar
 * karena dev & CI sama-sama memakai `db push`. Sekarang CI memakai `migrate deploy`,
 * jadi kebenaran rantai ini menanggung beban — dan harus bisa diperiksa ulang
 * kapan saja, oleh siapa saja, dengan satu perintah:
 *
 *     node scripts/verify-migrations.mjs
 *
 * Aman: DB scratch bernama `<db>_migrasi_check` dibuat di server yang sama, lalu
 * dihapus di blok `finally` — termasuk bila ada langkah yang gagal.
 */
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import mariadb from "mariadb"

// S4036: CLI lokal project, tanpa npx/PATH. prisma terpasang di
// node_modules (exact dari lockfile) — dijalankan lewat node yang sama
// dengan skrip ini (process.execPath, path absolut).
import { fileURLToPath } from "node:url"

/**
 * URL yang dipakai untuk SEMUA langkah (buat DB scratch → migrate deploy → diff → hapus).
 * Default `DATABASE_URL`, tapi user aplikasi biasanya tak punya hak `CREATE DATABASE`;
 * untuk itu set `MIGRATION_CHECK_URL` ke koneksi ber-hak (mis. root) pada server yang sama:
 *
 *     MIGRATION_CHECK_URL='mysql://root:<pw>@127.0.0.1:3309/silengkap' node scripts/verify-migrations.mjs
 *
 * Skrip ini tidak pernah menyentuh DB asli: yang disentuh hanya
 * `<nama-db>_migrasi_check`, dan itu pun dihapus di blok `finally`.
 */
const LANTAI = process.env.MIGRATION_CHECK_URL || process.env.DATABASE_URL
if (!LANTAI) {
  console.error("DATABASE_URL (atau MIGRATION_CHECK_URL) tidak diset.")
  process.exit(2)
}

const url = new URL(LANTAI)
const namaAsli = url.pathname.replace(/^\//, "")
// AUD-TOOL-01: nama scratch unik per run (PID + timestamp), BUKAN nama tetap.
// Nama tetap + DROP IF EXISTS = run ini bisa menghapus DB milik run lain
// (atau data beneran bila seseorang menamai DB-nya begitu). Unik = tabrakan
// praktis mustahil; guard di bawah menolak bila nama sudah terpakai.
const namaScratch = `${namaAsli}_migrasi_check_${process.pid}_${Date.now().toString(36)}`
if (!/^[A-Za-z0-9_]+$/.test(namaScratch)) {
  console.error("Nama scratch tidak sah — batal.")
  process.exit(2)
}
const urlScratch = (() => {
  const u = new URL(LANTAI)
  u.pathname = `/${namaScratch}`
  return u.toString()
})()

const proyekRoot = fileURLToPath(new URL("..", import.meta.url))
const prismaCli = `${proyekRoot}node_modules/prisma/build/index.js`
if (!existsSync(prismaCli)) {
  console.error("Prisma CLI lokal tidak ditemukan (node_modules/prisma). Jalankan npm ci lebih dulu.")
  process.exit(2)
}

function jalankan(args) {
  return execFileSync(process.execPath, [prismaCli, ...args], {
    cwd: proyekRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DATABASE_URL: urlScratch, PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/homebrew/bin" },
  })
}

/** Buang baris komentar/kosong; sisanya = pernyataan SQL nyata. */
const pernyataan = (skrip) =>
  skrip
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("--"))

let conn
let gagal = false
let scratchMilikSendiri = false
try {
  conn = await mariadb.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  })
  await conn.query(
    `CREATE DATABASE \`${namaScratch}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  )
  scratchMilikSendiri = true
  console.log(`• DB scratch siap: ${namaScratch}`)

  jalankan(["migrate", "deploy"])
  console.log("• migrate deploy: seluruh migrasi diterapkan")

  const diff = jalankan([
    "migrate",
    "diff",
    "--from-config-datasource",
    "--to-schema",
    "prisma/schema.prisma",
    "--script",
  ])
  const sisa = pernyataan(diff)

  if (sisa.length > 0) {
    gagal = true
    console.error(`\n✗ DRIFT: migrasi TIDAK mereproduksi skema (${sisa.length} pernyataan).`)
    console.error("  Migrasi ada yang tertinggal/ditulis salah. Selisihnya:\n")
    console.error(sisa.map((l) => `    ${l}`).join("\n"))
    console.error("\n  Perbaiki, lalu jalankan ulang skrip ini.\n")
  } else {
    console.log("• drift migrasi vs schema.prisma: 0 — rantai sehat ✓")
  }
} catch (e) {
  gagal = true
  const pesan = `${e.stderr?.toString?.() || e.message}`
  console.error(`✗ Gagal: ${pesan}`)
  if (/Access denied/i.test(pesan)) {
    console.error(
      "  User ini tak punya hak CREATE/DROP DATABASE. Ulangi dengan user ber-hak:\n" +
        "    MIGRATION_CHECK_URL='mysql://root:<pw>@<host>:<port>/<db>' node scripts/verify-migrations.mjs",
    )
  }
} finally {
  // AUD-TOOL-01: hapus hanya bila CREATE di run ini yang membuatnya. Bila
  // CREATE gagal (nama tabrakan / DB sudah ada), DROP di sini akan menghapus
  // milik orang lain — jadi hapus hanya bila run ini pemiliknya.
  if (conn && scratchMilikSendiri) {
    try {
      await conn.query(`DROP DATABASE IF EXISTS \`${namaScratch}\``)
      console.log(`• DB scratch dihapus: ${namaScratch}`)
    } catch (e) {
      console.error(`! Gagal menghapus DB scratch ${namaScratch}: ${e.message}`)
      console.error(`  Hapus manual: DROP DATABASE \`${namaScratch}\`;`)
    }
    // Kegagalan menutup koneksi tetap dilaporkan: proses langsung keluar setelah ini,
    // tetapi membersihkan dengan diam membuat masalah tak terlihat (ditegur penjaga
    // silent-failure — dan memang seharusnya).
    await conn.end().catch((e) => {
      console.error(`! Gagal menutup koneksi DB: ${e.message}`)
    })
  }
}

process.exit(gagal ? 1 : 0)
