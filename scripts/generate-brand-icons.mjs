#!/usr/bin/env node
/**
 * Membuat aset brand YaraERP (favicon + ikon PWA) dari satu sumber SVG,
 * memakai `sharp` yang sudah menjadi dependensi proyek — tanpa alat desain
 * eksternal.
 *
 * Jalankan ulang setiap kali desain berubah:
 *   node scripts/generate-brand-icons.mjs
 *
 * Monogram "Y" digambar sebagai jalur, bukan teks, supaya hasil raster tidak
 * bergantung pada font yang terpasang di mesin mana pun.
 */

import { writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const sharp = require("sharp")

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/** Kotak gelap netral yang sama dengan mark bawaan aplikasi (login/sidebar). */
const BG = "#171717" // = --color-primary
const FG = "#fafafa" // = zinc-50

/**
 * @param radius sudut kotak latar (skala 512) — favicon memakai sudut
 *   membulat agar enak dilihat di tab; ikon peluncur dibiarkan penuh
 *   (full-bleed) karena platform yang membulatkannya sendiri.
 * @param scale  faktor monogram terhadap kanvas.
 */
function brandSvg({ radius, scale = 1 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="${BG}"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)" fill="none"
     stroke="${FG}" stroke-width="76" stroke-linecap="round" stroke-linejoin="round">
    <path d="M166 127 L256 241"/>
    <path d="M346 127 L256 241"/>
    <path d="M256 241 L256 385"/>
  </g>
</svg>`
}

const render = (opts, size) =>
  sharp(Buffer.from(brandSvg(opts))).resize(size, size).png().toBuffer()

/**
 * ICO = header + direktori + payload PNG. ICO berisi PNG didukung semua
 * peramban modern (dan Windows Vista+), jadi tidak perlu encoder BMP.
 */
function buildIco(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: 1 = icon
  header.writeUInt16LE(pngs.length, 4)

  const entries = []
  let offset = 6 + pngs.length * 16
  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0) // width (0 = 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1) // height
    entry.writeUInt8(0, 2) // jumlah warna palet
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // planes
    entry.writeUInt16LE(32, 6) // bit per piksel
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += data.length
  }

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)])
}

const favicon = await Promise.all(
  [16, 32, 48].map(async (size) => ({ size, data: await render({ radius: 112 }, size) })),
)

// Ikon peluncur: full-bleed, monogram sedikit lebih kecil agar aman dari
// pemotongan masker platform (safe zone ikon adaptif).
const launcher = { radius: 0, scale: 0.85 }

await writeFile(path.join(ROOT, "public/favicon.ico"), buildIco(favicon))
await writeFile(path.join(ROOT, "public/icon-192.png"), await render(launcher, 192))
await writeFile(path.join(ROOT, "public/icon-512.png"), await render(launcher, 512))
await writeFile(
  path.join(ROOT, "public/apple-touch-icon.png"),
  await render(launcher, 180),
)

console.log(
  "Ikon brand dibuat: public/favicon.ico, icon-192.png, icon-512.png, apple-touch-icon.png",
)
