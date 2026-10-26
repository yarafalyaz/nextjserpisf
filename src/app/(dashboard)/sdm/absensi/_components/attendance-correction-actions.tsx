"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import {
  approveAttendanceCorrection,
  cancelAttendanceCorrection,
  rejectAttendanceCorrection,
} from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"

/**
 * Aksi putusan + pembatalan satu pengajuan koreksi absensi (F-2026-10-25-010-S).
 * Semua penjaga (izin approve, larangan self-approve, konflik EC-1, gerbang
 * slip final) ditegakkan server; komponen hanya memanggil aksi dan
 * menampilkan error server verbatim. Tombol tampil hanya untuk baris
 * `pending` dan hanya bagi pemegang izin terkait (dari page RSC).
 */
export function AttendanceCorrectionActions({
  correctionId,
  canApprove,
  canCancel,
}: Readonly<{
  correctionId: number
  canApprove: boolean
  canCancel: boolean
}>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [rejectReason, setRejectReason] = useState("")

  function run(promise: Promise<{ success: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const result = await promise
      if (!result.success) {
        showError(result.error ?? "Gagal memproses pengajuan")
        return
      }
      showSuccess(ok)
      setConfirmApprove(false)
      router.refresh()
    })
  }

  if (!canApprove && !canCancel) return null

  return (
    <div className="flex flex-col gap-2">
      {canApprove ? (
        <>
          <Button type="button" isDisabled={isPending} onPress={() => setConfirmApprove(true)}>
            Setujui
          </Button>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`correction-reject-reason-${correctionId}`}>Alasan Penolakan</Label>
            <Textarea
              id={`correction-reject-reason-${correctionId}`}
              rows={2}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Wajib diisi bila menolak pengajuan"
            />
            <div>
              <Button
                type="button"
                variant="danger-soft"
                isDisabled={isPending}
                onPress={() =>
                  run(rejectAttendanceCorrection(correctionId, rejectReason), "Pengajuan ditolak")
                }
              >
                Tolak
              </Button>
            </div>
          </div>
          <ConfirmDialog
            isOpen={confirmApprove}
            onOpenChange={setConfirmApprove}
            title="Setujui Koreksi Absensi?"
            body="Persetujuan menulis rekod absensi induk sesuai usulan. Bila rekod sudah berubah sesudah pengajuan, server menolak persetujuan ini dan pengajuan tetap menunggu."
            confirmLabel="Setujui"
            variant="primary"
            isPending={isPending}
            onConfirm={() =>
              run(approveAttendanceCorrection(correctionId), "Koreksi absensi disetujui")
            }
          />
        </>
      ) : null}
      {canCancel ? (
        <div>
          <Button
            type="button"
            variant="danger-soft"
            isDisabled={isPending}
            onPress={() =>
              run(cancelAttendanceCorrection(correctionId), "Pengajuan koreksi dibatalkan")
            }
          >
            Batalkan Pengajuan
          </Button>
        </div>
      ) : null}
    </div>
  )
}
