"use client"

import { useState } from "react"
import { runCronTask } from "@/actions/cron.actions"
import { formatDate } from "@/lib/utils/format"

type TaskStatus = {
  key: string
  name: string
  description: string
  schedule: string
  lastRun: {
    status: string
    message: string | null
    ranAt: Date
    duration: number | null
  } | null
}

type CronLog = {
  id: number
  task: string
  status: string
  message: string | null
  duration: number | null
  ranAt: Date
}

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
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Scheduled Tasks</h2>
        </div>
        <div className="divide-y divide-default">
          {tasks.map((task) => (
            <div key={task.key} className="flex items-center justify-between px-5 py-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{task.name}</h3>
                  {task.lastRun && (
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${
                        task.lastRun.status === "success"
                          ? "bg-success/10 text-success"
                          : "bg-danger/10 text-danger"
                      }`}
                    >
                      {task.lastRun.status === "success" ? "Sukses" : "Gagal"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted mt-0.5">{task.description}</p>
                <p className="text-xs text-muted mt-0.5">
                  Jadwal: {task.schedule}
                  {task.lastRun && (
                    <> · Terakhir: {formatDate(task.lastRun.ranAt)}{" "}
                      {task.lastRun.duration !== null && <span className="text-muted">({task.lastRun.duration}ms)</span>}
                    </>
                  )}
                </p>
                {task.lastRun?.message && (
                  <p className="text-xs text-muted mt-1 truncate max-w-lg">{task.lastRun.message}</p>
                )}
              </div>
              <button
                disabled={running === task.key}
                onClick={() => handleRun(task.key)}
                className="ml-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {running === task.key ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Berjalan…
                  </>
                ) : (
                  "Run Now"
                )}
              </button>
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
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Riwayat 10 Run Terakhir</h2>
        </div>
        {logs.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted">Belum ada riwayat</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-default text-left">
                  <th className="px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Waktu</th>
                  <th className="px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Task</th>
                  <th className="px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Durasi</th>
                  <th className="px-5 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Pesan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-5 py-3 text-foreground whitespace-nowrap">{formatDate(log.ranAt)}</td>
                    <td className="px-5 py-3 text-foreground font-mono text-xs">{log.task}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${
                          log.status === "success"
                            ? "bg-success/10 text-success"
                            : "bg-danger/10 text-danger"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted">{log.duration !== null ? `${log.duration}ms` : "-"}</td>
                    <td className="px-5 py-3 text-muted max-w-xs truncate">{log.message || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
