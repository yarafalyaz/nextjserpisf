"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { createOvertimeRequest, updateOvertimeRequest } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"

export function OvertimeForm({ employees, projects, overtime }: { employees: { id: number; name: string }[]; projects?: { id: number; name: string }[]; overtime?: { id: number; employeeId: number; projectId?: number | null; date: string; hours: number; totalHours?: number | null; mealHours?: number | null; billableHours?: number | null; reason?: string | null } }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(overtime?.date ? new Date(overtime.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0])
  const [employeeId, setEmployeeId] = useState<string | null>(overtime?.employeeId ? String(overtime.employeeId) : null)
  const [projectId, setProjectId] = useState<string | null>(overtime?.projectId ? String(overtime.projectId) : null)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        const result = overtime?.id ? await updateOvertimeRequest(overtime.id, formData) : await createOvertimeRequest(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(overtime?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/sdm/lembur")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit}>
      <FormCard>
        <FormSection title="Informasi Umum">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="employeeId">Karyawan *</Label>
            <Combobox
              id="employeeId"
              name="employeeId"
              options={employees.map((e) => ({ value: String(e.id), label: e.name }))}
              value={employeeId}
              onChange={setEmployeeId}
              placeholder="Cari karyawan..."
            />
          </div>
          {projects && projects.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="projectId">Proyek</Label>
              <Combobox
                id="projectId"
                name="projectId"
                options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
                value={projectId}
                onChange={setProjectId}
                placeholder="Cari proyek..."
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <AppDatePicker
              label="Tanggal"
              name="date"
              value={date}
              onChange={(val) => setDate(val)}
              required
            />
          </div>
        </FormSection>
        <FormSection title="Detail Jam">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hours">Jam Lembur *</Label>
            <Input id="hours" name="hours" type="number" min="0.5" step="0.5" placeholder="2" required defaultValue={overtime?.hours ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="totalHours">Total Jam</Label>
            <Input id="totalHours" name="totalHours" type="number" min="0" step="0.5" placeholder="0" defaultValue={overtime?.totalHours != null ? Number(overtime.totalHours) : ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mealHours">Jam Makan</Label>
            <Input id="mealHours" name="mealHours" type="number" min="0" step="0.5" placeholder="0" defaultValue={overtime?.mealHours != null ? Number(overtime.mealHours) : ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="billableHours">Jam Billable</Label>
            <Input id="billableHours" name="billableHours" type="number" min="0" step="0.5" placeholder="0" defaultValue={overtime?.billableHours != null ? Number(overtime.billableHours) : ""} />
          </div>
        </FormSection>
        <FormSection title="Lainnya" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Alasan</Label>
            <Textarea id="reason" name="reason" rows={3} placeholder="Alasan lembur..." defaultValue={overtime?.reason ?? ""} />
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : overtime?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
