"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import {
  createLeaveRequest,
  updateLeaveRequest,
  getEmployeeLeaveBalance,
} from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"
import { FormGrid, FormGroup } from "@/components/ui/form-layout"

interface LeaveFormProps {
  employees: { id: number; name: string
}[]
  leave?: { id: number; employeeId: number; leaveType: string; startDate: string; endDate: string; reason?: string | null }
}

const leaveTypes = [
  { id: "annual", name: "Cuti Tahunan" },
  { id: "sick", name: "Sakit" },
  { id: "personal", name: "Keperluan Pribadi" },
  { id: "maternity", name: "Cuti Melahirkan" },
  { id: "unpaid", name: "Tanpa Gaji" },
]

interface QuotaState {
  forEmployee: string
  eligible: boolean
  entitled: number
  used: number
  remaining: number
  failed: boolean
}

export function LeaveForm({ employees, leave }: LeaveFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [employeeId, setEmployeeId] = useState<string | null>(leave?.employeeId ? String(leave.employeeId) : null)
  const [leaveType, setLeaveType] = useState(leave?.leaveType ?? "annual")
  const [quota, setQuota] = useState<QuotaState | null>(null)

  // Live annual-leave balance preview. Only the `annual` type draws down the
  // 12-day quota, so we only fetch/show it for that type. The server enforces
  // the real gate on submit (inside a transaction) — this is purely
  // informational. setState happens ONLY in the async callback (never
  // synchronously in the effect body) and the result is keyed to the employee
  // it was fetched for, so a stale quota from a previous selection is never
  // shown while a new fetch is in flight.
  useEffect(() => {
    if (leaveType !== "annual" || !employeeId) return
    let cancelled = false
    const empId = employeeId
    getEmployeeLeaveBalance(Number(empId))
      .then((res) => {
        if (cancelled) return
        if (res.success) {
          setQuota({
            forEmployee: empId,
            eligible: res.quota.eligible,
            entitled: res.quota.entitled,
            used: res.quota.used,
            remaining: res.quota.remaining,
            failed: false,
          })
        } else {
          setQuota({ forEmployee: empId, eligible: false, entitled: 0, used: 0, remaining: 0, failed: true })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQuota({ forEmployee: empId, eligible: false, entitled: 0, used: 0, remaining: 0, failed: true })
        }
      })
    return () => {
      cancelled = true
    }
  }, [employeeId, leaveType])

  const showQuota = leaveType === "annual" && !!employeeId
  const quotaReady = !!quota && quota.forEmployee === employeeId && !quota.failed
  const quotaLoading = showQuota && (!quota || quota.forEmployee !== employeeId)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const result = leave?.id
          ? await updateLeaveRequest(leave.id, formData)
          : await createLeaveRequest(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(leave?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/sdm/cuti")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      aria-busy={isPending}
      aria-label={leave?.id ? "Formulir ubah permintaan cuti" : "Formulir ajukan permintaan cuti"}
      className="bg-surface rounded-xl border border-default shadow-sm p-6"
    >
        <FormGrid>
          <FormGroup>
            <Label htmlFor="employeeId">
              Karyawan <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Combobox
              id="employeeId"
              name="employeeId"
              required
              options={employees.map((emp) => ({ value: String(emp.id), label: emp.name }))}
              value={employeeId}
              onChange={setEmployeeId}
              placeholder="Cari karyawan..."
            />
          </FormGroup>
          <FormGroup>
            <Label htmlFor="type">
              Tipe Cuti <span className="text-destructive" aria-hidden="true">*</span>
            </Label>
            <FormSelect
              id="type"
              name="type"
              required
              value={leaveType}
              onValueChange={setLeaveType}
              options={leaveTypes.map((lt) => ({ value: lt.id, label: lt.name }))}
            />
          </FormGroup>
          {showQuota && (
            <FormGroup full>
              <div
                className={`flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border px-4 py-3 text-sm ${
                  quotaReady && !quota!.eligible
                    ? "border-warning/40 bg-warning/10 text-warning"
                    : "border-default bg-surface-secondary"
                }`}
                aria-live="polite"
              >
                {quotaLoading && <span className="text-muted-foreground">Memuat saldo cuti...</span>}
                {!quotaLoading && quota?.failed && (
                  <span className="text-muted-foreground">Saldo cuti tidak dapat dimuat.</span>
                )}
                {quotaReady && !quota!.eligible && (
                  <span>
                    Karyawan ini belum genap 1 tahun masa kerja — belum berhak cuti tahunan berbayar.
                  </span>
                )}
                {quotaReady && quota!.eligible && (
                  <>
                    <span>
                      Jatah: <strong className="text-foreground">{quota!.entitled}</strong> hari
                    </span>
                    <span>
                      Terpakai: <strong className="text-foreground">{quota!.used}</strong> hari
                    </span>
                    <span>
                      Sisa:{" "}
                      <strong className={quota!.remaining > 0 ? "text-success" : "text-destructive"}>
                        {quota!.remaining}
                      </strong>{" "}
                      hari
                    </span>
                  </>
                )}
              </div>
            </FormGroup>
          )}
          <FormGroup>
            <AppDatePicker
              label="Mulai"
              name="startDate"
              defaultValue={leave?.startDate ?? ""}
              onChange={() => {}}
              required
            />
          </FormGroup>
          <FormGroup>
            <AppDatePicker
              label="Selesai"
              name="endDate"
              defaultValue={leave?.endDate ?? ""}
              onChange={() => {}}
              required
            />
          </FormGroup>
          <FormGroup full>
            <Label htmlFor="reason">Alasan</Label>
            <Textarea id="reason" name="reason" className="w-full" rows={3} placeholder="Alasan cuti..." defaultValue={leave?.reason ?? ""} />
          </FormGroup>
        </FormGrid>
        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
          <Button type="button" onPress={() => router.back()} >Batal</Button>
          <Button type="submit" isDisabled={isPending} >{isPending ? "Menyimpan..." : leave?.id ? "Perbarui" : "Simpan"}</Button>
        </div>
      </form>
  )
}
