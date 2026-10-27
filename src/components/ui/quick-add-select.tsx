"use client"

import { useEffect, useState, useTransition } from "react"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { AddressPicker } from "@/components/ui/address-picker"
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
  /**
   * Input type. `select` renders a dropdown from `options`/`optionsFrom`;
   * `region` renders the cascading province → village picker (nama field:
   * province/city/district/village/postalCode).
   */
  type?: "text" | "number" | "email" | "textarea" | "select" | "date" | "hidden" | "region" | "combobox"
  required?: boolean
  placeholder?: string
  /**
   * Di dialog lebar: `full` membuat field memakai satu baris penuh (mis. alamat &
   * pemilih wilayah). Default: setengah baris, berdampingan dengan field berikutnya.
   */
  span?: "full"
  /** For `select`: the allowed choices. */
  options?: { value: string; label: string }[]
  /**
   * For `select`: pilihan yang dibaca dari database saat dialog dibuka. Loader-nya
   * disediakan pemanggil (registry memegang action-nya), sehingga komponen generik ini
   * tidak perlu tahu entitas apa pun — dan tidak menarik server action ke dalamnya.
   */
  loadOptions?: () => Promise<{ value: string; label: string }[]>
  defaultValue?: string | number
  step?: string
  min?: string
  max?: string
  /** Helper text shown under the field. */
  hint?: string
  /**
   * Ditampilkan menggantikan `hint` ketika pilihan dari database kosong — supaya
   * jalan buntu (tidak ada yang bisa dipilih) dijelaskan, bukan dibiarkan hening.
   */
  emptyHint?: string
}

