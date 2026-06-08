import "server-only"
import { spawn } from "child_process"
import { mkdir, readdir, stat, unlink } from "fs/promises"
import { createWriteStream, createReadStream, existsSync } from "fs"
import path from "path"

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
}

function isValidBackupName(name: string): boolean {
  // Only our generated names: backup-YYYYMMDD-HHMMSS[...].sql — no path traversal
  return /^backup-[\w-]+\.sql$/.test(name) && !name.includes("..") && !name.includes("/")
}

export async function listBackups(): Promise<BackupFile[]> {
  if (!existsSync(BACKUP_DIR)) return []
  const files = await readdir(BACKUP_DIR)
  const result: BackupFile[] = []
  for (const f of files) {
    if (!f.endsWith(".sql")) continue
    const st = await stat(path.join(BACKUP_DIR, f))
    result.push({ filename: f, size: st.size, createdAt: st.mtime.toISOString() })
  }
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
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
        resolve({ filename, size: st.size, createdAt: st.mtime.toISOString() })
      })
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)))
    }
  })
}

/** Restore the DB from a backup file (DESTRUCTIVE — replaces current data). */
export function restoreBackup(filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isValidBackupName(filename)) {
      reject(new Error("Nama file backup tidak valid"))
      return
    }
    const filepath = path.join(BACKUP_DIR, filename)
    if (!existsSync(filepath)) {
      reject(new Error("File backup tidak ditemukan"))
      return
    }

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
}

/** Delete all existing auto-snapshot backups (keeps the manual ones). */
export async function pruneAutoSnapshots(): Promise<void> {
  if (!existsSync(BACKUP_DIR)) return
  const files = await readdir(BACKUP_DIR)
  await Promise.all(
    files
      .filter((f) => f.startsWith("backup-autosnap-") && f.endsWith(".sql"))
      .map((f) => unlink(path.join(BACKUP_DIR, f)).catch(() => {}))
  )
}

export async function readBackupFile(filename: string): Promise<{ path: string; size: number }> {
  if (!isValidBackupName(filename)) throw new Error("Nama file backup tidak valid")
  const filepath = path.join(BACKUP_DIR, filename)
  if (!existsSync(filepath)) throw new Error("File backup tidak ditemukan")
  const st = await stat(filepath)
  return { path: filepath, size: st.size }
}
