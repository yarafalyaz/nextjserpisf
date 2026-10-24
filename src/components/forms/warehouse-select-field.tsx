"use client"

import { Label } from "@/components/ui/shadcn/label"
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"

/** Field pilih gudang + tambah-cepat, dipakai form transfer & permintaan antar gudang. */
export function WarehouseSelectField({ id, label, placeholder, value, options, onCreatedWarehouse, onChange }: {
  id: string
  label: string
  placeholder: string
  value: string
  options: { id: number; name: string }[]
  onCreatedWarehouse: (w: { id: number; name: string }) => void
  onChange: (key: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label} <span className="text-destructive" aria-hidden="true">*</span></Label>
      <QuickAddSelect
        required
        id={id}
        options={options.map((w) => ({ value: String(w.id), label: w.name }))}
        value={value || null}
        onChange={(key) => onChange(key ? String(key) : "")}
        placeholder={placeholder}
        title={QUICK_ADD.warehouse.title}
        fields={QUICK_ADD.warehouse.fields}
        action={QUICK_ADD.warehouse.action}
        onCreated={(created) => { onCreatedWarehouse({ id: created.id, name: created.label }); onChange(String(created.id)) }}
      />
    </div>
  )
}
