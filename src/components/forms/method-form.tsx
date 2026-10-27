"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Checkbox } from "@/components/ui/shadcn/checkbox"
import { Button } from "@/components/ui/button"

type MethodRecord = { id: number; code: string; name: string; isActive: boolean }
type MethodAction = (formData: FormData) => Promise<{ success: boolean; error?: string } | void>
type MethodUpdateAction = (id: number, formData: FormData) => Promise<{ success: boolean; error?: string } | void>

interface MethodFormConfig {
  noun: string
  listHref: string
  activeId: string
  namePlaceholder: string
  createAction: MethodAction
  updateAction: MethodUpdateAction
}

export interface MethodFormProps {
  method?: MethodRecord
  generatedCode?: string
  enableAutoCode?: boolean
}

// ponytail: payment/shipping method forms were near-identical copies (Sonar
// new_duplicated_lines_density 10.9% on PR #93); one shared body, wrappers keep
// public names/props. Add per-kind fields here only when kinds diverge.
export function MethodForm({ config, method, generatedCode, enableAutoCode = true }: { config: MethodFormConfig } & MethodFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const isEdit = !!method
  const codeReadOnly = isEdit || enableAutoCode
  const codeDefault = method?.code ?? (enableAutoCode ? generatedCode : "") ?? ""

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      try {
        const result = isEdit
          ? await config.updateAction(method!.id, formData)
          : await config.createAction(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(isEdit ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push(config.listHref)
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} aria-label={isEdit ? `Formulir ubah ${config.noun}` : `Formulir tambah ${config.noun}`} className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code">Kode {codeReadOnly ? "" : <span className="text-destructive" aria-hidden="true">*</span>}</Label>
          <Input id="code" name="code" placeholder={enableAutoCode ? "Dibuat otomatis" : "Masukkan kode manual"} required={!codeReadOnly} readOnly={codeReadOnly} className={codeReadOnly ? "bg-muted" : undefined} defaultValue={codeDefault} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama <span className="text-destructive" aria-hidden="true">*</span></Label>
          <Input id="name" name="name" placeholder={config.namePlaceholder} required defaultValue={method?.name ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5 col-span-full">
          <div className="flex items-center gap-2">
            <Checkbox id={config.activeId} name="isActive" value="on" defaultChecked={method?.isActive !== false} />
            <Label htmlFor={config.activeId}>Aktif</Label>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()}>Batal</Button>
        <Button type="submit" isDisabled={isPending}>{isPending ? "Menyimpan..." : isEdit ? "Perbarui" : "Simpan"}</Button>
      </div>
    </form>
  )
}
