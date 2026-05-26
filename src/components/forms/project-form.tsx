// @ts-nocheck
"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { createProject, updateProject } from "@/actions/project.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, ComboBox, ListBox, Label } from "@heroui/react"

interface ProjectFormProps {
  customers: { id: number; name: string }[]
  project?: { id: number; name: string; customerId: number; startDate: string | null; endDate: string | null; notes: string | null; status: string | null }
}

export function ProjectForm({ customers, project }: ProjectFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!project

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        if (isEdit) {
          await updateProject(project!.id, formData)
          showSuccess("Data berhasil diperbarui")
        } else {
          await createProject(formData)
          showSuccess("Data berhasil ditambahkan")
        }
        router.push("/projects")
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
          <Label htmlFor="name">Nama Proyek *</Label>
          <Input id="name" name="name" required placeholder="Nama proyek" defaultValue={project?.name || ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <ComboBox name="customerId" defaultSelectedKey={project?.customerId ? String(project.customerId) : undefined} className="w-full" isRequired>
            <Label>Customer *</Label>
            <ComboBox.InputGroup><Input placeholder="Cari customer..." /><ComboBox.Trigger /></ComboBox.InputGroup>
            <ComboBox.Popover>
              <ListBox>
                {customers.map((c) => (
                  <ListBox.Item key={c.id} id={String(c.id)} textValue={c.name}>{c.name}</ListBox.Item>
                ))}
              </ListBox>
            </ComboBox.Popover>
          </ComboBox>
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal Mulai"
            name="startDate"
            defaultValue={project?.startDate || undefined}
            onChange={() => {}}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal Selesai"
            name="endDate"
            defaultValue={project?.endDate || undefined}
            onChange={() => {}}
          />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <TextArea id="notes" name="notes" rows={3} placeholder="Catatan proyek..." defaultValue={project?.notes || ""} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <button type="button" onClick={() => router.back()} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-secondary text-foreground border border-default hover:bg-surface-tertiary transition-all">Batal</button>
        <button type="submit" disabled={isPending} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover hover:-translate-y-px hover:shadow-md transition-all">{isPending ? "Menyimpan..." : isEdit ? "Update" : "Simpan Proyek"}</button>
      </div>
    </form>
  )
}
