"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  initializeWorkOrderOperations,
  updateWorkOrderOperationStatus,
} from "@/actions/manufacturing.actions"
import { setWorkOrderOperationWorkCenter } from "@/actions/work-center.actions"
import { FormSelect } from "@/components/ui/form-select"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showError, showSuccess } from "@/lib/utils/toast"
import type { WorkOrderOperationRow } from "@/lib/reports/work-order-progress"

/**
 * F-2026-10-21-020 Tahap B: aksi transisi tahap WO (client boundary).
 * Aturan urutan/izin ditegakkan server; UI hanya meanjurkan tombol yang
 * sah menurut builder (isActionable) dan menolak skip tanpa alasan di
 * klien (penegak tetap server, vonis Q2).
 */
export function WorkOrderOperationActions({
  workOrderId,
  workOrderStatus,
  row,
}: Readonly<{
  workOrderId: number
  workOrderStatus: string
  row: WorkOrderOperationRow
}>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [skipOpen, setSkipOpen] = useState(false)
  const [skipNotes, setSkipNotes] = useState("")

  if (workOrderStatus !== "in_progress") return null

  function run(
    fn: () => Promise<{ success: boolean; error?: string }>,
    okMsg: string,
  ) {
    startTransition(async () => {
      try {
        const res = await fn()
        if (res?.success) {
          showSuccess(okMsg)
          router.refresh()
        } else {
          showError(res?.error || "Gagal memproses tahap")
        }
      } catch (e) {
        showError(e instanceof Error ? e.message : "Gagal memproses tahap")
      }
    })
  }

  const skipInvalid = skipNotes.trim().length === 0

  return (
    <span className="flex flex-wrap gap-2">
      {row.status === "pending" && row.isActionable ? (
        <>
          <Button
            variant="secondary"
            isDisabled={isPending}
            aria-label={`Mulai tahap ${row.name}`}
            onPress={() =>
              run(
                () =>
                  updateWorkOrderOperationStatus(
                    workOrderId,
                    row.id,
                    "in_progress",
                  ),
                `Tahap ${row.name} dimulai`,
              )
            }
          >
            Mulai Tahap
          </Button>
          <Button
            variant="primary"
            isDisabled={isPending}
            aria-label={`Selesaikan tahap ${row.name}`}
            onPress={() =>
              run(
                () =>
                  updateWorkOrderOperationStatus(workOrderId, row.id, "completed"),
                `Tahap ${row.name} selesai`,
              )
            }
          >
            Selesaikan Tahap
          </Button>
        </>
      ) : null}
      {row.status === "in_progress" && row.isActionable ? (
        <Button
          variant="primary"
          isDisabled={isPending}
          aria-label={`Selesaikan tahap ${row.name}`}
          onPress={() =>
            run(
              () =>
                updateWorkOrderOperationStatus(workOrderId, row.id, "completed"),
              `Tahap ${row.name} selesai`,
            )
          }
        >
          Selesaikan Tahap
        </Button>
      ) : null}
      {(row.status === "pending" || row.status === "in_progress") && row.isActionable ? (
        <Button
          variant="secondary"
          isDisabled={isPending}
          aria-label={`Lewati tahap ${row.name}`}
          onPress={() => setSkipOpen(true)}
        >
          Lewati Tahap
        </Button>
      ) : null}
      {row.status === "completed" || row.status === "skipped" ? (
        <Button
          variant="secondary"
          isDisabled={isPending}
          aria-label={`Buka lagi tahap ${row.name}`}
          onPress={() =>
            run(
              () =>
                updateWorkOrderOperationStatus(workOrderId, row.id, "pending"),
              `Tahap ${row.name} dibuka lagi`,
            )
          }
        >
          Buka Lagi
        </Button>
      ) : null}
      <ConfirmDialog
        isOpen={skipOpen}
        onOpenChange={setSkipOpen}
        title={`Lewati tahap ${row.name}?`}
        variant="warning"
        confirmLabel="Lewati Tahap"
        isPending={isPending}
        onConfirm={() => {
          if (skipInvalid) {
            showError(
              "Tahap yang dilewati wajib diisi alasan — melewati tahap mengubah dasar hitung progres.",
            )
            return
          }
          const notes = skipNotes.trim()
          run(
            () =>
              updateWorkOrderOperationStatus(
                workOrderId,
                row.id,
                "skipped",
                notes,
              ),
            `Tahap ${row.name} dilewati`,
          )
          setSkipOpen(false)
          setSkipNotes("")
        }}
      >
        <div className="flex flex-col gap-2">
          <label
            htmlFor={`alasan-lewati-${row.id}`}
            className="text-sm font-medium"
          >
            Alasan melewati tahap
          </label>
          <textarea
            id={`alasan-lewati-${row.id}`}
            aria-label="Alasan melewati tahap"
            aria-required="true"
            value={skipNotes}
            onChange={(e) => setSkipNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-default bg-background px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Alasan wajib diisi. Tahap yang dilewati tidak masuk dasar hitung
            progres.
          </p>
        </div>
      </ConfirmDialog>
    </span>
  )
}

export interface WorkCenterOption {
  id: number
  name: string
  isActive: boolean
}

/**
 * F-2026-10-22-090-S (BOT 2): pilihan stasiun di tahap WO.
 * Pilihan baru hanya stasiun aktif (server juga menolak nonaktif);
 * stasiun lama nonaktif tetap tampil sebagai nilai terpilih supaya
 * tahap historis terbaca (BR-LP-06). Kosong = "Belum ada stasiun".
 * Dirender hanya untuk pemegang edit_work_orders; tidak memblokir
 * start WO (BR-LP-05).
 */
export function WorkOrderOperationWorkCenterSelect({
  workOrderId,
  row,
  centers,
}: Readonly<{
  workOrderId: number
  row: WorkOrderOperationRow
  centers: WorkCenterOption[]
}>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const currentCenter = centers.find((c) => c.id === row.workCenterId)
  const options = [
    { value: "", label: "Belum ada stasiun" },
    ...centers
      .filter((c) => c.isActive || c.id === row.workCenterId)
      .map((c) => ({
        value: String(c.id),
        label: c.isActive ? c.name : `${c.name} (nonaktif)`,
      })),
  ]

  return (
    <span className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Stasiun: {currentCenter?.name ?? "Belum ada stasiun"}</span>
      <FormSelect
        aria-label={`Stasiun tahap ${row.name}`}
        options={options}
        value={row.workCenterId === null ? "" : String(row.workCenterId)}
        disabled={isPending}
        onValueChange={(value) => {
          const nextId = value === "" ? null : Number(value)
          if (nextId === row.workCenterId) return
          startTransition(async () => {
            try {
              const res = await setWorkOrderOperationWorkCenter(
                workOrderId,
                row.id,
                nextId,
              )
              if (res?.success) {
                showSuccess(
                  nextId === null
                    ? `Stasiun tahap ${row.name} dikosongkan`
                    : `Stasiun tahap ${row.name} ditetapkan`,
                )
                router.refresh()
              } else {
                showError(res?.error || "Gagal menetapkan stasiun tahap")
              }
            } catch (e) {
              showError(
                e instanceof Error
                  ? e.message
                  : "Gagal menetapkan stasiun tahap",
              )
            }
          })
        }}
      />
    </span>
  )
}

/** Tombol inisialisasi tahap untuk WO in_progress belum bertahap. */
export function InitializeStagesButton({
  workOrderId,
}: Readonly<{ workOrderId: number }>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  return (
    <Button
      variant="secondary"
      isDisabled={isPending}
      onPress={() =>
        startTransition(async () => {
          try {
            const res = await initializeWorkOrderOperations(workOrderId)
            if (res?.success) {
              showSuccess(
                "message" in res && res.message
                  ? res.message
                  : "Tahap perintah kerja diinisialisasi",
              )
              router.refresh()
            } else {
              showError(
                (res as { error?: string })?.error ||
                  "Gagal menginisialisasi tahap",
              )
            }
          } catch (e) {
            showError(
              e instanceof Error ? e.message : "Gagal menginisialisasi tahap",
            )
          }
        })
      }
    >
      Inisialisasi Tahap
    </Button>
  )
}
