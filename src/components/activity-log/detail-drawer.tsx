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
      <p className="text-xs text-muted-foreground">
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
      <p className="text-xs text-muted-foreground">
        Tidak ada data perubahan
      </p>
    )
  }

  return (
    <div className="space-y-1">
      {allKeys.map((key) => {
        const oldVal = oldObj?.[key]
        const newVal = newObj?.[key]
        const oldStr = oldVal === undefined ? "-" : JSON.stringify(oldVal)
        const newStr = newVal === undefined ? "-" : JSON.stringify(newVal)
        const changed = oldStr !== newStr

        return (
          <div
            key={key}
            className={`rounded px-2 py-1 text-xs ${
              changed
                ? "bg-amber-50 dark:bg-amber-950/30"
                : "bg-muted/50"
            }`}
          >
            <span className="font-medium">{key}</span>
            {changed ? (
              <div className="mt-0.5 flex gap-2">
                <span className="text-red-600 line-through dark:text-red-400">
                  {oldStr}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  {newStr}
                </span>
              </div>
            ) : (
              <div className="text-muted-foreground">{newStr}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function DetailDrawer({
  open,
  onClose,
  row,
}: DetailDrawerProps) {
  if (!row) return null

  const d = new Date(row.createdAt)

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Detail Log Aktivitas</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Waktu</span>
              <div className="font-medium">
                {d.toLocaleDateString("id-ID", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}{" "}
                {d.toLocaleTimeString("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Pengguna</span>
              <div className="font-medium">{row.userName}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Aksi</span>
              <div>
                <Badge variant="outline">
                  {actionLabel[row.action] || row.action}
                </Badge>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Model</span>
              <div className="font-medium">
                {row.modelType}
                {row.modelId ? ` #${row.modelId}` : ""}
              </div>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Deskripsi</span>
              <div className="font-medium">{row.description}</div>
            </div>
            <div>
              <span className="text-muted-foreground">IP</span>
              <div className="font-mono text-xs">{row.ipAddress}</div>
            </div>
          </div>

          {/* Diff */}
          <div>
            <h3 className="mb-2 text-sm font-medium">Perubahan Data</h3>
            <DiffBlock oldVals={row.oldValues} newVals={row.newValues} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
