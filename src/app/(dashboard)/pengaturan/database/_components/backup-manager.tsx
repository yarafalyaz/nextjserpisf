"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from "@/components/ui/shadcn/card"
import { Button } from "@/components/ui/shadcn/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import { Database, Download, RotateCcw, Trash2, Loader2, DatabaseBackup } from "lucide-react"
import { showError, showSuccess } from "@/lib/utils/toast"
import {
  createDatabaseBackup,
  restoreDatabaseBackup,
  deleteDatabaseBackup,
  type BackupResult,
} from "@/actions/database.actions"

interface BackupFile {
  filename: string
  size: number
  createdAt: string
}

function formatSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

export function BackupManager({ initialBackups }: { initialBackups: BackupFile[] }) {
  const router = useRouter()
  const [isCreating, startCreate] = useTransition()
  const [actionPending, startAction] = useTransition()
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [withSnapshot, setWithSnapshot] = useState(true)

  const handleResult = (r: BackupResult) => {
    if (r.success) showSuccess(r.message)
    else showError(r.message)
    router.refresh()
  }

  const onCreate = () => {
    startCreate(async () => {
      handleResult(await createDatabaseBackup())
    })
  }

  const onRestore = () => {
    if (!restoreTarget) return
    const file = restoreTarget
    startAction(async () => {
      const r = await restoreDatabaseBackup(file, withSnapshot)
      setRestoreTarget(null)
      handleResult(r)
    })
  }

  const onDelete = () => {
    if (!deleteTarget) return
    const file = deleteTarget
    startAction(async () => {
      const r = await deleteDatabaseBackup(file)
      setDeleteTarget(null)
      handleResult(r)
    })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4 text-primary" /> Daftar Backup
          </CardTitle>
          <CardDescription>Backup tersimpan di server (folder privat, tidak bisa diakses publik).</CardDescription>
          <CardAction>
            <Button onClick={onCreate} disabled={isCreating}>
              {isCreating ? <Loader2 className="size-4 animate-spin" /> : <DatabaseBackup className="size-4" />}
              {isCreating ? "Membuat..." : "Buat Backup"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto border-t">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="px-4 lg:px-6">Nama File</TableHead>
                  <TableHead className="px-4 lg:px-6">Ukuran</TableHead>
                  <TableHead className="px-4 lg:px-6">Dibuat</TableHead>
                  <TableHead className="px-4 text-right lg:px-6">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialBackups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      Belum ada backup. Klik &quot;Buat Backup&quot; untuk membuat cadangan pertama.
                    </TableCell>
                  </TableRow>
                ) : (
                  initialBackups.map((b) => (
                    <TableRow key={b.filename}>
                      <TableCell className="px-4 font-mono text-xs lg:px-6">{b.filename}</TableCell>
                      <TableCell className="px-4 tabular-nums lg:px-6">{formatSize(b.size)}</TableCell>
                      <TableCell className="px-4 text-muted-foreground lg:px-6">{formatDateTime(b.createdAt)}</TableCell>
                      <TableCell className="px-4 lg:px-6">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="icon-sm" title="Unduh">
                            <a href={`/api/backup/download?file=${encodeURIComponent(b.filename)}`} download>
                              <Download className="size-4" />
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Restore"
                            onClick={() => setRestoreTarget(b.filename)}
                            disabled={actionPending}
                          >
                            <RotateCcw className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Hapus"
                            onClick={() => setDeleteTarget(b.filename)}
                            disabled={actionPending}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        isOpen={!!restoreTarget}
        onOpenChange={(o) => !o && setRestoreTarget(null)}
        title="Restore Database?"
        variant="danger"
        confirmLabel={actionPending ? "Memproses..." : "Ya, Restore"}
        isPending={actionPending}
        onConfirm={onRestore}
        body={
          <span>
            Tindakan ini akan <strong>menimpa SELURUH data database saat ini</strong> dengan isi dari{" "}
            <code className="font-mono">{restoreTarget}</code>. Tindakan ini tidak bisa dibatalkan dengan mudah.
            <label className="mt-3 flex items-center gap-2 text-sm font-normal text-foreground">
              <Checkbox
                checked={withSnapshot}
                onCheckedChange={(v) => setWithSnapshot(v === true)}
              />
              Buat snapshot otomatis dulu (cuma simpan 1 yang terbaru)
            </label>
          </span>
        }
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Hapus Backup?"
        variant="danger"
        confirmLabel={actionPending ? "Menghapus..." : "Hapus"}
        isPending={actionPending}
        onConfirm={onDelete}
        body={
          <span>
            File backup <code className="font-mono">{deleteTarget}</code> akan dihapus permanen dari server.
          </span>
        }
      />
    </>
  )
}
