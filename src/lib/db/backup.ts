import "server-only"
import { randomUUID } from "crypto"
import { spawn } from "child_process"
import { mkdir, readdir, rename, stat, unlink } from "fs/promises"
import { createWriteStream, createReadStream, existsSync } from "fs"
import { pipeline } from "stream/promises"
import type { Readable } from "stream"
import path from "path"
import {
  uploadToCloudIfEnabled,
  listCloudKeys,
  downloadFromCloudStream,
  deleteFromCloud,
} from "@/lib/storage/storage"

const CLOUD_PREFIX = "backups/"

// S4036: never resolve OS commands via the caller's PATH. mysqldump/mysql
// ship with the DB client tools on the host image; resolve them to absolute
// paths at startup (fixed search list), falling back to the bare name only
// when none exists so behavior on dev machines is unchanged.
const resolveBin = (names: string[]): string => {
  for (const p of names) {
    let ada = false
    try {
      ada = existsSync(p)
    } catch {
      // existsSync pada path aneh tak boleh menggagalkan startup;
      // anggap kandidat ini tak ada, lanjut ke berikut.
      ada = false
    }
    if (ada) return p
  }
  return names[names.length - 1]
}
const MYSQLDUMP_BIN = resolveBin(["/usr/bin/mysqldump", "/usr/local/bin/mysqldump", "/opt/homebrew/bin/mysqldump", "mysqldump"])
const MYSQL_BIN = resolveBin(["/usr/bin/mysql", "/usr/local/bin/mysql", "/opt/homebrew/bin/mysql", "mysql"])
const SAFE_PATH = "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/opt/homebrew/bin"

/**
 * Database backup/restore via mysqldump / mysql CLI.
 * Backups are stored OUTSIDE the web root (project-root /backups) so they are
 * never publicly downloadable. They contain the full dataset.
 */

const BACKUP_DIR = path.join(process.cwd(), "backups")

class CloudNotFoundError extends Error {}
const inflightCloudDownloads = new Map<string, Promise<string>>()

async function cleanupTempFile(tmpPath: string): Promise<void> {
  try {
    await unlink(tmpPath)
  } catch {
    /* ignore */
  }
}

interface DbConn {
  host: string
  port: string
  user: string
  password: string
  database: string
}

