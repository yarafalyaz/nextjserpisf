import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { promisify } from "node:util"
import { basePrisma } from "@/lib/db/prisma"

const execFileAsync = promisify(execFile)

/**
 * Pemeriksaan sistem + provisioning skema untuk wizard penyiapan awal
 * (ala langkah "tes koneksi & buat tabel" pada installer WordPress).
 *
 * Koneksi database TIDAK dikonfigurasi dari wizard — `DATABASE_URL`
 * tetap urusan env/deployment. Yang dilakukan wizard:
 * 1. `getSetupChecks()` membuktikan koneksi hidup dan apakah skema
 *    (tabel inti) sudah ada.
 * 2. `provisionSchema()` menjalankan `prisma migrate deploy` dari dalam
 *    proses aplikasi bila skema belum ada. Image produksi membawa
 *    Prisma CLI + folder migrasi, jadi ini bekerja juga di standalone;
 *    bila CLI tidak ditemukan, kegagalan dilaporkan apa adanya dengan
 *    petunjuk menjalankan migrasi dari deployment — tidak pernah
 *    berpura-pura berhasil.
 *
 * Keduanya hanya bermakna sebelum instalasi selesai; pemanggil
 * (setup.actions) yang menegakkan gerbang `isInstalled()`.
 */

export interface SetupChecks {
  databaseConnected: boolean
  schemaReady: boolean
  tableCount: number
}

/** Tabel yang menandai skema aplikasi sudah terbentuk. */
const CORE_TABLES = ["users", "roles", "permissions", "system_settings"]

type ChecksDb = Pick<typeof basePrisma, "$queryRaw" | "$queryRawUnsafe">

export async function getSetupChecks(db: ChecksDb = basePrisma): Promise<SetupChecks> {
  try {
    await db.$queryRaw`SELECT 1`
  } catch {
    // DB tak terjangkau: degradasi yang disengaja untuk langkah wizard —
    // UI menampilkan status ini agar operator memperbaiki env, bukan 500.
    return { databaseConnected: false, schemaReady: false, tableCount: 0 }
  }
  try {
    const rows = await db.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()",
    )
    const names = new Set(rows.map((r) => r.name))
    return {
      databaseConnected: true,
      schemaReady: CORE_TABLES.every((t) => names.has(t)),
      tableCount: names.size,
    }
  } catch {
    // Terhubung tapi katalog skema tak terbaca — perlakukan sebagai
    // skema belum siap agar wizard menawarkan provisioning.
    return { databaseConnected: true, schemaReady: false, tableCount: 0 }
  }
}

export interface ProvisionResult {
  success: boolean
  message: string
}

let inFlight: Promise<ProvisionResult> | null = null

/**
 * Jalankan migrasi yang tertunda (`prisma migrate deploy`) satu kali;
 * panggilan bersamaan berbagi proses yang sama (single-flight) supaya
 * dua klik tidak menjalankan dua migrasi paralel.
 */
export function provisionSchema(): Promise<ProvisionResult> {
  if (inFlight) return inFlight
  inFlight = runMigrateDeploy().finally(() => {
    inFlight = null
  })
  return inFlight
}

/**
 * Cari runtime Prisma CLI yang bisa dijalankan dari proses aplikasi.
 *
 * Server standalone Next.js memindah direktori kerjanya ke folder
 * standalone (`process.chdir(__dirname)` di server.js), jadi CLI tidak
 * selalu ada di `<cwd>/node_modules`. Cari di cwd dan dua leluhurnya
 * akar yang memiliki CLI sekaligus `prisma/schema.prisma` — akar itulah
 * direktori kerja spawn, karena `prisma.config.ts` dan folder migrasi
 * dibaca relatif dari sana.
 *
 * Urutan dari leluhur TERLUAR: salinan `node_modules` hasil tracing di
 * dalam folder standalone tidak lengkap (dependensi CLI tidak ikut
 * tertelusur, spawn-nya mati MODULE_NOT_FOUND), jadi akar aplikasi asli
 * harus menang bila ada. Di image Docker cwd sudah /app — leluhurnya
 * tidak memiliki CLI, jadi /app yang terpilih.
 */
function resolvePrismaRuntime(): { root: string; cliJs: string } | null {
  const cwd = process.cwd()
  const roots = [join(cwd, "..", ".."), join(cwd, ".."), cwd]
  for (const root of roots) {
    const cliJs = join(root, "node_modules", "prisma", "build", "index.js")
    if (existsSync(cliJs) && existsSync(join(root, "prisma", "schema.prisma"))) {
      return { root, cliJs }
    }
  }
  return null
}

async function runMigrateDeploy(): Promise<ProvisionResult> {
  const runtime = resolvePrismaRuntime()
  if (!runtime) {
    return {
      success: false,
      message:
        "Prisma CLI tidak tersedia di server ini, jadi skema tidak bisa dibuat dari wizard. " +
        "Jalankan `prisma migrate deploy` dari deployment, lalu periksa ulang.",
    }
  }
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [runtime.cliJs, "migrate", "deploy"],
      {
        cwd: runtime.root,
        env: process.env,
        timeout: 240_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    )
    return { success: true, message: tail(`${stdout}\n${stderr}`) }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string }
    return {
      success: false,
      message: tail(`${err.stdout ?? ""}\n${err.stderr ?? ""}`) || err.message || "Migrasi gagal",
    }
  }
}

/** Potong keluaran CLI ke ekor yang relevan untuk ditampilkan di wizard. */
function tail(text: string): string {
  const clean = text.trim()
  return clean.length > 600 ? `…${clean.slice(-600)}` : clean
}
