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
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { FormGrid, FormGroup } from "@/components/ui/form-layout"
import { Button } from "@/components/ui/button"
import { toLocalDateOnly } from "@/lib/utils/date-only"

export function OvertimeForm({ employees, projects, overtime }: { employees: { id: number; name: string }[]; projects?: { id: number; name: string }[]; overtime?: { id: number; employeeId: number; projectId?: number | null; date: string; hours: number; totalHours?: number | null; mealHours?: number | null; billableHours?: number | null; reason?: string | null } }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(overtime?.date ? new Date(overtime.date).toISOString().split("T")[0] : toLocalDateOnly(new Date()))
  const [employeeId, setEmployeeId] = useState<string | null>(
    overtime?.employeeId ? String(overtime.employeeId) : employees.length === 1 ? String(employees[0].id) : null
  )
  const [projectId, setProjectId] = useState<string | null>(overtime?.projectId ? String(overtime.projectId) : null)
  const [employeeOptions, setEmployeeOptions] = useState(employees)

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
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
    <form
      onSubmit={onSubmit}
      aria-busy={isPending}
      aria-label={overtime?.id ? "Formulir ubah permintaan lembur" : "Formulir ajukan permintaan lembur"}
    >
      <FormCard>
        <FormSection title="Informasi Umum">
          <FormGrid>
            {employees.length === 1 ? (
              <FormGroup>
                <Label htmlFor="employeeId">
                  Karyawan <span className="text-destructive" aria-hidden="true">*</span>
                </Label>
                <div className="px-3 py-2.5 rounded-lg border border-default bg-default/10 text-foreground font-medium text-sm">
                  {employees[0].name}
                </div>
                <input type="hidden" name="employeeId" value={employees[0].id} />
              </FormGroup>
            ) : (
              <FormGroup>
                <Label htmlFor="employeeId">
                  Karyawan <span className="text-destructive" aria-hidden="true">*</span>
                </Label>
                <QuickAddSelect
                  id="employeeId"
                  name="employeeId"
                  required
                  options={employeeOptions.map((e) => ({ value: String(e.id), label: e.name }))}
                  value={employeeId}
                  onChange={setEmployeeId}
                  placeholder="Cari karyawan..."
                  title={QUICK_ADD.employee.title}
                  fields={QUICK_ADD.employee.fields}
                  action={QUICK_ADD.employee.action}
                  onCreated={(created) => {
                    setEmployeeOptions((prev) => [...prev, { id: created.id, name: created.label }])
                    setEmployeeId(String(created.id))
                  }}
                />
              </FormGroup>
            )}
            {projects && projects.length > 0 && (
              <FormGroup>
                <Label htmlFor="projectId">Proyek</Label>
                <Combobox
                  id="projectId"
                  name="projectId"
                  options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
                  value={projectId}
                  onChange={setProjectId}
                  placeholder="Cari proyek..."
                />
              </FormGroup>
            )}
            <FormGroup>
              <AppDatePicker
                label="Tanggal"
                name="date"
                value={date}
                onChange={(val) => setDate(val)}
                required
              />
            </FormGroup>
          </FormGrid>
        </FormSection>
        <FormSection title="Detail Jam">
          <FormGrid>
            <FormGroup>
              <Label htmlFor="hours">
                Jam Lembur <span className="text-destructive" aria-hidden="true">*</span>
              </Label>
              <Input id="hours" name="hours" type="number" min="0.5" step="0.5" placeholder="2" required defaultValue={overtime?.hours ?? ""} />
            </FormGroup>
            <FormGroup>
              <Label htmlFor="totalHours">Total Jam</Label>
              <Input id="totalHours" name="totalHours" type="number" min="0" step="0.5" placeholder="0" defaultValue={overtime?.totalHours != null ? Number(overtime.totalHours) : ""} />
            </FormGroup>
            <FormGroup>
              <Label htmlFor="mealHours">Jam Makan</Label>
              <Input id="mealHours" name="mealHours" type="number" min="0" step="0.5" placeholder="0" defaultValue={overtime?.mealHours != null ? Number(overtime.mealHours) : ""} />
            </FormGroup>
            <FormGroup>
              <Label htmlFor="billableHours">Jam Dapat Ditagih</Label>
              <Input id="billableHours" name="billableHours" type="number" min="0" step="0.5" placeholder="0" defaultValue={overtime?.billableHours != null ? Number(overtime.billableHours) : ""} />
            </FormGroup>
          </FormGrid>
        </FormSection>
        <FormSection title="Lainnya" columns={1}>
          <FormGroup>
            <Label htmlFor="reason">Alasan</Label>
            <Textarea id="reason" name="reason" className="w-full" rows={3} placeholder="Alasan lembur..." defaultValue={overtime?.reason ?? ""} />
          </FormGroup>
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