export function parseDbUrl(): DbConn {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL tidak diset")
  const u = new URL(url)
  return {
    host: u.hostname || "127.0.0.1",
    port: u.port || "3306",
    user: decodeURIComponent(u.username || "root"),
    password: decodeURIComponent(u.password || ""),
    database: u.pathname.replace(/^\//, "") || "",
  }
}

export interface BackupFile {
  filename: string
  size: number
  createdAt: string
  /** true if a copy exists on cloud storage (R2) */
  cloud?: boolean
  /** true if a local copy exists on the server */
  local?: boolean
}

// Exported for unit testing — security-critical filename guard.
export function isValidBackupName(name: string): boolean {
  // Only our generated names: backup-YYYYMMDD-HHMMSS[...].sql — no path traversal
  return /^backup-[\w-]+\.sql$/.test(name) && !name.includes("..") && !name.includes("/")
}

export async function listBackups(): Promise<BackupFile[]> {
  const map = new Map<string, BackupFile>()

  // Local backups (exclude in-progress .tmp files)
  if (existsSync(BACKUP_DIR)) {
    const files = await readdir(BACKUP_DIR)
    for (const f of files) {
      if (!f.endsWith(".sql") || f.endsWith(".tmp")) continue
      const st = await stat(path.join(BACKUP_DIR, f))
      map.set(f, { filename: f, size: st.size, createdAt: st.mtime.toISOString(), local: true, cloud: false })
    }
  }

  // Cloud backups (R2) — merge by filename
  try {
    const keys = await listCloudKeys(CLOUD_PREFIX)
    for (const key of keys) {
      const f = key.slice(CLOUD_PREFIX.length)
      if (!f.endsWith(".sql") || f.endsWith(".tmp")) continue
      const existing = map.get(f)
      if (existing) {
        existing.cloud = true
      } else {
        map.set(f, { filename: f, size: 0, createdAt: new Date(0).toISOString(), local: false, cloud: true })
      }
    }
  } catch {
    // R2 not configured / unreachable — local list still returned
  }

  return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Run mysqldump and stream output atomically via .tmp -> rename to a .sql file.
 *  Optional label is inserted into the filename (e.g. "autosnap"). */
export function createBackup(label?: string): Promise<BackupFile> {
  return new Promise((resolve, reject) => {
    const run = async () => {
      let tmpPath: string | null = null
      try {
        const conn = parseDbUrl()
        await mkdir(BACKUP_DIR, { recursive: true })

        const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "-").slice(0, 19)
        const safeLabel = label ? `${label.replace(/[^a-zA-Z0-9]/g, "")}-` : ""
        // Suffix unik: nama presisi detik bertabrakan pada dua backup dalam
        // detik yang sama dan dua mysqldump menimpa berkas yang sama
        // (putaran 82). Pola `backup-*.sql` untuk allowlist unduh tetap cocok.
        const filename = `backup-${safeLabel}${ts}-${randomUUID().slice(0, 8)}.sql`
        const filepath = path.join(BACKUP_DIR, filename)
        tmpPath = `${filepath}.tmp`

        const args = [
          `-h${conn.host}`,
          `-P${conn.port}`,
          `-u${conn.user}`,
          "--single-transaction",
          "--quick",
          "--routines",
          "--triggers",
          "--no-tablespaces",
          "--set-gtid-purged=OFF",
          conn.database,
        ]

        // S4036: spawn dgn PATH tetap, bukan PATH dari pemanggil.
        const env = { ...process.env, PATH: SAFE_PATH } as NodeJS.ProcessEnv
        if (conn.password) env.MYSQL_PWD = conn.password

        const out = createWriteStream(tmpPath)
        const child = spawn(MYSQLDUMP_BIN, args, { env })
        let stderr = ""
        let settled = false
        let outFinished = false
        let outError: Error | null = null

        const fail = async (err: Error) => {
          if (settled) return
          settled = true
          child.stdout?.unpipe?.(out)
          if (!child.killed) {
            child.kill?.()
          }
          if (typeof out.destroy === "function") out.destroy()
          else out.close?.()
          if (tmpPath) await cleanupTempFile(tmpPath)
          reject(err)
        }

        out.on("finish", () => {
          outFinished = true
        })
        out.on("error", (err) => {
          outError = err
          void fail(new Error(`Gagal menulis file backup: ${err.message}`))
        })
        child.stdout?.on("error", (err) => {
          void fail(new Error(`Gagal membaca output mysqldump: ${err.message}`))
        })

        child.stdout.pipe(out)
        child.stderr.on("data", (d) => { stderr += String(d) })

        child.on("error", (err) => {
          void fail(new Error(`Gagal menjalankan mysqldump: ${err.message}`))
        })

        const waitForFinish = () =>
          new Promise<void>((resFinish, rejFinish) => {
            if (outError) {
              rejFinish(outError)
              return
            }
            if (outFinished || out.writableFinished) {
              resFinish()
              return
            }
            const onFinish = () => {
              out.off?.("error", onErr)
              resFinish()
            }
            const onErr = (err: Error) => {
              out.off?.("finish", onFinish)
              rejFinish(err)
            }
            out.once("finish", onFinish)
            out.once("error", onErr)
            if (!out.writableEnded && typeof out.end === "function") {
              out.end()
            }
          })

        child.on("close", async (code) => {
          if (settled) return
          if (code !== 0) {
            await fail(new Error(`Backup gagal (exit ${code}): ${stderr.trim() || "unknown error"}`))
            return
          }
          try {
            await waitForFinish()
            const tmpStat = await stat(tmpPath!)
            await rename(tmpPath!, filepath)
            const st = await stat(filepath)
            settled = true

            let cloud = false
            const uploadStream = createReadStream(filepath)
            uploadStream.on("error", (streamErr) => {
              console.warn("[backup] Gagal membaca stream backup untuk cloud:", streamErr.message)
            })
            try {
              cloud = await uploadToCloudIfEnabled(
                `${CLOUD_PREFIX}${filename}`,
                uploadStream,
                "application/sql",
                tmpStat.size || st.size,
              )
            } catch (err) {
              console.warn("[backup] Upload ke cloud gagal:", err instanceof Error ? err.message : err)
            } finally {
              uploadStream.destroy?.()
            }
            resolve({ filename, size: st.size, createdAt: st.mtime.toISOString(), local: true, cloud })
          } catch (err) {
            await fail(err instanceof Error ? err : new Error(String(err)))
          }
        })
      } catch (e) {
        if (tmpPath) await cleanupTempFile(tmpPath)
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    }
    void run()
  })
}

async function downloadBackupToLocal(filename: string): Promise<string> {
  const filepath = path.join(BACKUP_DIR, filename)
  if (existsSync(filepath)) return filepath

  let cloudStream: Readable
  try {
    cloudStream = await downloadFromCloudStream(`${CLOUD_PREFIX}${filename}`)
  } catch (err) {
    throw new CloudNotFoundError(err instanceof Error ? err.message : String(err))
  }

  await mkdir(BACKUP_DIR, { recursive: true })
  const tmpPath = `${filepath}.tmp`
  const out = createWriteStream(tmpPath)
  try {
    await pipeline(cloudStream, out)
    await rename(tmpPath, filepath)
    return filepath
  } catch (err) {
    cloudStream.destroy?.()
    if (typeof out.destroy === "function") out.destroy()
    else out.close?.()
    await cleanupTempFile(tmpPath)
    throw err instanceof Error ? err : new Error(String(err))
  }
}

async function ensureLocalBackupFile(filename: string, notFoundMessage: string): Promise<string> {
  const filepath = path.join(BACKUP_DIR, filename)
  if (existsSync(filepath)) return filepath

  let pending = inflightCloudDownloads.get(filename)
  if (!pending) {
    pending = downloadBackupToLocal(filename).finally(() => {
      inflightCloudDownloads.delete(filename)
    })
    inflightCloudDownloads.set(filename, pending)
  }

  try {
    return await pending
  } catch (err) {
    if (err instanceof CloudNotFoundError) {
      throw new Error(notFoundMessage)
    }
    throw err
  }
}

/** Restore the DB from a backup file (DESTRUCTIVE — replaces current data).
 *  If the local copy is missing, it is downloaded from cloud first. */
export async function restoreBackup(filename: string): Promise<void> {
  if (!isValidBackupName(filename)) {
    throw new Error("Nama file backup tidak valid")
  }
  const filepath = await ensureLocalBackupFile(
    filename,
    "File backup tidak ditemukan (lokal maupun cloud)",
  )

  return new Promise((resolve, reject) => {
    try {
      const conn = parseDbUrl()
      const args = [
        `-h${conn.host}`,
        `-P${conn.port}`,
        `-u${conn.user}`,
        conn.database,
      ]
      // S4036: spawn dgn PATH tetap, bukan PATH dari pemanggil.
      const env = { ...process.env, PATH: SAFE_PATH } as NodeJS.ProcessEnv
      if (conn.password) env.MYSQL_PWD = conn.password

      const input = createReadStream(filepath)
      const child = spawn(MYSQL_BIN, args, { env })
      let stderr = ""
      let settled = false

      const fail = (err: Error) => {
        if (settled) return
        settled = true
        input.unpipe?.(child.stdin)
        input.destroy?.()
        if (!child.killed) child.kill?.()
        reject(err)
      }

      input.on("error", (err) => {
        fail(new Error(`Gagal membaca file backup: ${err.message}`))
      })
      child.stdin?.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EPIPE") {
          input.unpipe?.(child.stdin)
          input.destroy?.()
          return
        }
        fail(new Error(`Gagal mengirim backup ke mysql: ${err.message}`))
      })

      input.pipe(child.stdin)
      child.stderr.on("data", (d) => { stderr += String(d) })
      child.on("error", (err) => fail(new Error(`Gagal menjalankan mysql: ${err.message}`)))
      child.on("close", (code) => {
        if (settled) return
        settled = true
        input.destroy?.()
        if (code !== 0) {
          reject(new Error(`Restore gagal (exit ${code}): ${stderr.trim() || "unknown error"}`))
          return
        }
        resolve()
      })
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

export async function deleteBackup(filename: string): Promise<void> {
  if (!isValidBackupName(filename)) throw new Error("Nama file backup tidak valid")
  const filepath = path.join(BACKUP_DIR, filename)
  if (existsSync(filepath)) await unlink(filepath)
  // Remove cloud copy too (no-op if driver != r2)
  try {
    await deleteFromCloud(`${CLOUD_PREFIX}${filename}`)
  } catch {
    /* ignore cloud delete errors */
  }
}

/**
 * Delete existing auto-snapshot backups (keeps manual ones).
 * `keepFilename` mengecualikan satu snapshot — pemanggil restore membuat
 * snapshot baru lalu prune: tanpa pengecualian, prune menghapus snapshot
 * yang BARU dibuat itu juga (lokal + cloud) dan jaring pengaman restore
 * hilang sebelum operasi destruktif berjalan (putaran 51).
 */
export async function pruneAutoSnapshots(keepFilename?: string): Promise<void> {
  if (existsSync(BACKUP_DIR)) {
    const files = await readdir(BACKUP_DIR)
    await Promise.all(
      files
        .filter((f) => f.startsWith("backup-autosnap-") && f.endsWith(".sql") && f !== keepFilename)
        .map((f) => unlink(path.join(BACKUP_DIR, f)).catch(() => {}))
    )
  }
  // Prune cloud auto-snapshots too
  try {
    const keys = await listCloudKeys(`${CLOUD_PREFIX}backup-autosnap-`)
    await Promise.all(
      keys
        .filter((k) => k !== `${CLOUD_PREFIX}${keepFilename}`)
        .map((k) => deleteFromCloud(k).catch(() => {})),
    )
  } catch {
    /* ignore */
  }
}

export async function readBackupFile(filename: string): Promise<{ path: string; size: number }> {
  if (!isValidBackupName(filename)) throw new Error("Nama file backup tidak valid")
  const filepath = await ensureLocalBackupFile(filename, "File backup tidak ditemukan")
  const st = await stat(filepath)
  return { path: filepath, size: st.size }
}
