import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga: setiap server action di `src/actions/*.actions.ts` yang menyentuh
 * Prisma (create/update/delete/upsert/$executeRaw) WAJIB memanggil penjaga IZIN
 * sebelum mutasi Prisma pertamanya.
 *
 * Kenapa ini penting: server action adalah SATU-SATUNYA lapisan mutasi aplikasi
 * ini (proxy/halaman hanya menjaga tampilan). Penjaga izin yang lupa dipasang di
 * satu action = satu endpoint mutasi yang bisa dipanggil pengguna tanpa izin,
 * dan tidak ada tsc/lint/tes lain yang menangkapnya — halaman tetap hijau, form
 * tetap tampil, hanya enforcement-nya hilang. Ini kelas bug yang sama dengan
 * yang dijaga `page-action-permission-parity.test.ts` (sisi halaman) dan
 * `permission-seed-parity.test.ts` (sisi string izin); berkas ini menutup sisi
 * action.
 *
 * Aturan yang ditegakkan (statis, berbasis teks sumber yang sudah disamarkan):
 *   1. Aksi "menyentuh Prisma" bila badannya memuat pemanggilan
 *      `.create/.update/.delete/.upsert/.createMany/.updateMany/.deleteMany/
 *      $executeRaw` — bentuk mutasi Prisma yang dipakai di repo ini.
 *   2. Aksi itu "dijaga" bila panggilan penjaga IZIN muncul SEBELUM (indeks teks
 *      lebih kecil) mutasi Prisma pertama pada badan fungsi yang sama.
 *   3. `requireAuth()` SAJA tidak dihitung sebagai penjaga izin — ia hanya
 *      membuktikan "sudah login", bukan "berhak". Itu sebabnya dua aksi profil
 *      masuk daftar pengecualian di bawah.
 *
 * "Penjaga izin" = panggilan yang menegakkan otorisasi:
 *   requirePermission / requireAnyPermission / hasPermission / hasAnyPermission /
 *   requireRole / hasRole / assertCan* (privilege-escalation) serta dua penjaga
 *   approval (assertApprovalPermission, assertStepApprover). Assert non-izin
 *   (assertCSRF, assertPeriodOpen, assertThreeWayMatch, assertApproved, …) sengaja
 *   TIDAK dihitung: mereka aturan bisnis/keadaan, bukan otorisasi.
 *
 * Repo tidak punya penjaga statis lain untuk hal ini, jadi bila ke depan ada yang
 * menambah action mutasi tanpa izin, tes inilah yang harus memerah.
 */

const ROOT = process.cwd()
const ACTIONS_DIR = join(ROOT, "src", "actions")

/**
 * Samarkan komentar dan isi literal string/template dengan spasi (panjang &
 * posisi newline dipertahankan), supaya pemindaian `.create(` dsb tidak
 * tertipu oleh teks di dalam komentar/string dan keseimbangan `{}`/`()` tetap
 * akurat. Dipakai juga oleh `page-action-permission-parity`-style regex.
 */
function samarkan(source: string): string {
  const out = [...source]
  let i = 0
  const n = source.length
  let mode: null | "line" | "block" | "sq" | "dq" | "tpl" = null
  while (i < n) {
    const c = source[i]
    if (mode === null) {
      if (c === "/" && source[i + 1] === "/") {
        out[i] = " "
        out[i + 1] = " "
        i += 2
        mode = "line"
        continue
      }
      if (c === "/" && source[i + 1] === "*") {
        out[i] = " "
        out[i + 1] = " "
        i += 2
        mode = "block"
        continue
      }
      if (c === "'") {
        out[i] = " "
        i += 1
        mode = "sq"
        continue
      }
      if (c === '"') {
        out[i] = " "
        i += 1
        mode = "dq"
        continue
      }
      if (c === "`") {
        out[i] = " "
        i += 1
        mode = "tpl"
        continue
      }
      i += 1
      continue
    }
    if (mode === "line") {
      if (c === "\n") mode = null
      else out[i] = " "
      i += 1
      continue
    }
    if (mode === "block") {
      if (c === "*" && source[i + 1] === "/") {
        out[i] = " "
        out[i + 1] = " "
        i += 2
        mode = null
        continue
      }
      if (c !== "\n") out[i] = " "
      i += 1
      continue
    }
    // sq | dq | tpl
    if (c === "\\") {
      out[i] = " "
      if (i + 1 < n) out[i + 1] = " "
      i += 2
      continue
    }
    if (mode === "tpl" && c === "`") {
      out[i] = " "
      i += 1
      mode = null
      continue
    }
    if (mode === "sq" && c === "'") {
      out[i] = " "
      i += 1
      mode = null
      continue
    }
    if (mode === "dq" && c === '"') {
      out[i] = " "
      i += 1
      mode = null
      continue
    }
    if (c !== "\n") out[i] = " "
    i += 1
  }
  return out.join("")
}

