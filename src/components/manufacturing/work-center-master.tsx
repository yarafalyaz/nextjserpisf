"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import {
  createWorkCenter,
  updateWorkCenter,
  deactivateWorkCenter,
} from "@/actions/work-center.actions"
import type { WorkCenterLoadPlanCenterInput } from "@/lib/reports/work-center-load-plan"
import { showError, showSuccess } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"

/**
 * F-2026-10-22-090-S (BOT 2): master Stasiun Kerja (kata §6 verbatim).
 *
 * Aksi server penjaga `edit_work_orders` (Q-LP-2); komponen ini hanya
 * dirender untuk pemegang izin itu (gerbang di page). Error server
 * tampil verbatim. Nonaktif lewat konfirmasi; tidak ada hapus (Restrict).
 */
export function WorkCenterMaster({
  centers,
}: Readonly<{ centers: WorkCenterLoadPlanCenterInput[] }>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] =
    useState<WorkCenterLoadPlanCenterInput | null>(null)
  const [deactivating, setDeactivating] =
    useState<WorkCenterLoadPlanCenterInput | null>(null)

  function run(
    fn: () => Promise<{ success: boolean; error?: string }>,
    ok: string,
  ) {
    startTransition(async () => {
      try {
        const result = await fn()
        if (!result.success) {
          showError(result.error || "Gagal menyimpan stasiun kerja")
          return
        }
        showSuccess(ok)
        setEditing(null)
        setDeactivating(null)
        router.refresh()
      } catch (e) {
        showError(
          e instanceof Error ? e.message : "Gagal menyimpan stasiun kerja",
        )
      }
    })
  }

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    // Checkbox absen = undefined di server -> isActive lama dipertahankan;
    // kirim eksplisit supaya aktif-kembali dari form ubah benar-benar menyala.
    formData.set("isActive", editing ? String(editing.isActive) : "true")
    if (editing) {
      run(
        () => updateWorkCenter(editing.id, formData),
        "Stasiun kerja berhasil diubah",
      )
    } else {
      run(() => createWorkCenter(formData), "Stasiun kerja berhasil ditambahkan")
    }
  }

  return (
    <section
      aria-label="Stasiun Kerja"
      className="flex flex-col gap-6"
    >
      <div className="bg-surface rounded-xl border border-default shadow-sm overflow-x-auto">
        <div className="border-b border-default p-4 px-5">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">
            Stasiun Kerja
          </h2>
        </div>
        {centers.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Belum ada stasiun kerja tercatat.
          </p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-default text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nama Stasiun</th>
                <th className="px-4 py-3 font-medium text-right">
                  Kapasitas Jam per Hari
                </th>
                <th className="px-4 py-3 font-medium text-right">
                  Stasiun Paralel
                </th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {centers.map((center) => (
                <tr
                  key={center.id}
                  className="border-b border-default last:border-0"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {center.name}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {center.capacityHoursPerDay}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {center.parallelStations}
                  </td>
                  <td className="px-4 py-3">
                    {center.isActive ? "Aktif" : "Nonaktif"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onPress={() => setEditing(center)}
                      >
                        Ubah
                      </Button>
                      {center.isActive ? (
                        <Button
                          type="button"
                          variant="secondary"
                          isDisabled={isPending}
                          aria-label={`Nonaktifkan Stasiun ${center.name}`}
                          onPress={() => setDeactivating(center)}
                        >
                          Nonaktifkan Stasiun
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        aria-busy={isPending}
        aria-label={
          editing ? "Formulir ubah stasiun kerja" : "Formulir tambah stasiun"
        }
        className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6"
      >
        <h2 className="mb-4 text-base font-semibold text-foreground">
          {editing ? `Ubah Stasiun: ${editing.name}` : "Tambah Stasiun"}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wc-name">
              Nama Stasiun{" "}
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </Label>
            <Input
              id="wc-name"
              name="name"
              required
              defaultValue={editing?.name ?? ""}
              key={editing?.id ?? "new"}
              placeholder="cth. Las"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wc-capacity">
              Kapasitas Jam per Hari{" "}
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </Label>
            <Input
              id="wc-capacity"
              name="capacityHoursPerDay"
              type="number"
              step="0.5"
              min="0.5"
              max="24"
              required
              defaultValue={editing?.capacityHoursPerDay ?? ""}
              key={`cap-${editing?.id ?? "new"}`}
              placeholder="cth. 8"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wc-parallel">
              Jumlah Stasiun Paralel{" "}
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </Label>
            <Input
              id="wc-parallel"
              name="parallelStations"
              type="number"
              step="1"
              min="1"
              max="100"
              required
              defaultValue={editing?.parallelStations ?? 1}
              key={`par-${editing?.id ?? "new"}`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wc-sort">Urutan Tampil</Label>
            <Input
              id="wc-sort"
              name="sortOrder"
              type="number"
              step="1"
              min="0"
              defaultValue={editing?.sortOrder ?? 0}
              key={`sort-${editing?.id ?? "new"}`}
            />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {editing ? (
            <Button
              type="button"
              variant="secondary"
              onPress={() => setEditing(null)}
            >
              Batal Ubah
            </Button>
          ) : null}
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending
              ? "Menyimpan..."
              : editing
                ? "Simpan Perubahan"
                : "Tambah Stasiun"}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        isOpen={deactivating !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivating(null)
        }}
        title={
          deactivating
            ? `Nonaktifkan Stasiun ${deactivating.name}?`
            : "Nonaktifkan Stasiun"
        }
        variant="warning"
        confirmLabel="Nonaktifkan Stasiun"
        isPending={isPending}
        onConfirm={() => {
          if (!deactivating) return
          run(
            () => deactivateWorkCenter(deactivating.id),
            "Stasiun kerja dinonaktifkan",
          )
        }}
      >
        <p className="text-sm text-muted-foreground">
          Stasiun nonaktif tidak dapat dipilih untuk tahap baru. Tahap lama
          yang sudah menunjuk stasiun ini tetap terbaca dengan namanya.
        </p>
      </ConfirmDialog>
    </section>
  )
}
