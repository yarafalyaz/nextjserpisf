"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import {
  acknowledgeDisciplinaryRecord,
  approveDisciplinaryRecord,
  recordLateDisciplinaryResponse,
  rejectDisciplinaryRecord,
  respondDisciplinaryRecord,
  submitDisciplinaryRecord,
  voidDisciplinaryRecord,
} from "@/actions/disciplinary.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"

interface RecordLike {
  id: number
  employeeId: number
  workflowStatus: string
  employeeResponse: string | null
  employeeResponseLate: boolean
  acknowledgmentAt: Date | string | null
  acknowledgmentRefused: boolean
  voidedAt: Date | string | null
  isVoidRecord: boolean
}

/**
 * DISC-F1: panel aksi workflow + tanggapan satu rekod. Semua keputusan
 * dijaga server (SoD, jendela 7 hari, scope); panel hanya memanggil aksi
 * dan menampilkan error verbatim. Tanggapan karyawan (self) hanya tampil
 * untuk karyawan pemilik rekod (canRespond dari page, turunan scope).
 */
export function DisciplinaryRecordActions({
  record,
  canCreate,
  canApprove,
  canRespond,
}: Readonly<{
  record: RecordLike
  canCreate: boolean
  canApprove: boolean
  /** Pemanggil adalah karyawan pemilik rekod (self-service tanggapan). */
  canRespond: boolean
}>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState<null | "approve" | "void">(null)
  const [rejectReason, setRejectReason] = useState("")
  const [voidReason, setVoidReason] = useState("")
  const [response, setResponse] = useState(record.employeeResponse ?? "")
  const [ackMethod, setAckMethod] = useState("")
  const [ackRefused, setAckRefused] = useState(false)

  const status = record.workflowStatus
  const showWorkflow =
    (status === "draft" && canCreate) ||
    (status === "pending_approval" && canApprove) ||
    status === "issued"

  function run(promise: Promise<{ success: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      const result = await promise
      if (!result.success) {
        showError(result.error ?? "Gagal memproses")
        return
      }
      showSuccess(ok)
      setConfirm(null)
      router.refresh()
    })
  }

  return (
    <section aria-label="Aksi surat peringatan" className="flex flex-col gap-5">
      {showWorkflow ? (
        <div className="flex flex-wrap gap-3">
          {status === "draft" && canCreate ? (
            <Button
              type="button"
              isDisabled={isPending}
              onPress={() =>
                run(submitDisciplinaryRecord(record.id), "Pengajuan diajukan untuk persetujuan")
              }
            >
              Ajukan untuk Persetujuan
            </Button>
          ) : null}

          {status === "pending_approval" && canApprove ? (
            <>
              <Button type="button" isDisabled={isPending} onPress={() => setConfirm("approve")}>
                Setujui &amp; Terbitkan
              </Button>
              <div className="flex w-full flex-col gap-1.5">
                <Label htmlFor={`reject-reason-${record.id}`}>Alasan Penolakan</Label>
                <Textarea
                  id={`reject-reason-${record.id}`}
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
                      run(rejectDisciplinaryRecord(record.id, rejectReason), "Pengajuan ditolak")
                    }
                  >
                    Tolak Pengajuan
                  </Button>
                </div>
              </div>
            </>
          ) : null}

          {status === "issued" && canApprove && !record.voidedAt && !record.isVoidRecord ? (
            <div className="flex w-full flex-col gap-1.5">
              <Label htmlFor={`void-reason-${record.id}`}>Alasan Pembatalan Rekod</Label>
              <Textarea
                id={`void-reason-${record.id}`}
                rows={2}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Pembatalan membuat rekod pembatal tertaut; isi rekod terbit tidak diubah"
              />
              <div>
                <Button
                  type="button"
                  variant="danger-soft"
                  isDisabled={isPending}
                  onPress={() => setConfirm("void")}
                >
                  Batalkan Rekod Terbit
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {status === "issued" && canCreate && !record.acknowledgmentAt ? (
        <div className="flex flex-col gap-2 border-t border-default pt-4">
          <h3 className="text-sm font-semibold text-foreground">Tanda Terima Karyawan</h3>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`ack-method-${record.id}`}>Cara Penerimaan</Label>
            <Textarea
              id={`ack-method-${record.id}`}
              rows={2}
              value={ackMethod}
              onChange={(e) => setAckMethod(e.target.value)}
              placeholder="Contoh: diserahkan langsung dan ditandatangani"
            />
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={ackRefused}
              onChange={(e) => setAckRefused(e.target.checked)}
              className="size-4"
            />
            Karyawan menolak menandatangani (dicatat sebagai fakta; SP tetap terbit)
          </label>
          <div>
            <Button
              type="button"
              isDisabled={isPending}
              onPress={() =>
                run(
                  acknowledgeDisciplinaryRecord(record.id, ackMethod, ackRefused),
                  "Tanda terima tercatat",
                )
              }
            >
              Catat Tanda Terima
            </Button>
          </div>
        </div>
      ) : null}

      {status === "issued" && record.acknowledgmentAt ? (
        <p className="border-t border-default pt-4 text-sm text-muted-foreground">
          Tanda terima sudah tercatat
          {record.acknowledgmentRefused ? " (karyawan menolak menandatangani)" : ""}.
        </p>
      ) : null}

      {status === "issued" && canRespond ? (
        <div className="flex flex-col gap-2 border-t border-default pt-4">
          <h3 className="text-sm font-semibold text-foreground">Tanggapan Anda</h3>
          <p className="text-xs text-muted-foreground">
            Tanggapan menempel pada rekod dan tidak mengubah jenjang. Jendela tanggapan 7 hari
            kalender sejak tanggal terbit; lewat jendela, sampaikan ke HR untuk ditempelkan
            berlabel terlambat.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`response-${record.id}`}>Tanggapan</Label>
            <Textarea
              id={`response-${record.id}`}
              rows={3}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="Tulis tanggapan Anda atas surat peringatan ini"
            />
          </div>
          <div>
            <Button
              type="button"
              isDisabled={isPending}
              onPress={() =>
                run(respondDisciplinaryRecord(record.id, response), "Tanggapan terkirim")
              }
            >
              Kirim Tanggapan
            </Button>
          </div>
        </div>
      ) : null}

      {status === "issued" && canCreate && !canRespond ? (
        <div className="flex flex-col gap-2 border-t border-default pt-4">
          <h3 className="text-sm font-semibold text-foreground">Tanggapan Karyawan (HR)</h3>
          {record.employeeResponse ? (
            <p className="text-sm text-foreground">
              {record.employeeResponse}
              {record.employeeResponseLate ? (
                <span className="ml-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                  (terlambat — ditempelkan HR)
                </span>
              ) : null}
            </p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Belum ada tanggapan tercatat. Bila karyawan menyampaikan tanggapan lewat jendela
                7 hari, tempelkan di sini — tercatat berlabel terlambat.
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`late-response-${record.id}`}>Tanggapan Terlambat</Label>
                <Textarea
                  id={`late-response-${record.id}`}
                  rows={3}
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  placeholder="Tanggapan karyawan yang disampaikan ke HR"
                />
              </div>
              <div>
                <Button
                  type="button"
                  isDisabled={isPending}
                  onPress={() =>
                    run(
                      recordLateDisciplinaryResponse(record.id, response),
                      "Tanggapan terlambat tercatat",
                    )
                  }
                >
                  Tempelkan Tanggapan Terlambat
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={confirm === "approve"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Setujui dan terbitkan surat peringatan?"
        body="Penerbitan menetapkan nomor dokumen dan tanggal terbit. SP3 dan SP pertama dan terakhir memerlukan penyetuju kedua berbeda sebelum terbit."
        confirmLabel="Setujui"
        variant="warning"
        isPending={isPending}
        onConfirm={() =>
          run(approveDisciplinaryRecord(record.id), "Pengajuan disetujui")
        }
      />
      <ConfirmDialog
        isOpen={confirm === "void"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Batalkan rekod peringatan terbit?"
        body="Isi rekod terbit tidak diubah. Pembatalan membuat rekod pembatal tertaut dan rekod ini keluar dari rantai jenjang."
        confirmLabel="Batalkan Rekod"
        variant="danger"
        isPending={isPending}
        onConfirm={() => run(voidDisciplinaryRecord(record.id, voidReason), "Rekod dibatalkan")}
      />
    </section>
  )
}
