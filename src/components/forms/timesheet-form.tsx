"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { createTimesheet, updateTimesheet } from "@/actions/hrm.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label } from "@heroui/react"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/page-header"

interface TimesheetFormProps {
  employees: { id: number; name: string }[]
  projects: { id: number; name: string }[]
  tasks?: { id: number; title: string; projectId: number }[]
  timesheet?: { id: number; employeeId: number; projectId: number; taskId?: number | null; date: string; startTime?: string | null; endTime?: string | null; hours: number; description?: string | null }
}

export function TimesheetForm({ employees, projects, tasks = [], timesheet }: TimesheetFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        if (timesheet?.id) {

          await updateTimesheet(timesheet.id, formData)

        } else {

          await createTimesheet(formData)

        }
        showSuccess(timesheet?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/sdm/lembar-waktu")
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
            <ComboBox name="employeeId" defaultSelectedKey={timesheet ? String(timesheet.employeeId) : undefined} className="w-full" isRequired>
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
          <div className="flex flex-col gap-1.5">
            <ComboBox name="projectId" defaultSelectedKey={timesheet?.projectId ? String(timesheet.projectId) : undefined} className="w-full" isRequired>
              <Label>Proyek *</Label>
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
          {tasks.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <ComboBox name="taskId" defaultSelectedKey={timesheet?.taskId ? String(timesheet.taskId) : undefined} className="w-full">
                <Label>Task</Label>
                <ComboBox.InputGroup>
                  <Input placeholder="Cari task..." />
                  <ComboBox.Trigger />
                </ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox>
                    {tasks.map((t) => (
                      <ListBox.Item key={t.id} id={String(t.id)} textValue={t.title}>
                        {t.title}
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
              label="Tanggal *"
              name="date"
              onChange={() => {}}
              required
            />
          </div>
        </FormSection>
        <FormSection title="Detail Jam">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startTime">Jam Mulai</Label>
            <Input id="startTime" name="startTime" type="time" defaultValue={timesheet?.startTime ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endTime">Jam Selesai</Label>
            <Input id="endTime" name="endTime" type="time" defaultValue={timesheet?.endTime ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hours">Total Jam *</Label>
            <Input id="hours" name="hours" type="number" step="0.25" min="0.25" max="24" required placeholder="8" defaultValue={timesheet?.hours ?? ""} />
          </div>
        </FormSection>
        <FormSection title="Lainnya" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Deskripsi Pekerjaan</Label>
            <TextArea id="description" name="description" rows={3} placeholder="Deskripsi pekerjaan yang dilakukan..." defaultValue={timesheet?.description ?? ""} />
          </div>
        </FormSection>
        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending}>
            {isPending ? "Menyimpan..." : timesheet?.id ? "Update" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
