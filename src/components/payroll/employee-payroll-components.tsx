"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import {
  assignEmployeePayrollComponent,
  updateEmployeePayrollComponent,
} from "@/actions/hrm.actions"
import { showError, showSuccess } from "@/lib/utils/toast"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { AppDatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/shadcn/label"
import { kindLabel } from "./payroll-component-master"

export interface EmployeePayrollComponentRow {
  id: number
  employeeId: number
  componentId: number
  defaultAmount: number
  effectiveFrom: string
  effectiveTo: string | null
  isActive: boolean
  component: {
    name: string
    kind: string
    recurrence: string
    isTaxable: boolean
    isActive: boolean
  }
}

export interface FixedComponentOption {
  id: number
  name: string
  kind: string
}

export function EmployeePayrollComponents({
  employeeId,
  assignments,
  components,
}: {
  employeeId: number
  assignments: EmployeePayrollComponentRow[]
  components: FixedComponentOption[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function run(fn: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    startTransition(async () => {
      try {
        const result = await fn()
        if (!result.success) {
          showError(result.error || "Gagal menyimpan penugasan komponen gaji")
          return
        }
        showSuccess(ok)
        router.refresh()
      } catch {
        showError("Gagal menyimpan penugasan komponen gaji")
      }
    })
  }

  function onAssign(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    run(
      () => assignEmployeePayrollComponent(new FormData(e.currentTarget)),
      "Penugasan komponen gaji ditambahkan",
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Belum ada penugasan komponen gaji tetap untuk karyawan ini.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-default text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">Komponen</th>
                <th className="px-3 py-2 font-medium">Jenis</th>
                <th className="px-3 py-2 font-medium">Nominal Default</th>
                <th className="px-3 py-2 font-medium">Berlaku</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-b border-default last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{a.component.name}</td>
                  <td className="px-3 py-2">{kindLabel(a.component.kind)}</td>
                  <td className="px-3 py-2">{formatCurrency(a.defaultAmount)}</td>
                  <td className="px-3 py-2">
                    {formatDate(a.effectiveFrom)} — {a.effectiveTo ? formatDate(a.effectiveTo) : "seterusnya"}
                  </td>
                  <td className="px-3 py-2">{a.isActive ? "Aktif" : "Nonaktif"}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-end gap-2">
                      <form
                        aria-label={`Ubah nominal ${a.component.name}`}
                        onSubmit={(e) => {
                          e.preventDefault()
                          run(
                            () => updateEmployeePayrollComponent(a.id, new FormData(e.currentTarget)),
                            "Penugasan komponen gaji diubah",
                          )
                        }}
                        className="flex items-end gap-2"
                      >
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`assign-amount-${a.id}`}>Nominal baru</Label>
                          <CurrencyInput
                            id={`assign-amount-${a.id}`}
                            name="defaultAmount"
                            defaultValue={a.defaultAmount}
                            prefix="Rp"
                          />
                        </div>
                        <Button type="submit" variant="secondary" isDisabled={isPending}>
                          Simpan
                        </Button>
                      </form>
                      <Button
                        type="button"
                        variant="secondary"
                        isDisabled={isPending}
                        aria-label={`${a.isActive ? "Nonaktifkan" : "Aktifkan"} penugasan ${a.component.name}`}
                        onPress={() => {
                          const fd = new FormData()
                          fd.set("isActive", a.isActive ? "false" : "true")
                          run(
                            () => updateEmployeePayrollComponent(a.id, fd),
                            a.isActive ? "Penugasan dinonaktifkan" : "Penugasan diaktifkan",
                          )
                        }}
                      >
                        {a.isActive ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        onSubmit={onAssign}
        aria-busy={isPending}
        aria-label="Formulir tambah penugasan komponen gaji"
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
      >
        <input type="hidden" name="employeeId" value={employeeId} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assign-component">
            Komponen Tetap <span aria-hidden="true" className="text-destructive">*</span>
          </Label>
          <select
            id="assign-component"
            name="componentId"
            required
            className="min-h-11 rounded-lg border border-default bg-surface px-3 text-sm"
          >
            <option value="">Pilih komponen...</option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({kindLabel(c.kind)})
              </option>
            ))}
          </select>
          {components.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Tidak ada komponen tetap aktif. Buat dulu di Komponen Gaji.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="assign-default-amount">
            Nominal Default <span aria-hidden="true" className="text-destructive">*</span>
          </Label>
          <CurrencyInput id="assign-default-amount" name="defaultAmount" required prefix="Rp" placeholder="0" />
        </div>
        <AppDatePicker label="Berlaku Mulai *" name="effectiveFrom" required />
        <AppDatePicker label="Berlaku Sampai" name="effectiveTo" />
        <div className="md:col-span-2 flex justify-end">
          <Button type="submit" variant="primary" isDisabled={isPending || components.length === 0}>
            {isPending ? "Menyimpan..." : "Tambah Penugasan"}
          </Button>
        </div>
      </form>
    </div>
  )
}
