"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Switch } from "@/components/ui/shadcn/switch"
import { Button } from "@/components/ui/button"
import { FormSelect } from "@/components/ui/form-select"
import { Combobox } from "@/components/ui/combobox"
import {
  createApprovalWorkflow,
  updateApprovalWorkflow,
} from "@/actions/approval.actions"
import { APPROVAL_MODEL_TYPES } from "@/lib/constants/approval"

export interface WorkflowFormStep {
  name?: string | null
  roleId?: number | null
  approverType?: string | null
}

export interface WorkflowFormData {
  id: number
  name: string
  code?: string | null
  modelType: string
  isActive: boolean
  steps: WorkflowFormStep[]
}

interface RoleOption {
  id: number
  name: string
}

interface StepState {
  key: string
  name: string
  roleId: string
  approverType: string
}

let stepCounter = 0
function newStep(partial?: Partial<StepState>): StepState {
  stepCounter += 1
  return {
    key: `step-${Date.now()}-${stepCounter}`,
    name: partial?.name ?? "",
    roleId: partial?.roleId ?? "",
    approverType: partial?.approverType ?? "",
  }
}

export function WorkflowForm({
  workflow,
  roles,
}: {
  workflow?: WorkflowFormData
  roles: RoleOption[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [name, setName] = useState(workflow?.name ?? "")
  const [modelType, setModelType] = useState(workflow?.modelType ?? "")
  const [code, setCode] = useState(workflow?.code ?? "")
  const [isActive, setIsActive] = useState(workflow?.isActive ?? true)
  const [steps, setSteps] = useState<StepState[]>(
    workflow?.steps?.length
      ? workflow.steps.map((s) =>
          newStep({
            name: s.name ?? "",
            roleId: s.roleId ? String(s.roleId) : "",
            approverType: s.approverType ?? "",
          })
        )
      : [newStep()]
  )

  const roleOptions = roles.map((r) => ({ value: String(r.id), label: r.name }))
  const modelTypeOptions = APPROVAL_MODEL_TYPES.map((t) => ({ value: t, label: t }))

  function updateStep(key: string, patch: Partial<StepState>) {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)))
  }

  function addStep() {
    setSteps((prev) => [...prev, newStep()])
  }

  function removeStep(key: string) {
    setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.key !== key)))
  }

  function moveStep(index: number, direction: -1 | 1) {
    setSteps((prev) => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!name.trim() || !modelType.trim()) {
      showError("Nama dan tipe dokumen wajib diisi")
      return
    }

    const stepsPayload = steps
      .map((s) => ({
        name: s.name.trim() || undefined,
        roleId: s.roleId ? Number(s.roleId) : null,
        approverType: s.approverType.trim() || null,
      }))
      .filter((s) => s.roleId || s.approverType || s.name)

    const formData = new FormData()
    formData.set("name", name.trim())
    formData.set("modelType", modelType.trim())
    formData.set("code", code.trim())
    formData.set("isActive", isActive ? "true" : "false")
    formData.set("steps", JSON.stringify(stepsPayload))

    startTransition(async () => {
      try {
        const result = workflow?.id
          ? await updateApprovalWorkflow(workflow.id, formData)
          : await createApprovalWorkflow(formData)

        if (!result?.success) {
          showError(result?.error || "Gagal menyimpan alur persetujuan")
          return
        }

        showSuccess(workflow?.id ? "Alur persetujuan berhasil diperbarui" : "Alur persetujuan berhasil ditambahkan")
        router.push("/pengaturan/workflow")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan alur persetujuan")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {/* Informasi Workflow */}
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <h2 className="text-[0.9375rem] font-semibold text-foreground mb-4">Informasi Alur</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Persetujuan Pesanan Pembelian"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="modelType">Tipe Dokumen *</Label>
            <FormSelect
              id="modelType"
              value={modelType || null}
              onValueChange={setModelType}
              options={modelTypeOptions}
              placeholder="-- Pilih tipe dokumen --"
              aria-label="Tipe Dokumen"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="code">Kode</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Opsional"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="isActive">Status</Label>
            <div className="flex items-center gap-2 h-9">
              <Switch id="isActive" checked={isActive} onCheckedChange={setIsActive} />
              <span className="text-sm text-muted-foreground">{isActive ? "Aktif" : "Nonaktif"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Langkah Persetujuan */}
      <div className="bg-surface rounded-xl border border-default shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[0.9375rem] font-semibold text-foreground">Langkah Persetujuan</h2>
            <p className="text-xs text-muted-foreground mt-1">Urutan langkah dari atas ke bawah menentukan urutan persetujuan.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onPress={addStep}>
            <Plus className="size-4" /> Tambah Langkah
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          {steps.map((step, index) => (
            <div
              key={step.key}
              className="rounded-lg border border-default bg-surface-secondary/40 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <GripVertical className="size-4 text-muted-foreground" />
                  Langkah {index + 1}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    isIconOnly
                    aria-label="Naikkan langkah"
                    isDisabled={index === 0}
                    onPress={() => moveStep(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    isIconOnly
                    aria-label="Turunkan langkah"
                    isDisabled={index === steps.length - 1}
                    onPress={() => moveStep(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="danger-soft"
                    size="sm"
                    isIconOnly
                    aria-label="Hapus langkah"
                    isDisabled={steps.length <= 1}
                    onPress={() => removeStep(step.key)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${step.key}-name`}>Nama Langkah</Label>
                  <Input
                    id={`${step.key}-name`}
                    value={step.name}
                    onChange={(e) => updateStep(step.key, { name: e.target.value })}
                    placeholder={`Langkah ${index + 1}`}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${step.key}-role`}>Peran (Role)</Label>
                  <Combobox
                    id={`${step.key}-role`}
                    options={roleOptions}
                    value={step.roleId || null}
                    onChange={(v) => updateStep(step.key, { roleId: v ?? "" })}
                    placeholder="Cari peran..."
                    emptyText="Tidak ada peran"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${step.key}-approver-type`}>Tipe Approver</Label>
                  <Input
                    id={`${step.key}-approver-type`}
                    value={step.approverType}
                    onChange={(e) => updateStep(step.key, { approverType: e.target.value })}
                    placeholder="Opsional, mis. manager"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onPress={() => router.push("/pengaturan/workflow")}>
          Batal
        </Button>
        <Button type="submit" variant="primary" isPending={isPending} isDisabled={isPending}>
          {isPending ? "Menyimpan..." : workflow?.id ? "Perbarui" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
