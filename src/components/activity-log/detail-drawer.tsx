"use client"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/shadcn/sheet"
import { Badge } from "@/components/ui/shadcn/badge"

interface DetailDrawerProps {
  open: boolean
  onClose: () => void
  row: {
    id: number
    userName: string
    action: string
    modelType: string
    modelId: number | null
    description: string
    createdAt: string
    ipAddress: string
    oldValues?: unknown
    newValues?: unknown
  } | null
}

const actionLabel: Record<string, string> = {
  create: "Buat", CREATE: "Buat",
  update: "Ubah", UPDATE: "Ubah",
  delete: "Hapus", DELETE: "Hapus",
  login: "Login", LOGIN: "Login",
}

function DiffBlock({
  oldVals,
  newVals,
}: {
  oldVals: unknown
  newVals: unknown
}) {
  const oldObj =
    oldVals && typeof oldVals === "object"
      ? (oldVals as Record<string, unknown>)
      : null
  const newObj =
    newVals && typeof newVals === "object"
      ? (newVals as Record<string, unknown>)
      : null

  if (!oldObj && !newObj) {
    return (
      <p className="text-xs text-muted-foreground" role="status">
        Tidak ada data perubahan
      </p>
    )
  }

  const allKeys = Array.from(
    new Set([
      ...Object.keys(oldObj ?? {}),
      ...Object.keys(newObj ?? {}),
    ]),
  ).sort()

  if (allKeys.length === 0) {
    return (
      <p className="text-xs text-muted-foreground" role="status">
        Tidak ada data perubahan
      </p>
    )
  }

  const changedCount = allKeys.filter((k) => {
    const oldStr = oldObj?.[k] === undefined ? "-" : JSON.stringify(oldObj[k])
    const newStr = newObj?.[k] === undefined ? "-" : JSON.stringify(newObj[k])
    return oldStr !== newStr
  }).length

  return (
    <dl
      className="space-y-1.5"
      aria-label={`Perubahan data: ${changedCount} dari ${allKeys.length} kolom berubah`}
    >
      {allKeys.map((key) => {
        const oldVal = oldObj?.[key]
        const newVal = newObj?.[key]
        const oldStr = oldVal === undefined ? "-" : JSON.stringify(oldVal)
        const newStr = newVal === undefined ? "-" : JSON.stringify(newVal)
        const changed = oldStr !== newStr

        return (
          <div
            key={key}
            className={`rounded px-2 py-1.5 text-xs ${
              changed
                ? "bg-amber-50 dark:bg-amber-950/30"
                : "bg-muted/50"
            }`}
            role={changed ? "group" : undefined}
            aria-label={
              changed
                ? `${key}: berubah dari ${oldStr} menjadi ${newStr}`
                : undefined
            }
          >
            <dt className="font-medium">{key}</dt>
            {changed ? (
              <dd className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                <span className="text-red-600 line-through dark:text-red-400">
                  {oldStr}
                </span>
                <span aria-hidden="true" className="text-muted-foreground">→</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {newStr}
                </span>
              </dd>
            ) : (
              <dd className="text-muted-foreground">{newStr}</dd>
            )}
          </div>
        )
      })}
    </dl>
  )
}

export function DetailDrawer({
  open,
  onClose,
  row,
}: DetailDrawerProps) {
  if (!row) return null

  const d = new Date(row.createdAt)
  const actionText = actionLabel[row.action] || row.action

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Detail Log Aktivitas</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Meta — proper <dl> for term/description pairs */}
          <dl
            className="grid grid-cols-1 gap-x-3 gap-y-3 text-sm sm:grid-cols-2"
            aria-label="Metadata log aktivitas"
          >
            <div className="space-y-0.5">
              <dt className="text-muted-foreground">Waktu</dt>
              <dd className="font-medium">
                <time dateTime={row.createdAt}>
                  {d.toLocaleDateString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}{" "}
                  {d.toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-muted-foreground">Pengguna</dt>
              <dd className="font-medium">{row.userName}</dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-muted-foreground">Aksi</dt>
              <dd>
                <Badge variant="secondary" aria-label={`Aksi: ${actionText}`}>
                  {actionText}
                </Badge>
              </dd>
            </div>
            <div className="space-y-0.5">
              <dt className="text-muted-foreground">Model</dt>
              <dd className="font-medium">
                {row.modelType}
                {row.modelId ? ` #${row.modelId}` : ""}
              </dd>
            </div>
            <div className="space-y-0.5 sm:col-span-2">
              <dt className="text-muted-foreground">Deskripsi</dt>
              <dd className="font-medium">{row.description}</dd>
            </div>
            <div className="space-y-0.5 sm:col-span-2">
              <dt className="text-muted-foreground">Alamat IP</dt>
              <dd className="font-mono text-xs">{row.ipAddress}</dd>
            </div>
          </dl>

          {/* Diff */}
          <section aria-labelledby="activity-diff-heading">
            <h3
              id="activity-diff-heading"
              className="mb-2 text-sm font-medium"
            >
              Perubahan Data
            </h3>
            <DiffBlock oldVals={row.oldValues} newVals={row.newValues} />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