/** Server action shape the quick-add relies on: returns the new row's id. */
export type QuickAddAction = (
  formData: FormData,
) => Promise<{
  success: boolean
  id?: number
  error?: string
  // BR-CD-05 (F-2026-10-25-003-S): action boleh menyatakan data existing
  // dipakai kembali; pesan server ditampilkan verbatim, bukan generik.
  reused?: boolean
  message?: string
} | void>

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
  "aria-describedby"?: string
  /** Dialog title, e.g. "Tambah Kategori Barang". */
  title: string
  description?: string
  /** Fields rendered in the dialog, in order. */
  fields: QuickAddField[]
  /**
   * Nilai tambahan yang ikut dikirim saat menyimpan — dipakai untuk konteks yang hanya
   * diketahui form pemanggil, mis. `customerId` saat menambah kendaraan pelanggan.
   */
  extraValues?: Record<string, string | number | null | undefined>
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
  "aria-describedby": ariaDescribedBy,
  title,
  description,
  fields,
  action,
  getLabel,
  onCreated,
  extraValues,
}: QuickAddSelectProps) {
  const [openDialog, setOpenDialog] = useState(false)
  const [search, setSearch] = useState("")
  const [isPending, startTransition] = useTransition()
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, ComboboxOption[]>>({})

  // Kunci stabil (bukan array) supaya efek tidak berjalan ulang tiap render.
  const loaderKey = fields
    .filter((field) => field.loadOptions)
    .map((field) => field.name)
    .sort((a, b) => a.localeCompare(b))
    .join(",")

  // Dialog ber-field banyak (mis. Pelanggan: 8 field + pemilih wilayah) memakai lebar
  // dua kolom supaya tidak memakan ruang layar; dialog ringkas tidak berubah.
  const wide = fields.length > 4

  useEffect(() => {
    if (!openDialog || !loaderKey) return
    let active = true
    Promise.all(
      fields
        .filter((field) => field.loadOptions)
        .map(async (field) => {
          try {
            return [field.name, await field.loadOptions!()] as const
          } catch {
            // Gagal memuat pilihan tidak boleh memblokir pengisian field lain.
            return [field.name, [] as ComboboxOption[]] as const
          }
        }),
    ).then((pairs) => {
      if (active) setDynamicOptions(Object.fromEntries(pairs))
    }).catch((e) => {
      // Gagal memuat pilihan dinamis — form tetap bisa diisi manual.
      console.warn("[quick-add]", e instanceof Error ? e.message : e)
    })
    return () => {
      active = false
    }
    // `fields` sengaja tidak jadi dependency: identitasnya stabil (konstanta registry)
    // dan yang menentukan pemuatan adalah daftar field ber-loader + status dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDialog, loaderKey])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Dialog ini hidup di dalam form dokumen (Penawaran/Faktur/…). Tanpa stopPropagation,
    // event submit naik ke form induk sehingga menyimpan quick-add sekaligus MENGIRIM
    // dokumennya — dulu itu membuat penawaran kosong tanpa disadari.
    e.stopPropagation()
    const form = e.currentTarget
    const formData = new FormData(form)
    // Signals redirect-based create actions (e.g. createTax, createBrand) to
    // return their new id instead of navigating away from the current form.
    formData.set("__quickAdd", "1")
    for (const [key, value] of Object.entries(extraValues ?? {})) {
      if (value !== null && value !== undefined && value !== "") formData.set(key, String(value))
    }
    // Combobox mengirim nilainya lewat input hidden, yang tidak ikut validasi `required`
    // bawaan browser — jadi field wajib diperiksa di sini.
    for (const field of fields) {
      if (field.type === "combobox" && field.required && !formData.get(field.name)) {
        showError(`${field.label} wajib dipilih`)
        return
      }
    }
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
        // BR-CD-05: reuse dinyatakan server -> pesan verbatim; entitas
        // lain tanpa penanda tetap sukses generik seperti sebelumnya.
        showSuccess(
          result.reused && result.message
            ? result.message
            : `${title} berhasil ditambahkan`,
        )
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
        aria-describedby={ariaDescribedBy}
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
        {/*
          Tinggi dibatasi `dvh` (bukan `vh`) supaya ikut mengecil saat keyboard HP
          muncul, dan hanya AREA ISI yang di-scroll — tombol Simpan selalu menempel
          di bawah dialog, jadi tidak perlu men-scroll untuk menyimpan.
        */}
        <DialogContent
          className={`flex max-h-[90dvh] flex-col overflow-hidden ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
            <div
              className={
                wide
                  ? // Dua kolom: entitas ber-field banyak (mis. Pelanggan) tidak jadi kolom
                    // panjang yang memakan ruang layar. Dialog ringkas tetap satu kolom.
                    "grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch] sm:grid-cols-2"
                  : "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]"
              }
            >
              {fields.map((field) => (
                <div key={field.name} className={wide && field.span === "full" ? "sm:col-span-2" : undefined}>
                  <QuickAddFieldControl
                    field={field}
                    dynamicOptions={dynamicOptions}
                    prefill={
                      field.name === "name" && search && !field.defaultValue
                        ? search
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
            <DialogFooter className="shrink-0">
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
  dynamicOptions,
}: {
  field: QuickAddField
  prefill?: string
  dynamicOptions: Record<string, ComboboxOption[]>
}) {
  if (field.type === "hidden") {
    return <input type="hidden" name={field.name} defaultValue={field.defaultValue} />
  }

  const inputId = `quick-add-${field.name}`
  // Hint dikaitkan via aria-describedby supaya SR mengumumkan helper text saat
  // fokus masuk ke field — sebelumnya <span> hint melayang tanpa asosiasi.
  const hintId = field.hint || field.emptyHint ? `${inputId}-hint` : undefined
  const emptyHintId =
    field.emptyHint && (field.type === "combobox" || field.type === "select")
      ? `${inputId}-empty-hint`
      : undefined

  // Wilayah: pakai pemilih bertingkat yang sama dengan form Pelanggan penuh, supaya
  // hasilnya identik (province/city/district/village/postalCode).
  if (field.type === "region") {
    return (
      <div className="flex flex-col gap-1.5">
        <span id={`${inputId}-label`} className="text-sm leading-none font-medium">
          {field.label}
        </span>
        <div role="group" aria-labelledby={`${inputId}-label`}>
          <AddressPicker />
        </div>
        {field.hint && (
          <span id={hintId} className="text-xs text-muted-foreground">
            {field.hint}
          </span>
        )}
      </div>
    )
  }

  const selectOptions = field.loadOptions
    ? (dynamicOptions[field.name] ?? [])
    : (field.options ?? [])
  // Hint yang aktif (empty-hint saat opsi kosong, biasa jika tidak) dikaitkan
  // via aria-describedby supaya SR mengumumkannya saat fokus masuk.
  const activeDescribedBy =
    field.emptyHint && selectOptions.length === 0
      ? emptyHintId
      : field.hint
        ? hintId
        : undefined

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>
        {field.label}
        {field.required && (
          <span aria-hidden="true" className="text-destructive">
            {" *"}
          </span>
        )}
      </Label>
      {field.type === "textarea" ? (
        <Textarea
          id={inputId}
          name={field.name}
          rows={3}
          required={field.required}
          placeholder={field.placeholder}
          defaultValue={(field.defaultValue as string) ?? ""}
          aria-required={field.required || undefined}
          aria-describedby={activeDescribedBy}
        />
      ) : field.type === "combobox" ? (
        // Combobox = pilihan yang bisa dicari (mis. tipe kendaraan dari ratusan varian).
        <QuickAddComboboxControl
          field={field}
          inputId={inputId}
          options={selectOptions}
          describedByIds={activeDescribedBy}
        />
      ) : field.type === "select" ? (
        <Select
          name={field.name}
          defaultValue={String(field.defaultValue ?? "")}
          required={field.required}
        >
          <SelectTrigger
            id={inputId}
            className="w-full"
            aria-required={field.required || undefined}
            aria-describedby={activeDescribedBy}
          >
            <SelectValue placeholder={field.placeholder ?? "-- Pilih --"} />
          </SelectTrigger>
          <SelectContent>
            {selectOptions.map((opt) => (
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
          aria-required={field.required || undefined}
          aria-describedby={activeDescribedBy}
          placeholder={field.placeholder}
          step={field.step}
          min={field.min}
          max={field.max}
          defaultValue={prefill ?? ((field.defaultValue as string) ?? "")}
          autoFocus={field.name === "name"}
        />
      )}
      {field.emptyHint && selectOptions.length === 0 && (field.type === "combobox" || field.type === "select") ? (
        <span id={emptyHintId} className="text-xs text-warning">
          {field.emptyHint}
        </span>
      ) : field.hint ? (
        <span id={hintId} className="text-xs text-muted-foreground">
          {field.hint}
        </span>
      ) : null}
    </div>
  )
}

/**
 * Kontrol combobox untuk dialog quick-add. Dipisah supaya punya state sendiri —
 * `QuickAddFieldControl` melakukan early-return untuk beberapa tipe field, dan hook
 * tidak boleh dipanggil sesudahnya.
 */
function QuickAddComboboxControl({
  field,
  inputId,
  options,
  describedByIds,
}: {
  field: QuickAddField
  inputId: string
  options: ComboboxOption[]
  describedByIds?: string
}) {
  const [value, setValue] = useState<string | null>(null)
  return (
    <Combobox
      id={inputId}
      name={field.name}
      options={options}
      value={value}
      onChange={setValue}
      placeholder={field.placeholder ?? "Cari…"}
      emptyText="Tidak ditemukan"
      required={field.required}
      aria-label={`${field.label}${field.required ? " (wajib)" : ""}`}
      aria-describedby={describedByIds}
    />
  )
}
