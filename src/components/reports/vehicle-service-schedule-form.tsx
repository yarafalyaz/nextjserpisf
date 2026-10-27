"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { updateCustomerVehicleServiceSchedule } from "@/actions/vehicle.actions"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/shadcn/label"
import { formatDate, formatNumber } from "@/lib/utils/format"
import { showError, showSuccess } from "@/lib/utils/toast"

function toInputDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : ""
}

/**
 * F-2026-10-25-021-S: form catat/ubah/kosongkan jadwal servis berikutnya
 * di detail kendaraan. Semua validasi bisnis diputus server lewat
 * `updateCustomerVehicleServiceSchedule` (izin edit_customers); error
 * server — termasuk penolakan km target <= odometer terakhir tercatat
 * dengan angka nyata (AC-SV-F3) — tampil verbatim. Keduanya kosong =
 * kosongkan jadwal. Tanpa hitung status di UI.
 */
export function VehicleServiceScheduleForm({
  vehicleId,
  nextServiceDate,
  nextServiceKm,
  nextServiceNote,
  lastOdometerKm,
  canEdit,
}: {
  vehicleId: number
  nextServiceDate: Date | null
  nextServiceKm: number | null
  nextServiceNote: string | null
  lastOdometerKm: number | null
  canEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const dateId = `next-service-date-${vehicleId}`
  const kmId = `next-service-km-${vehicleId}`
  const noteId = `next-service-note-${vehicleId}`

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        const result = await updateCustomerVehicleServiceSchedule(vehicleId, formData)
        if (result && !result.success) {
          showError(result.error || "Gagal mencatat jadwal servis berikutnya")
          return
        }
        showSuccess("Jadwal servis berikutnya berhasil disimpan")
        router.refresh()
      } catch (error) {
        showError(
          error instanceof Error
            ? error.message
            : "Gagal mencatat jadwal servis berikutnya",
        )
      }
    })
  }

  return (
    <section
      aria-label="Jadwal Servis Berikutnya"
      className="bg-surface rounded-xl border border-default shadow-sm overflow-hidden"
    >
      <div className="p-4 px-5 border-b border-default">
        <h2 className="text-[0.9375rem] font-semibold text-foreground">
          Jadwal Servis Berikutnya
        </h2>
      </div>
      <div className="p-4 px-5 flex flex-col gap-4">
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Tanggal Target
            </dt>
            <dd className="text-foreground font-medium">
              {nextServiceDate ? formatDate(nextServiceDate) : "Belum terjadwal"}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Km Target
            </dt>
            <dd className="text-foreground font-medium">
              {nextServiceKm != null ? `${formatNumber(nextServiceKm)} km` : "Belum terjadwal"}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Odometer Terakhir Tercatat
            </dt>
            <dd className="text-foreground font-medium">
              {lastOdometerKm != null
                ? `${formatNumber(lastOdometerKm)} km`
                : "Belum pernah tercatat"}
            </dd>
          </div>
        </dl>
        {nextServiceNote ? (
          <p className="text-sm text-muted-foreground">{nextServiceNote}</p>
        ) : null}
        {canEdit ? (
          <form
            onSubmit={onSubmit}
            aria-busy={isPending}
            aria-label="Formulir jadwal servis berikutnya"
            className="flex flex-col gap-4 border-t border-default pt-4"
          >
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={dateId}>Tanggal Servis Berikutnya</Label>
                <input
                  id={dateId}
                  name="nextServiceDate"
                  type="date"
                  defaultValue={toInputDate(nextServiceDate)}
                  disabled={isPending}
                  className="min-h-11 w-full rounded-lg border border-default bg-surface px-3 py-2.5 text-sm text-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  Boleh kosong. Tanggal lampau akan langsung terlewat.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={kmId}>Km Servis Berikutnya</Label>
                <input
                  id={kmId}
                  name="nextServiceKm"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  defaultValue={nextServiceKm ?? ""}
                  disabled={isPending}
                  className="min-h-11 w-full rounded-lg border border-default bg-surface px-3 py-2.5 text-sm text-foreground"
                />
                <p className="text-xs text-muted-foreground">
                  {lastOdometerKm != null
                    ? `Harus lebih besar dari odometer terakhir tercatat (${formatNumber(lastOdometerKm)} km); penolakan server tampil apa adanya.`
                    : "Boleh kosong. Isi tanggal saja atau km saja juga sah."}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={noteId}>Catatan Jadwal</Label>
              <textarea
                id={noteId}
                name="nextServiceNote"
                rows={2}
                maxLength={1000}
                defaultValue={nextServiceNote ?? ""}
                disabled={isPending}
                className="w-full rounded-lg border border-default bg-surface px-3 py-2.5 text-sm text-foreground"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" isDisabled={isPending}>
                {isPending ? "Menyimpan…" : "Simpan Jadwal Servis"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Kosongkan tanggal dan km lalu simpan untuk menghapus jadwal.
            </p>
          </form>
        ) : (
          <p className="border-t border-default pt-4 text-sm text-muted-foreground">
            Anda tidak memiliki izin mencatat jadwal servis kendaraan ini.
          </p>
        )}
      </div>
    </section>
  )
}
