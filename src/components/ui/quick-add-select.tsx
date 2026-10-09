"use client"

import { useState, useTransition } from "react"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog"
import { showSuccess, showError } from "@/lib/utils/toast"

/** A single form control rendered inside the quick-add dialog. */
export interface QuickAddField {
  name: string
  label: string
  /** Input type. `select` renders a dropdown from `options`. */
  type?: "text" | "number" | "email" | "textarea" | "select" | "date" | "hidden"
  required?: boolean
  placeholder?: string
  /** For `select`: the allowed choices. */
  options?: { value: string; label: string }[]
  defaultValue?: string | number
  step?: string
  min?: string
  max?: string
  /** Helper text shown under the field. */
  hint?: string
}

/** Server action shape the quick-add relies on: returns the new row's id. */
export type QuickAddAction = (
  formData: FormData,
) => Promise<{ success: boolean; id?: number; error?: string } | void>

export interface QuickAddSelectProps {
  /** Existing options; the caller owns the list so it can append on create. */
  options: ComboboxOption[]
  value?: string | null
  onChange?: (value: string | null) => void
  placeholder?: string
  emptyText?: string
  disabled?: boolean
  id?: string
  name?: string
  required?: boolean
  "aria-label"?: string
  /** Dialog title, e.g. "Tambah Kategori Barang". */
  title: string
  description?: string
  /** Fields rendered in the dialog, in order. */
  fields: QuickAddField[]
  /** Server action invoked with the assembled FormData. */
  action: QuickAddAction
  /**
   * Derives a Combobox label for the created row. The dialog calls this with
   * the submitted FormData; default falls back to the field named `name`.
   */
  getLabel?: (formData: FormData) => string
  /** Called after a successful create so the owner can append + select it. */
  onCreated: (result: { id: number; label: string }) => void
}

/**
 * A select box that can create its missing option without leaving the form.
 *
 * Combines {@link Combobox} with a small dialog that renders a declarative list
 * of {@link QuickAddField}s. On save it calls the supplied server action, then
 * hands `{ id, label }` back to the caller, which appends it to the option list
 * and selects it. Keeping the fields declarative means every entity (category,
 * warehouse, account, ...) reuses one dialog instead of copying its create form.
 */
export function QuickAddSelect({
  options,
  value,
  onChange,
  placeholder = "Cari...",
  emptyText,
  disabled,
  id,
  name,
  required,
  "aria-label": ariaLabel,
  title,
  description,
  fields,
  action,
  getLabel,
  onCreated,
}: QuickAddSelectProps) {
  const [openDialog, setOpenDialog] = useState(false)
  const [search, setSearch] = useState("")
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    // Signals redirect-based create actions (e.g. createTax, createBrand) to
    // return their new id instead of navigating away from the current form.
    formData.set("__quickAdd", "1")
    startTransition(async () => {
      try {
        const result = await action(formData)
        if (!result || !result.success || result.id == null) {
          showError(result?.error || `Gagal menambah ${title.toLowerCase()}`)
          return
        }
        const label =
          getLabel?.(formData) ??
          String(formData.get("name") ?? "").trim()
        onCreated({ id: result.id, label })
        showSuccess(`${title} berhasil ditambahkan`)
        setOpenDialog(false)
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <>
      <Combobox
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        emptyText={emptyText}
        disabled={disabled}
        id={id}
        name={name}
        required={required}
        aria-label={ariaLabel}
        onCreateNew={(term) => {
          setSearch(term)
          setOpenDialog(true)
        }}
      />

      <Dialog
        open={openDialog}
        onOpenChange={(next) => {
          // Block dismissal mid-save so a half-submitted form cannot be
          // reopened with stale state.
          if (isPending) return
          setOpenDialog(next)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {fields.map((field) => (
              <QuickAddFieldControl
                key={field.name}
                field={field}
                prefill={
                  field.name === "name" && search && !field.defaultValue
                    ? search
                    : undefined
                }
              />
            ))}
            <DialogFooter>
              <Button
                type="button"
                onPress={() => setOpenDialog(false)}
                isDisabled={isPending}
              >
                Batal
              </Button>
              <Button type="submit" variant="primary" isDisabled={isPending} id="quick-add-submit">
                {isPending ? "Menyimpan..." : "Simpan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function QuickAddFieldControl({
  field,
  prefill,
}: {
  field: QuickAddField
  prefill?: string
}) {
  if (field.type === "hidden") {
    return <input type="hidden" name={field.name} defaultValue={field.defaultValue} />
  }

  const inputId = `quick-add-${field.name}`

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>
        {field.label}
        {field.required && " *"}
      </Label>
      {field.type === "textarea" ? (
        <Textarea
          id={inputId}
          name={field.name}
          rows={3}
          required={field.required}
          placeholder={field.placeholder}
          defaultValue={(field.defaultValue as string) ?? ""}
        />
      ) : field.type === "select" ? (
        <Select name={field.name} defaultValue={String(field.defaultValue ?? "")}>
          <SelectTrigger id={inputId} className="w-full">
            <SelectValue placeholder={field.placeholder ?? "-- Pilih --"} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={inputId}
          name={field.name}
          type={field.type ?? "text"}
          required={field.required}
          placeholder={field.placeholder}
          step={field.step}
          min={field.min}
          max={field.max}
          defaultValue={prefill ?? ((field.defaultValue as string) ?? "")}
          autoFocus={field.name === "name"}
        />
      )}
      {field.hint && (
        <span className="text-xs text-muted-foreground">{field.hint}</span>
      )}
    </div>
  )
}
