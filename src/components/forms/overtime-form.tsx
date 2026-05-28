"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { createOvertimeRequest, updateOvertimeRequest } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label } from "@heroui/react"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/page-header"

export function OvertimeForm({ employees, projects, overtime }: { employees: { id: number; name: string }[]; projects?: { id: number; name: string }[]; overtime?: { id: number; employeeId: number; projectId?: number | null; date: string; hours: number; totalHours?: number | null; mealHours?: number | null; billableHours?: number | null; reason?: string | null } }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [date, setDate] = useState(overtime?.date ? new Date(overtime.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0])

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        overtime?.id ? await updateOvertimeRequest(overtime.id, formData) : await createOvertimeRequest(formData)
        showSuccess(overtime?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/hrm/overtime")
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
            <ComboBox name="employeeId" className="w-full" isRequired defaultSelectedKey={overtime?.employeeId ? String(overtime.employeeId) : undefined}>
              <Label>Karyawan *</Label>
              <ComboBox.InputGroup>
                <Input placeholder="Cari karyawan..." />
                <ComboBox.Trigger />
              </ComboBox.InputGroup>
              <ComboBox.Popover>
                <ListBox>
                  {employees.map((e) => (
                    <ListBox.Item key={e.id} id={String(e.id)} textValue={e.name}>
                      {e.name}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </ComboBox.Popover>
            </ComboBox>
          </div>
          {projects && projects.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <ComboBox name="projectId" className="w-full" defaultSelectedKey={overtime?.projectId ? String(overtime.projectId) : undefined}>
                <Label>Proyek</Label>
                <ComboBox.InputGroup>
                  <Input placeholder="Cari proyek..." />
                  <ComboBox.Trigger />
                </ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox>
                    {projects.map((p) => (
                      <ListBox.Item key={p.id} id={String(p.id)} textValue={p.name}>
                        {p.name}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
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
            <TextArea id="reason" name="reason" rows={3} placeholder="Alasan lembur..." defaultValue={overtime?.reason ?? ""} />
          </div>
        </FormSection>
        <FormActions>
          <Button onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : overtime?.id ? "Update" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
