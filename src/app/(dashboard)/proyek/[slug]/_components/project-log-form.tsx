"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { addProjectLog } from "@/actions/project.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { FormSelect } from "@/components/ui/form-select"

// Satu-satunya UI yang memanggil addProjectLog. Sebelum ini tab "Log" di halaman
// proyek merender 10 log terakhir beserta keadaan kosongnya, tetapi tabel
// `project_logs` tidak punya penulis sama sekali — log proyek selalu kosong.

const ACTION_OPTIONS = [
  { value: "Progres", label: "Progres" },
  { value: "Kendala", label: "Kendala" },
  { value: "Keputusan", label: "Keputusan" },
  { value: "Kunjungan", label: "Kunjungan" },
  { value: "Catatan", label: "Catatan" },
]

export function ProjectLogForm({ projectId }: { projectId: number }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [action, setAction] = useState("Progres")

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    startTransition(async () => {
      const fd = new FormData(form)
      fd.set("action", action)
      const res = await addProjectLog(projectId, fd)
      if (!res.success) {
        showError(res.error || "Gagal menambahkan log")
        return
      }
      showSuccess("Log ditambahkan")
      form.reset()
      setAction("Progres")
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 p-4 px-5 border-b border-default"
      aria-label="Tambah log proyek"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-1.5 sm:w-48">
          <Label htmlFor="logAction">Jenis Aksi</Label>
          <FormSelect id="logAction" value={action} onValueChange={setAction} options={ACTION_OPTIONS} />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="logNotes">Catatan</Label>
          <Textarea id="logNotes" name="notes" rows={2} placeholder="Keterangan singkat (opsional)..." />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : "Tambah Log"}
        </Button>
      </div>
    </form>
  )
}