/** Deklarasi aksi server: hanya `export async function` yang menjadi action. */
const DEKLARASI_AKSI = /export\s+async\s+function\s+([A-Za-z0-9_$]+)/g

/** Bentuk mutasi Prisma yang dihitung sebagai "menyentuh Prisma". */
const MUTASI_PRISMA =
  /\.(?:create|update|delete|upsert|createMany|updateMany|deleteMany|executeRaw|executeRawUnsafe|\$executeRaw|\$executeRawUnsafe)\s*\(/

/**
 * Penjaga IZIN/otorisasi. TANPA flag `g`: dipakai dengan `.search`/`.test` yang
 * stateful bila regex ber-`g` (pelajaran dari `silent-failure.test.ts`).
 */
const PENJAGA_IZIN =
  /\b(?:requirePermission|requireAnyPermission|hasPermission|hasAnyPermission|requireRole|hasRole|assertCan[A-Za-z0-9_]*|assertApprovalPermission|assertStepApprover)\s*\(/

/** Penjaga autentikasi saja (bukan otorisasi) — dipakai untuk dokumentasi. */
const PENJAGA_AUTH_SAJA = /\brequireAuth\s*\(/

interface Aksi {
  berkas: string
  nama: string
  badan: string
}

/** Ambil badan fungsi dari index tepat setelah nama fungsi, dengan brace-match. */
function badanFungsi(sumber: string, posisiSetelahNama: number): string {
  let i = sumber.indexOf("(", posisiSetelahNama)
  let depth = 0
  for (; i < sumber.length; i += 1) {
    if (sumber[i] === "(") depth += 1
    else if (sumber[i] === ")") {
      depth -= 1
      if (depth === 0) break
    }
  }
  let j = sumber.indexOf("{", i)
  let kd = 0
  for (; j < sumber.length; j += 1) {
    if (sumber[j] === "{") kd += 1
    else if (sumber[j] === "}") {
      kd -= 1
      if (kd === 0) break
    }
  }
  return sumber.slice(sumber.indexOf("{", i), j + 1)
}

function bacaSemuaAksi(): Aksi[] {
  const hasil: Aksi[] = []
  const berkas = readdirSync(ACTIONS_DIR)
    .filter((nama) => nama.endsWith(".actions.ts"))
    .sort()
  for (const namaBerkas of berkas) {
    const berkasRelatif = `src/actions/${namaBerkas}`
    const sumber = samarkan(readFileSync(join(ROOT, berkasRelatif), "utf8"))
    for (const cocok of sumber.matchAll(DEKLARASI_AKSI)) {
      hasil.push({
        berkas: berkasRelatif,
        nama: cocok[1],
        badan: badanFungsi(sumber, cocok.index + cocok[0].length),
      })
    }
  }
  return hasil
}

/** Aksi "dijaga" bila penjaga izin muncul sebelum mutasi Prisma pertamanya. */
function dijagaSebelumMutasi(badan: string): boolean {
  const mutasi = badan.search(MUTASI_PRISMA)
  if (mutasi === -1) return true // tidak menyentuh Prisma → di luar aturan
  const penjaga = badan.search(PENJAGA_IZIN)
  return penjaga !== -1 && penjaga < mutasi
}

const kunci = (aksi: Aksi): string => `${aksi.berkas}:${aksi.nama}`

const SEMUA_AKSI = bacaSemuaAksi()
const AKSI_BERMUTASI = SEMUA_AKSI.filter((aksi) => MUTASI_PRISMA.test(aksi.badan))

/**
 * Daftar-beku BERARAH DUA: satu-satunya aksi yang SAH menyentuh Prisma tanpa
 * penjaga izin. Setiap entri wajib punya alasan; arahan kedua (tes "tidak
 * membusuk") memaksa entri dihapus begitu aksinya mendapat penjaga izin.
 */
const PENGECUALIAN: Record<
  string,
  { alasan: string; penjagaAlternatif?: string[] }
> = {
  "src/actions/auth.actions.ts:changePassword": {
    alasan:
      "Aksi login-only: pengguna mengubah password akunnya SENDIRI. userId diambil dari sesi " +
      "(requireAuth), bukan formData (anti-IDOR #17), jadi targetnya selalu pemanggil — tidak ada " +
      "sumber daya lintas-pengguna yang bisa disalahgunakan. requireAuth saja sengaja tidak " +
      "dianggap penjaga izin; jangan tambahkan requirePermission khusus di sini tanpa alasan.",
  },
  "src/actions/auth.actions.ts:updateProfile": {
    alasan:
      "Aksi login-only: pengguna memperbarui profil akunnya SENDIRI. userId dari sesi (requireAuth, " +
      "anti-IDOR #18); target selalu pemanggil, tidak ada otorisasi lintas-pengguna yang perlu dicek.",
  },
  "src/actions/setup.actions.ts:runSetup": {
    alasan:
      "Bootstrap pra-pengguna: berjalan sebelum admin pertama ada, sehingga requirePermission " +
      "mustahil dipakai. Ia menulis Prisma SECARA TIDAK LANGSUNG lewat installBaseData (karena itu " +
      "tak muncul sebagai mutasi langsung), dan dijaga isInstalled() + assertCSRF(). Dua penjaga " +
      "itu dipaku di penjagaAlternatif supaya entri ini tidak membusuk jadi cangkang.",
    penjagaAlternatif: ["isInstalled(", "assertCSRF("],
  },
}

describe("penjaga izin server action yang menyentuh Prisma", () => {
  it("menemukan cukup banyak aksi dan mutasi agar tidak vakum", () => {
    // Penjaga atas extractor itu sendiri: perubahan parsing yang membuat
    // pemeriksaan di bawah kosong harus gagal di sini, bukan lolos diam-diam.
    expect(SEMUA_AKSI.length).toBeGreaterThan(280)
    expect(AKSI_BERMUTASI.length).toBeGreaterThan(250)
    // Ketiga pengecualian harus benar-benar tereksekusi (ditemukan oleh extractor).
    for (const kunciPengecualian of Object.keys(PENGECUALIAN)) {
      expect(
        SEMUA_AKSI.some((aksi) => kunci(aksi) === kunciPengecualian),
        `aksi pengecualian tidak ditemukan oleh extractor: ${kunciPengecualian}`,
      ).toBe(true)
    }
  })

  it("setiap aksi yang menyentuh Prisma memakai penjaga izin sebelum mutasi pertama", () => {
    const takTerdaftar = AKSI_BERMUTASI.filter((aksi) => !dijagaSebelumMutasi(aksi.badan))
      .map(kunci)
      .filter((k) => !(k in PENGECUALIAN))
      .sort()

    expect(
      takTerdaftar,
      `Aksi menyentuh Prisma tanpa penjaga izin sebelum mutasi pertama, dan tidak terdaftar ` +
        `sebagai pengecualian:\n${takTerdaftar.join("\n")}`,
    ).toEqual([])
  })

  it("daftar pengecualian langsung persis sama dengan pelanggar langsung (arah kedua)", () => {
    // Arah dua: tiap aksi bermutasi-langsung yang terdaftar harus benar-benar
    // pelanggar. Kalau salah satunya kini dijaga, ia harus DIHAPUS dari daftar.
    const pelanggarLangsung = AKSI_BERMUTASI.filter((aksi) => !dijagaSebelumMutasi(aksi.badan))
      .map(kunci)
      .sort()
    const terdaftarLangsung = Object.keys(PENGECUALIAN)
      .filter((k) =>
        AKSI_BERMUTASI.some((aksi) => kunci(aksi) === k && MUTASI_PRISMA.test(aksi.badan)),
      )
      .sort()

    expect(pelanggarLangsung).toEqual(terdaftarLangsung)
  })

  it("pengecualian sah tidak membusuk: alasannya ada dan penjaganya belum berubah", () => {
    const busuk: string[] = []

    for (const [kunciPengecualian, { alasan, penjagaAlternatif }] of Object.entries(PENGECUALIAN)) {
      if (!alasan.trim()) busuk.push(`${kunciPengecualian}: tanpa alasan tertulis`)

      const aksi = SEMUA_AKSI.find((kandidat) => kunci(kandidat) === kunciPengecualian)
      if (!aksi) {
        busuk.push(`${kunciPengecualian}: aksi tidak ditemukan (hapus entri)`)
        continue
      }

      // Arah kedua: begitu aksi ini memakai penjaga izin, entri ini kedaluwarsa.
      if (PENJAGA_IZIN.test(aksi.badan)) {
        busuk.push(`${kunciPengecualian}: sudah punya penjaga izin — hapus dari daftar pengecualian`)
      }

      // For aksi bootstrap: penjaga alternatif yang menjadi dasar alasan harus tetap ada.
      for (const penjaga of penjagaAlternatif ?? []) {
        if (!aksi.badan.includes(penjaga)) {
          busuk.push(`${kunciPengecualian}: penjaga alternatif "${penjaga}" hilang`)
        }
      }
    }

    expect(busuk, `Pengecualian yang membusuk:\n${busuk.join("\n")}`).toEqual([])
  })

  it("pengecualian auth-only memang memakai requireAuth (bukan tanpa penjaga sama sekali)", () => {
    // Mendokumentasikan bahwa changePassword/updateProfile bukan "tanpa penjaga",
    // melainkan dijaga autentikasi (userId dari sesi) — bukan otorisasi izin.
    for (const nama of ["changePassword", "updateProfile"]) {
      const aksi = SEMUA_AKSI.find(
        (kandidat) => kandidat.berkas.endsWith("auth.actions.ts") && kandidat.nama === nama,
      )
      expect(aksi, `aksi ${nama} tidak ditemukan`).toBeDefined()
      expect(aksi!.badan.search(PENJAGA_AUTH_SAJA), `${nama} tanpa requireAuth`).toBeGreaterThanOrEqual(0)
    }
  })
})
