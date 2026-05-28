"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { createTask, updateTask } from "@/actions/project.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { TextArea, Label, Select, ComboBox, Input, ListBox } from "@heroui/react"
import { Button } from "@/components/ui/page-header"

interface TaskFormProps {
  projects: { id: number; name: string }[]
  employees: { id: number; name: string }[]
  task?: {
    id: number
    projectId: number
    name: string
    description?: string | null
    status: string
    assignedTo?: number | null
    startDate?: string | null
    dueDate?: string | null
  }
}

const statusOptions = [
  { id: "pending", name: "Menunggu" },
  { id: "in_progress", name: "Dalam Proses" },
  { id: "completed", name: "Selesai" },
  { id: "cancelled", name: "Dibatalkan" },
]

export function TaskForm({ projects, employees, task }: TaskFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        if (task?.id) {
          formData.set("id", String(task.id))
          await updateTask(formData)
        } else {
          await createTask(formData)
        }
        showSuccess(task?.id ? "Tugas berhasil diupdate" : "Tugas berhasil ditambahkan")
        router.push("/proyek/tugas")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <ComboBox name="projectId" isRequired defaultSelectedKey={task?.projectId ? String(task.projectId) : undefined} className="w-full">
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
        <div className="flex flex-col gap-1.5">
          <Label>Nama Tugas *</Label>
          <Input name="name" required placeholder="Nama tugas..." defaultValue={task?.name ?? ""} className="w-full" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Select name="status" isRequired defaultSelectedKey={task?.status ?? "pending"} className="w-full">
            <Label>Status *</Label>
            <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                {statusOptions.map((s) => (
                  <ListBox.Item key={s.id} id={s.id} textValue={s.name}>
                    {s.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <ComboBox name="assignedTo" defaultSelectedKey={task?.assignedTo ? String(task.assignedTo) : undefined} className="w-full">
            <Label>Ditugaskan Ke</Label>
            <ComboBox.InputGroup>
              <Input placeholder="Cari karyawan..." />
              <ComboBox.Trigger />
            </ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {employees.map((emp) => (
                  <ListBox.Item key={emp.id} id={String(emp.id)} textValue={emp.name}>
                    {emp.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal Mulai"
            name="startDate"
            defaultValue={task?.startDate ?? undefined}
            onChange={() => {}}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tenggat"
            name="dueDate"
            defaultValue={task?.dueDate ?? undefined}
            onChange={() => {}}
          />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label>Deskripsi</Label>
          <TextArea name="description" className="w-full" rows={3} placeholder="Deskripsi tugas..." defaultValue={task?.description ?? ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button onPress={() => router.back()} >Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>{isPending ? "Menyimpan..." : task?.id ? "Update" : "Simpan"}</Button>
      </div>
    </form>
  )
}
