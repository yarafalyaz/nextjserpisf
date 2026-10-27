"use client"

import type { SubmitEventHandler, ReactNode } from "react"
import { useRouter } from "next/navigation"
import type { Control, FieldPath, FieldValues } from "react-hook-form"
import { CustomerSelectField } from "@/components/forms/customer-select-field"
import { Button } from "@/components/ui/button"

interface SalesCustomerFormShellProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> {
  onSubmit: SubmitEventHandler<HTMLFormElement>
  control: Control<TFieldValues>
  name: TName
  options: { id: number; name: string }[]
  onCustomerCreated: (created: { id: number; name: string }) => void
  error?: string
  submitId: string
  isPending: boolean
  isEditing: boolean
  /** Label formulir untuk screen reader (mis. "Formulir tambah faktur"). */
  formLabel: string
  afterGrid?: ReactNode
  creditGatePanel?: ReactNode
  children: ReactNode
}

export function SalesCustomerFormShell<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  onSubmit,
  control,
  name,
  options,
  onCustomerCreated,
  error,
  submitId,
  isPending,
  isEditing,
  formLabel,
  afterGrid,
  creditGatePanel,
  children,
}: SalesCustomerFormShellProps<TFieldValues, TName>) {
  const router = useRouter()
  return (
    <form onSubmit={onSubmit} aria-label={formLabel} aria-busy={isPending} className="bg-surface rounded-xl border border-default shadow-sm p-4 sm:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <CustomerSelectField
          control={control}
          name={name}
          options={options}
          onCustomerCreated={onCustomerCreated}
          error={error}
          required
        />
        {children}
      </div>
      {afterGrid}
      {creditGatePanel}
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end flex-wrap gap-2 sm:gap-3 mt-6 pt-5 border-t border-default">
        <Button type="button" onPress={() => router.back()} className="w-full sm:w-auto">Batal</Button>
        <Button type="submit" isDisabled={isPending} id={submitId} className="w-full sm:w-auto">
          {isPending ? "Menyimpan..." : isEditing ? "Perbarui" : "Simpan"}
        </Button>
      </div>
    </form>
  )
}
