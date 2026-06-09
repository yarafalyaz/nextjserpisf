import "server-only"
import { spawn } from "child_process"
import { mkdir, readdir, stat, unlink, readFile, writeFile } from "fs/promises"
import { createWriteStream, createReadStream, existsSync } from "fs"
import path from "path"
import {
  uploadToCloudIfEnabled,
  listCloudKeys,
  downloadFromCloud,
  deleteFromCloud,
} from "@/lib/storage/storage"

const CLOUD_PREFIX = "backups/"

/**
 * Database backup/restore via mysqldump / mysql CLI.
 * Backups are stored OUTSIDE the web root (project-root /backups) so they are
 * never publicly downloadable. They contain the full dataset.
 */

const BACKUP_DIR = path.join(process.cwd(), "backups")

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

  // Local backups
  if (existsSync(BACKUP_DIR)) {
    const files = await readdir(BACKUP_DIR)
    for (const f of files) {
      if (!f.endsWith(".sql")) continue
      const st = await stat(path.join(BACKUP_DIR, f))
      map.set(f, { filename: f, size: st.size, createdAt: st.mtime.toISOString(), local: true, cloud: false })
    }
  }

  // Cloud backups (R2) — merge by filename
  try {
    const keys = await listCloudKeys(CLOUD_PREFIX)
    for (const key of keys) {
      const f = key.slice(CLOUD_PREFIX.length)
      if (!f.endsWith(".sql")) continue
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

/** Run mysqldump and stream output to a .sql file. Returns the created filename.
 *  Optional label is inserted into the filename (e.g. "autosnap"). */
export function createBackup(label?: string): Promise<BackupFile> {
  return new Promise(async (resolve, reject) => {
    try {
      const conn = parseDbUrl()
      await mkdir(BACKUP_DIR, { recursive: true })

      const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "-").slice(0, 19)
      const safeLabel = label ? `${label.replace(/[^a-zA-Z0-9]/g, "")}-` : ""
      const filename = `backup-${safeLabel}${ts}.sql`
      const filepath = path.join(BACKUP_DIR, filename)

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

      const env = { ...process.env }
      if (conn.password) env.MYSQL_PWD = conn.password

      const out = createWriteStream(filepath)
      const child = spawn("mysqldump", args, { env })
      let stderr = ""

      child.stdout.pipe(out)
      child.stderr.on("data", (d) => { stderr += String(d) })

      child.on("error", (err) => {
        out.close()
        reject(new Error(`Gagal menjalankan mysqldump: ${err.message}`))
      })

      child.on("close", async (code) => {
        out.close()
        if (code !== 0) {
          try { await unlink(filepath) } catch { /* ignore */ }
          reject(new Error(`Backup gagal (exit ${code}): ${stderr.trim() || "unknown error"}`))
          return
        }
        const st = await stat(filepath)
        let cloud = false
        try {
          const buffer = await readFile(filepath)
          cloud = await uploadToCloudIfEnabled(`${CLOUD_PREFIX}${filename}`, buffer, "application/sql")
        } catch (err) {
          console.warn("[backup] Upload ke cloud gagal:", err instanceof Error ? err.message : err)
        }
        resolve({ filename, size: st.size, createdAt: st.mtime.toISOString(), local: true, cloud })
      })
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

/** Restore the DB from a backup file (DESTRUCTIVE — replaces current data).
 *  If the local copy is missing, it is downloaded from cloud first. */
export async function restoreBackup(filename: string): Promise<void> {
  if (!isValidBackupName(filename)) {
    throw new Error("Nama file backup tidak valid")
  }
  const filepath = path.join(BACKUP_DIR, filename)

  // Ensure a local copy exists (download from cloud if needed for restore)
  if (!existsSync(filepath)) {
    try {
      const buffer = await downloadFromCloud(`${CLOUD_PREFIX}${filename}`)
      await mkdir(BACKUP_DIR, { recursive: true })
      await writeFile(filepath, buffer)
    } catch {
      throw new Error("File backup tidak ditemukan (lokal maupun cloud)")
    }
  }

  return new Promise((resolve, reject) => {
    const conn = parseDbUrl()
    const args = [
      `-h${conn.host}`,
      `-P${conn.port}`,
      `-u${conn.user}`,
      conn.database,
    ]
    const env = { ...process.env }
    if (conn.password) env.MYSQL_PWD = conn.password

    const input = createReadStream(filepath)
    const child = spawn("mysql", args, { env })
    let stderr = ""

    input.pipe(child.stdin)
    child.stderr.on("data", (d) => { stderr += String(d) })
    child.on("error", (err) => reject(new Error(`Gagal menjalankan mysql: ${err.message}`)))
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Restore gagal (exit ${code}): ${stderr.trim() || "unknown error"}`))
        return
      }
      resolve()
    })
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

/** Delete all existing auto-snapshot backups (keeps the manual ones). */
export async function pruneAutoSnapshots(): Promise<void> {
  if (existsSync(BACKUP_DIR)) {
    const files = await readdir(BACKUP_DIR)
    await Promise.all(
      files
        .filter((f) => f.startsWith("backup-autosnap-") && f.endsWith(".sql"))
        .map((f) => unlink(path.join(BACKUP_DIR, f)).catch(() => {}))
    )
  }
  // Prune cloud auto-snapshots too
  try {
    const keys = await listCloudKeys(`${CLOUD_PREFIX}backup-autosnap-`)
    await Promise.all(keys.map((k) => deleteFromCloud(k).catch(() => {})))
  } catch {
    /* ignore */
  }
}

export async function readBackupFile(filename: string): Promise<{ path: string; size: number }> {
  if (!isValidBackupName(filename)) throw new Error("Nama file backup tidak valid")
  const filepath = path.join(BACKUP_DIR, filename)
  if (!existsSync(filepath)) {
    // Pull from cloud on demand so download works for cloud-only backups
    try {
      const buffer = await downloadFromCloud(`${CLOUD_PREFIX}${filename}`)
      await mkdir(BACKUP_DIR, { recursive: true })
      await writeFile(filepath, buffer)
    } catch {
      throw new Error("File backup tidak ditemukan")
    }
  }
  const st = await stat(filepath)
  return { path: filepath, size: st.size }
}
