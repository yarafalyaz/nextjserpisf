"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { createTask, updateTask } from "@/actions/project.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"
import { Combobox } from "@/components/ui/combobox"
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
  const [projectId, setProjectId] = useState<string | null>(task?.projectId ? String(task.projectId) : null)
  const [assignedTo, setAssignedTo] = useState<string | null>(task?.assignedTo ? String(task.assignedTo) : null)

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
        showSuccess(task?.id ? "Tugas berhasil diperbarui" : "Tugas berhasil ditambahkan")
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
          <Label htmlFor="task-project">Proyek *</Label>
          <Combobox
            id="task-project"
            name="projectId"
            value={projectId}
            onChange={setProjectId}
            placeholder="Cari proyek..."
            options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-name">Nama Tugas *</Label>
          <Input id="task-name" name="name" required placeholder="Nama tugas..." defaultValue={task?.name ?? ""} className="w-full" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-status">Status *</Label>
          <FormSelect
            id="task-status"
            name="status"
            defaultValue={task?.status ?? "pending"}
            options={statusOptions.map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-assigned">Ditugaskan Ke</Label>
          <Combobox
            id="task-assigned"
            name="assignedTo"
            value={assignedTo}
            onChange={setAssignedTo}
            placeholder="Cari karyawan..."
            options={employees.map((emp) => ({ value: String(emp.id), label: emp.name }))}
          />
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
          <Label htmlFor="task-description">Deskripsi</Label>
          <Textarea id="task-description" name="description" className="w-full" rows={3} placeholder="Deskripsi tugas..." defaultValue={task?.description ?? ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} >Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>{isPending ? "Menyimpan..." : task?.id ? "Perbarui" : "Simpan"}</Button>
      </div>
    </form>
  )
}
