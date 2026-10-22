#!/usr/bin/env node
/**
 * Preflight install: gagal cepat bila node_modules korup sebelum lint/build.
 *
 * Insiden 2026-10-22: symlink sampah `node_modules/node_modules` (ln -s dengan
 * DEST direktori existing dari CWD salah) lolos di checkout lokal. Turbopack
 * menolaknya ("points out of filesystem root") sehingga build gagal jauh di
 * tengah dengan "Module not found: @auth/core/jwt" via src/proxy.ts — pesan
 * yang menunjuk paket, bukan biang sebenarnya.
 *
 * Dua cek, keduanya harus lulus:
 *   (a) tidak ada entri apa pun di `node_modules/node_modules` — file, dir,
 *       atau symlink (termasuk symlink rusak; makanya lstat, bukan exists).
 *   (b) `next-auth`, `next-auth/jwt`, dan `@auth/core/jwt` ter-resolve dari
 *       root proyek dan dari direktori `src/proxy.ts` (konsumen jwt).
 *
 * Jalankan: `npm run preflight:deps` (sesudah `npm ci`). Exit 1 = gagal,
 * pesan menyebut perbaikan: `rm -rf node_modules && npm ci`.
 * Path root bisa dioverride argumen pertama untuk pengujian.
 */
import { lstatSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(
  process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
)

let failed = false
const fail = (msg) => {
  failed = true
  console.error(`preflight: GAGAL — ${msg}`)
}

// (a) node_modules/node_modules tidak boleh ada dalam bentuk apa pun.
const nested = path.join(root, "node_modules", "node_modules")
try {
  const st = lstatSync(nested)
  const kind = st.isSymbolicLink() ? "symlink" : st.isDirectory() ? "direktori" : "file"
  fail(
    `${kind} sampah terdeteksi: node_modules/node_modules. ` +
      `Ini sisa ln -s ke dalam node_modules (Turbopack menolaknya: points out of filesystem root). ` +
      `Perbaiki: rm node_modules/node_modules, atau bersih total: rm -rf node_modules && npm ci`,
  )
} catch (err) {
  if (err.code !== "ENOENT") throw err
}

// (b) Modul auth yang diimpor proxy harus ter-resolve.
const requireFromRoot = createRequire(path.join(root, "package.json"))
const requireFromProxy = createRequire(path.join(root, "src", "proxy.ts"))
for (const [label, req] of [
  ["root proyek", requireFromRoot],
  ["src/proxy.ts", requireFromProxy],
]) {
  for (const spec of ["next-auth", "next-auth/jwt", "@auth/core/jwt"]) {
    try {
      req.resolve(spec)
    } catch {
      fail(
        `'${spec}' tidak ter-resolve dari ${label}. Install rusak/tidak lengkap. ` +
          `Perbaiki: rm -rf node_modules && npm ci`,
      )
    }
  }
}

if (failed) process.exit(1)
console.log("preflight: OK — node_modules bersih, next-auth + @auth/core/jwt ter-resolve.")
