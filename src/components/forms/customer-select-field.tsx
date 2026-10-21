"use client"

import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form"
import { Label } from "@/components/ui/shadcn/label"
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"

interface CustomerSelectFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> {
  control: Control<TFieldValues>
  name: TName
  options: { id: number; name: string }[]
  onCustomerCreated: (created: { id: number; name: string }) => void
  error?: string
  label?: string
  /** Pelanggan wajib dipilih (schema min(1)) — teruskan required ke QuickAdd. */
  required?: boolean
}

export function CustomerSelectField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  name,
  options,
  onCustomerCreated,
  error,
  label = "Pelanggan *",
  required,
}: CustomerSelectFieldProps<TFieldValues, TName>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="customerId">{label}</Label>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <QuickAddSelect
            id="customerId"
            value={field.value ? String(field.value) : null}
            onChange={(key) => field.onChange(key ? Number(key) : undefined)}
            placeholder="Cari pelanggan..."
            options={options.map((c) => ({ value: String(c.id), label: c.name }))}
            title={QUICK_ADD.customer.title}
            fields={QUICK_ADD.customer.fields}
            action={QUICK_ADD.customer.action}
            onCreated={(created) => {
              onCustomerCreated({ id: created.id, name: created.label })
              field.onChange(created.id)
            }}
            required={required}
          />
        )}
      />
      {error && <span className="text-xs text-danger mt-1">{error}</span>}
    </div>
  )
}
