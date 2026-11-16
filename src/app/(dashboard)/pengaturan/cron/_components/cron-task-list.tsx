"use client"

import { useState } from "react"
import { runCronTask } from "@/actions/cron.actions"
import { formatDate } from "@/lib/utils/format"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/shadcn/badge"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { createColumnHelper } from "@/lib/table"

type TaskStatus = {
  key: string
  name: string
  description: string
  schedule: string
  lastRun: {
    status: string
    message: string | null
    ranAt: Date | string
    duration: number | null
  } | null
}

type CronLog = {
  id: number
  task: string
  status: string
  message: string | null
  duration: number | null
  ranAt: Date | string
}

const logColumnHelper = createColumnHelper<CronLog>()

const logColumns = [
  logColumnHelper.accessor("ranAt", {
    header: "Waktu",
    cell: (info) => (
      <span className="whitespace-nowrap font-mono text-xs tabular-nums">
        {formatDate(info.getValue())}
      </span>
    ),
  }),
  logColumnHelper.accessor("task", {
    header: "Tugas",
    meta: { mobilePrimary: true },
    cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
  }),
  logColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
  logColumnHelper.accessor("duration", {
    header: "Durasi",
    meta: { align: "right" },
    cell: (info) => {
      const val = info.getValue()
      return (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {val !== null ? `${val}ms` : "-"}
        </span>
      )
    },
  }),
  logColumnHelper.accessor("message", {
    header: "Pesan",
    cell: (info) => (
      <span className="text-muted-foreground max-w-xs truncate block">
        {info.getValue() || "-"}
      </span>
    ),
  }),
]

export function CronTaskList({ tasks, logs }: { tasks: TaskStatus[]; logs: CronLog[] }) {
  const [running, setRunning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleRun(taskKey: string) {
    setRunning(taskKey)
    setError(null)
    try {
      await runCronTask(taskKey)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan")
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Task List */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Tugas Terjadwal</h2>
        </div>
        <div className="divide-y divide-default">
          {tasks.map((task) => (
            <div key={task.key} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{task.name}</h3>
                  {task.lastRun && (
                    <Badge variant={task.lastRun.status === "success" ? "default" : "destructive"}>
                      {task.lastRun.status === "success" ? "Sukses" : "Gagal"}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Jadwal: {task.schedule}
                  {task.lastRun && (
                    <> · Terakhir: {formatDate(task.lastRun.ranAt)}{" "}
                      {task.lastRun.duration !== null && <span className="text-muted-foreground">({task.lastRun.duration}ms)</span>}
                    </>
                  )}
                </p>
                {task.lastRun?.message && (
                  <p className="text-xs text-muted-foreground mt-1 truncate max-w-lg">{task.lastRun.message}</p>
                )}
              </div>
              <Button
                variant="primary"
                size="sm"
                isDisabled={running === task.key}
                onPress={() => handleRun(task.key)}
              >
                {running === task.key ? "Berjalan…" : "Jalankan Sekarang"}
              </Button>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Run History */}
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-default">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat 10 Eksekusi Terakhir</h2>
        </div>
        {logs.length === 0 ? (
          <EmptyState title="Belum ada riwayat" className="py-10" />
        ) : (
          <div className="p-4">
            <DataTable
              data={logs}
              columns={logColumns}
              ariaLabel="Riwayat 10 Eksekusi Terakhir"
              selectable={false}
              enableColumnToggle={false}
              enableExport={false}
              pageSize={50}
            />
          </div>
        )}
      </div>
    </div>
  )
}
