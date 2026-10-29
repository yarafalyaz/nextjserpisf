 
"use client"
/* eslint-disable react-hooks/incompatible-library */

import { useRouter } from "next/navigation"
import { useTransition, useMemo, useState } from "react"
import { useForm, useFieldArray, useWatch, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { quotationSchema, type QuotationInput } from "@/lib/validations/form.schemas"
import { createQuotation, updateQuotation } from "@/actions/sales.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"
import { buildUomOptions } from "@/lib/utils/uom-options"
import { CurrencyInput } from "@/components/ui/currency-input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"
import { toLocalDateOnly } from "@/lib/utils/date-only"

// ==================== TYPES ====================

interface CustomerVehicle {
  id: number
  customerId: number
  plateNumber: string
  brandName: string
  modelName: string
}

interface ItemOption {
  id: number
  name: string
  price: number
  unitOfMeasure: string
}

interface ProductMaterialOption {
  itemId: number
  qty: number
  name: string
  price: number
  unitOfMeasure: string
}

interface ProductOption {
  id: number
  code: string | null
  name: string
  standardCost: number
  materials: ProductMaterialOption[]
}

interface QuotationFormProps {
  customers: { id: number; name: string }[]
  customerVehicles: CustomerVehicle[]
  items: ItemOption[]
  products?: ProductOption[]
  generatedCode?: string
  paymentMethods?: { code: string; name: string }[]
  shippingMethods?: { code: string; name: string }[]
  unitOptions?: { name: string; symbol: string; category?: string | null }[]
  quotation?: Record<string, unknown> // for edit mode
  /** F-065-S AC-DP65-6/8: info ambang server; tanpa edit_quotations baca-saja. */
  invoiceThreshold?: { percent: number; sourceLabel: string } | null
  canEditQuotations?: boolean
}

// ==================== SECTION ITEMS COMPONENT ====================

function SectionItems({
  sectionIndex,
  control,
  items,
  setValue,
  register,
  products,
  unitOptions,
  uomExtra,
  setUomExtra,
}: {
  sectionIndex: number
  control: any
  items: ItemOption[]
  setValue: any
  register: any
  products?: ProductOption[]
  unitOptions: { name: string; symbol: string; category?: string | null }[]
  uomExtra: { code: string; label: string; category: string }[]
  setUomExtra: React.Dispatch<React.SetStateAction<{ code: string; label: string; category: string }[]>>
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `sections.${sectionIndex}.items`,
  })

  // Plain functions: `SectionItemRow` is not memoized, so a stable identity from
  // useCallback bought nothing while costing a hook on every render.
  function handleItemSelect(itemIndex: number, itemId: number) {
    const selected = items.find((i) => i.id === itemId)
    if (selected) {
      setValue(`sections.${sectionIndex}.items.${itemIndex}.itemId`, itemId)
      setValue(`sections.${sectionIndex}.items.${itemIndex}.unitPrice`, selected.price)
      setValue(`sections.${sectionIndex}.items.${itemIndex}.uom`, selected.unitOfMeasure)
      // Recalculate total
      const qty = control._formValues?.sections?.[sectionIndex]?.items?.[itemIndex]?.qty || 1
      const discount = control._formValues?.sections?.[sectionIndex]?.items?.[itemIndex]?.discount || 0
      const discountType = control._formValues?.sections?.[sectionIndex]?.items?.[itemIndex]?.discountType || "fixed"
      const total = calculateItemTotal(qty, selected.price, discountType, discount)
      setValue(`sections.${sectionIndex}.items.${itemIndex}.total`, total)
    }
  }

  // No setTimeout needed: react-hook-form's setValue writes `_formValues`
  // synchronously, so the recalc below already sees the value just set.
  function recalcItem(itemIndex: number) {
    const item = control._formValues?.sections?.[sectionIndex]?.items?.[itemIndex]
    if (item) {
      const total = calculateItemTotal(item.qty, item.unitPrice, item.discountType, item.discount)
      setValue(`sections.${sectionIndex}.items.${itemIndex}.total`, total)
    }
  }

  return (
    <div className="quotation-items">
      <table className="w-full border-collapse" style={{ fontSize: "0.8125rem" }}>
        <thead>
          <tr>
            <th style={{ minWidth: "200px" }}>Item</th>
            <th style={{ minWidth: "140px" }}>Deskripsi</th>
            <th style={{ width: "70px" }}>Jml</th>
            <th style={{ width: "70px" }}>Satuan</th>
            <th style={{ width: "120px" }}>Harga Satuan</th>
            <th style={{ width: "160px" }}>Diskon</th>
            <th style={{ width: "120px" }}>Total</th>
            <th style={{ width: "40px" }}></th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field, itemIndex) => (
            <SectionItemRow
              key={field.id}
              sectionIndex={sectionIndex}
              itemIndex={itemIndex}
              control={control}
              items={items}
              register={register}
              setValue={setValue}
              onItemSelect={handleItemSelect}
              onRecalc={recalcItem}
              onRemove={() => remove(itemIndex)}
              canRemove={fields.length > 1}
              unitOptions={unitOptions}
              uomExtra={uomExtra}
              setUomExtra={setUomExtra}
            />
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onPress={() =>
            append({
              itemId: 0,
              isCustom: false,
              description: "",
              qty: 1,
              uom: "PCS",
              unitPrice: 0,
              discountType: "fixed",
              discount: 0,
              total: 0,
            })
          }
          variant="secondary" size="sm"
        >
          + Tambah Item
        </Button>

        {products && products.length > 0 && (
          <div className="flex items-center gap-2 w-72">
            <Combobox
              value={null}
              onChange={(val) => {
                if (!val) return
                const prod = products.find(p => p.id === Number(val))
                if (prod) {
                  append({
                    itemId: null,
                    isCustom: true,
                    description: prod.code ? `[${prod.code}] ${prod.name}` : prod.name,
                    qty: 1,
                    uom: "PCS",
                    unitPrice: prod.standardCost,
                    discountType: "fixed",
                    discount: 0,
                    total: calculateItemTotal(1, prod.standardCost, "fixed", 0)
                  })
                }
              }}
              placeholder="Tarik dari Produk (BOM)..."
              options={products.map(p => ({
                value: String(p.id),
                label: p.code ? `[${p.code}] ${p.name}` : p.name
              }))}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ==================== ITEM ROW COMPONENT ====================

function SectionItemRow({
  sectionIndex,
  itemIndex,
  control,
  items,
  register,
  setValue,
  onItemSelect,
  onRecalc,
  onRemove,
  canRemove,
  unitOptions,
  uomExtra,
  setUomExtra,
}: {
  sectionIndex: number
  itemIndex: number
  control: any
  items: ItemOption[]
  register: any
  setValue: any
  onItemSelect: (itemIndex: number, itemId: number) => void
  onRecalc: (itemIndex: number) => void
  onRemove: () => void
  canRemove: boolean
  unitOptions: { name: string; symbol: string; category?: string | null }[]
  uomExtra: { code: string; label: string; category: string }[]
  setUomExtra: React.Dispatch<React.SetStateAction<{ code: string; label: string; category: string }[]>>
}) {
  const prefix = `sections.${sectionIndex}.items.${itemIndex}`
  const watchedItem = useWatch({ control, name: prefix })
  const isCustomMode = watchedItem?.isCustom || false

  return (
    <tr>
      <td className="align-middle">
        <div className="flex items-center gap-2">
          {/* Toggle Master vs Quick Add */}
          <button
            type="button"
            onClick={() => {
              const currentCustom = !isCustomMode
              setValue(`${prefix}.isCustom`, currentCustom)
              if (currentCustom) {
                setValue(`${prefix}.itemId`, null)
                setValue(`${prefix}.uom`, "JASA")
              } else {
                setValue(`${prefix}.itemId`, 0)
                setValue(`${prefix}.uom`, "PCS")
              }
            }}
            title={isCustomMode ? "Ubah ke Produk Master" : "Tambah Cepat Jasa Bebas"}
            className={`p-1.5 rounded-lg border transition-all text-xs shrink-0 flex items-center justify-center ${
              isCustomMode 
                ? (watchedItem?.uom === "JASA"
                    ? "bg-warning-soft border-warning text-warning-soft-foreground font-bold"
                    : "bg-primary-soft border-primary text-primary-soft-foreground font-bold")
                : "bg-default-soft border-default text-muted-foreground hover:bg-default"
            }`}
          >
            {isCustomMode ? (watchedItem?.uom === "JASA" ? "Jasa" : "Produk") : "Item"}
          </button>

          {isCustomMode ? (
            <input
              {...register(`${prefix}.description`)}
              aria-label={`Nama item baris ${itemIndex + 1}`}
              className="form-input w-full font-medium"
              style={{ fontSize: "0.8125rem", padding: "6px 8px" }}
              placeholder="Ketik nama jasa bebas..."
              onChange={(e) => {
                setValue(`${prefix}.description`, e.target.value)
              }}
            />
          ) : (
            <Controller
              name={`${prefix}.itemId`}
              control={control}
              render={({ field }) => (
                <Combobox
                  value={field.value ? String(field.value) : null}
                  onChange={(key) => {
                    if (key) {
                      onItemSelect(itemIndex, Number(key))
                      // Set description automatically from item name if master item selected
                      const sel = items.find(i => i.id === Number(key))
                      if (sel) {
                        setValue(`${prefix}.description`, sel.name)
                      }
                    }
                  }}
                  placeholder="Pilih item..."
                  options={items.map((item) => ({ value: String(item.id), label: item.name }))}
                />
              )}
            />
          )}
        </div>
      </td>
      <td>
        <input
          {...register(`${prefix}.description`)}
          aria-label={`Deskripsi baris ${itemIndex + 1}`}
          className="form-input"
          style={{ fontSize: "0.8125rem", padding: "6px 8px" }}
          placeholder="Catatan / spek tambahan..."
          disabled={isCustomMode} // Di mode jasa, kolom deskripsi sudah menyatu di kolom utama
        />
      </td>
      <td>
        <input
          type="number"
          step="0.01"
          min="0.01"
          aria-label={`Jumlah baris ${itemIndex + 1}`}
          {...register(`${prefix}.qty`, { valueAsNumber: true })}
          className="form-input"
          style={{ fontSize: "0.8125rem", padding: "6px 8px", textAlign: "right" }}
          onChange={(e) => {
            setValue(`${prefix}.qty`, (Number.isFinite((Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0)) ? (Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0) : 0))
            onRecalc(itemIndex)
          }}
        />
      </td>
      <td>
        <Controller
          name={`${prefix}.uom`}
          control={control}
          render={({ field }) => {
            // Baris jasa (custom) hanya lihat satuan jasa; baris barang hanya
            // satuan barang. Nilai warisan yg tak ada di master ikut tampil
            // agar baris lama tak blank; quick-add masuk uomExtra sesuai jenis.
            const kind = isCustomMode ? "jasa" : "barang"
            const base = buildUomOptions(unitOptions, field.value, kind).map((o) => ({
              value: o.value,
              label: o.label,
            }))
            const seen = new Set(base.map((o) => o.value.toUpperCase()))
            for (const x of uomExtra) {
              if (x.category === kind && x.code && !seen.has(x.code.toUpperCase())) {
                seen.add(x.code.toUpperCase())
                base.push({ value: x.code, label: x.label })
              }
            }
            return (
            <QuickAddSelect
              value={field.value || null}
              onChange={(key) => field.onChange(key ?? "")}
              options={base}
              placeholder="Pilih satuan..."
              title={QUICK_ADD.uom.title}
              fields={QUICK_ADD.uom.fields}
              action={QUICK_ADD.uom.action}
              getLabel={(formData) =>
                String(formData.get("symbol") ?? "").trim() ||
                String(formData.get("name") ?? "").trim()
              }
              onCreated={(created) => {
                setUomExtra((prev) => [...prev, { code: created.label, label: created.label, category: kind }])
                field.onChange(created.label)
              }}
            />
            )
          }}
        />
      </td>
      <td>
        <div style={{ width: "130px" }}>
          <CurrencyInput
            aria-label={`Harga satuan baris ${itemIndex + 1}`}
            value={watchedItem?.unitPrice || 0}
            onChange={(val) => {
              setValue(`${prefix}.unitPrice`, val)
              onRecalc(itemIndex)
            }}
            className="form-input"
            style={{ fontSize: "0.8125rem", padding: "6px 8px", textAlign: "right" }}
            placeholder="0"
          />
        </div>
      </td>
      <td>
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <Controller
            name={`${prefix}.discountType`}
            control={control}
            render={({ field }) => (
              <Combobox
                value={field.value ?? "fixed"}
                onChange={(key) => {
                  field.onChange(key ?? "")
                  onRecalc(itemIndex)
                }}
                options={[
                  { value: "fixed", label: "Rp" },
                  { value: "percent", label: "%" },
                ]}
                className="w-[60px] shrink-0"
              />
            )}
          />
          {(watchedItem?.discountType ?? "fixed") === "percent" ? (
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              aria-label={`Diskon persen baris ${itemIndex + 1}`}
              {...register(`${prefix}.discount`, { valueAsNumber: true })}
              className="form-input"
              style={{ fontSize: "0.8125rem", padding: "6px 8px", textAlign: "right", flex: 1 }}
              onChange={(e) => {
                const raw = Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0
                const clamped = Math.min(100, Math.max(0, raw))
                setValue(`${prefix}.discount`, clamped)
                onRecalc(itemIndex)
              }}
            />
          ) : (
            <CurrencyInput
              aria-label={`Diskon nominal baris ${itemIndex + 1}`}
              value={watchedItem?.discount ?? 0}
              onChange={(v) => {
                setValue(`${prefix}.discount`, v)
                onRecalc(itemIndex)
              }}
              min={0}
              className="text-right"
              style={{ flex: 1 }}
            />
          )}
        </div>
      </td>
      <td>
        <input
          aria-label={`Total baris ${itemIndex + 1}`}
          value={formatCurrency(watchedItem?.total || 0)}
          className="form-input"
          style={{ fontSize: "0.8125rem", padding: "6px 8px", textAlign: "right", background: "var(--color-surface-alt)", fontWeight: 600 }}
          readOnly
        />
      </td>
      <td>
        {canRemove && (
          <Button
            type="button"
            onPress={onRemove}
            aria-label={`Hapus item baris ${itemIndex + 1}`}
            variant="danger-soft" size="sm"
          >
            ×
          </Button>
        )}
      </td>
    </tr>
  )
}

// ==================== HELPERS ====================

function calculateItemTotal(qty: number, unitPrice: number, discountType: string, discount: number): number {
  const subtotal = qty * unitPrice
  if (discountType === "percent") {
    return Math.max(0, subtotal - (subtotal * discount) / 100)
  }
  return Math.max(0, subtotal - discount)
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)
}

// ==================== TOTALS COMPONENT ====================

function QuotationTotals({ control, setValue }: { control: any; setValue: any }) {
  const sections = useWatch({ control, name: "sections" })
  const discount = useWatch({ control, name: "discount" }) || 0
  const tax = useWatch({ control, name: "tax" }) || 0

  // Display-only derivation. The header totals are computed from the line items
  // here for rendering and again in `onSubmit` for the payload, so no effect
  // mirrors them into form state on every keystroke (react-hook-form's setValue
  // re-renders the whole form).
  const subtotal = useMemo(() => {
    if (!sections) return 0
    return sections.reduce((acc: number, section: any) => {
      if (!section?.items) return acc
      return acc + section.items.reduce((itemAcc: number, item: any) => itemAcc + (item?.total || 0), 0)
    }, 0)
  }, [sections])

  const grandTotal = useMemo(() => {
    return Math.max(0, subtotal - discount + tax)
  }, [subtotal, discount, tax])

  return (
    <div className="quotation-totals">
      <div className="totals-grid">
        <div className="totals-row">
          <span className="totals-label">Subtotal</span>
          <span className="totals-value">Rp {formatCurrency(subtotal)}</span>
        </div>
        <div className="totals-row">
          <span className="totals-label">Diskon</span>
          <div className="totals-input">
            {/* `.totals-prefix` memakai --text-muted (2.56:1 di latar putih); warnanya
                ditimpa inline dengan --muted-foreground (7.58:1 terang / 6.72:1 gelap).
                Berlaku untuk kedua prefix "Rp" di blok Total ini. */}
            <span className="totals-prefix" style={{ color: "var(--muted-foreground)" }}>Rp</span>
            <CurrencyInput
              aria-label="Diskon total penawaran"
              value={discount}
              onChange={(v) => setValue("discount", v)}
              className="text-right"
              style={{ maxWidth: "160px" }}
            />
          </div>
        </div>
        <div className="totals-row">
          <span className="totals-label">Pajak</span>
          <div className="totals-input">
            <span className="totals-prefix" style={{ color: "var(--muted-foreground)" }}>Rp</span>
            <CurrencyInput
              aria-label="Pajak total penawaran"
              value={tax}
              onChange={(v) => setValue("tax", v)}
              className="text-right"
              style={{ maxWidth: "160px" }}
            />
          </div>
        </div>
        <div className="totals-row totals-grand">
          <span className="totals-label">Total Keseluruhan</span>
          <span className="totals-value">Rp {formatCurrency(grandTotal)}</span>
        </div>
      </div>
    </div>
  )
}

// ==================== MAIN FORM COMPONENT ====================

export function QuotationForm({ customers, customerVehicles, items, products, generatedCode, paymentMethods = [], shippingMethods = [], unitOptions = [], quotation, invoiceThreshold = null, canEditQuotations = true }: QuotationFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [customerOptions, setCustomerOptions] = useState(customers)
  // Satuan baru dari quick-add (tanpa pindah halaman); digabung dgn master
  // + nilai warisan baris saat render per baris di SectionItemRow.
  const [uomExtra, setUomExtra] = useState<{ code: string; label: string; category: string }[]>([])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<QuotationInput>({
    resolver: zodResolver(quotationSchema) as any,
    defaultValues: quotation
      ? quotation
      : {
          customerId: undefined,
          customerVehicleId: undefined,
          date: toLocalDateOnly(new Date()),
          validUntil: toLocalDateOnly(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)),
          subtotal: 0,
          discount: 0,
          tax: 0,
          grandTotal: 0,
          paymentMethod: "",
          shippingMethod: "",
          notes: "",
          sections: [
            {
              name: "",
              items: [
                {
                  itemId: 0,
                  isCustom: false,
                  description: "",
                  qty: 1,
                  uom: "PCS",
                  unitPrice: 0,
                  discountType: "fixed",
                  discount: 0,
                  total: 0,
                },
              ],
            },
          ],
        },
  })

  const { fields: sectionFields, append: appendSection, remove: removeSection } = useFieldArray({
    control,
    name: "sections",
  })

  const selectedCustomerId = watch("customerId")

  // Kendaraan milik pelanggan yang dipilih. Disimpan sebagai state supaya kendaraan
  // yang baru dibuat lewat quick-add bisa langsung dipilih tanpa memuat ulang halaman.
  const [vehicleOptions, setVehicleOptions] = useState(() =>
    customerVehicles.map((v) => ({
      id: v.id,
      customerId: v.customerId,
      label: `${v.plateNumber} - ${v.brandName} ${v.modelName}`.replace(/^ - | - $/g, "").trim(),
    })),
  )

  const filteredVehicles = useMemo(() => {
    if (!selectedCustomerId) return []
    return vehicleOptions.filter((v) => v.customerId === selectedCustomerId)
  }, [selectedCustomerId, vehicleOptions])

  function onSubmit(data: QuotationInput) {
    startTransition(async () => {
      try {
        // Header totals are derived at submit time rather than mirrored into form
        // state by an effect on every keystroke. The server recomputes both from
        // the line items regardless, so the request payload is unchanged.
        const subtotal = (data.sections ?? []).reduce(
          (acc, section) =>
            acc + (section.items ?? []).reduce((itemAcc, item) => itemAcc + (item?.total || 0), 0),
          0,
        )
        const grandTotal = Math.max(0, subtotal - (data.discount || 0) + (data.tax || 0))
        const payload = { ...data, subtotal, grandTotal }
        const formData = new FormData()
        let result: { success: boolean; id?: number; slug?: string | null; error?: string }
        if (quotation?.id) {
          // Send the full section tree (same shape as create) so edited line
          // items/qty/prices are persisted and re-synced to linked SO/Invoice.
          formData.set("data", JSON.stringify(payload))
          result = await updateQuotation(Number(quotation.id), formData)
        } else {
          formData.set("data", JSON.stringify(payload))
          result = await createQuotation(formData)
        }
        if (result.success) {
          showSuccess(quotation?.id ? "Penawaran berhasil diperbarui" : "Penawaran berhasil dibuat")
          router.push(`/penjualan/penawaran/${result.slug ?? result.id ?? quotation?.id}`)
          router.refresh()
        } else {
          showError(result.error || "Gagal menyimpan data")
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      aria-busy={isPending}
      aria-label={quotation?.id ? "Formulir ubah penawaran" : "Formulir tambah penawaran"}
    >
      <FormCard>
        <FormSection title="Informasi Penawaran">
        {/* Document Number (read-only) */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="documentNo">No. Dokumen</Label>
          <Input
            id="documentNo"
            value={String(quotation?.documentNo || generatedCode || "Dibuat otomatis")}
            readOnly
            className="bg-muted"
          />
        </div>

        {/* F-065-S AC-DP65-6/8: persen ambang efektif dari server, bukan hitungan UI.
            Tanpa edit_quotations tampil baca-saja/disabled; nilai tidak pernah dikirim balik. */}
        {invoiceThreshold ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invoiceThresholdPercent">Ambang Invoice (%)</Label>
            <Input
              id="invoiceThresholdPercent"
              value={`${invoiceThreshold.percent}%`}
              readOnly
              disabled={!canEditQuotations}
              aria-describedby="invoiceThresholdSource"
              className="bg-muted"
            />
            <p id="invoiceThresholdSource" className="text-xs text-muted-foreground">
              {invoiceThreshold.sourceLabel}
            </p>
            {!canEditQuotations ? (
              <p className="text-xs text-muted-foreground">
                Hanya baca: ubah ambang memerlukan izin edit_quotations.
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Customer */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customerId">Pelanggan <span className="text-destructive" aria-hidden="true">*</span></Label>
          <Controller
            name="customerId"
            control={control}
            render={({ field }) => (
              <QuickAddSelect
                id="customerId"
                required
                value={field.value ? String(field.value) : null}
                onChange={(key) => {
                  field.onChange(key ? Number(key) : undefined)
                  // Reset vehicle when customer changes
                  setValue("customerVehicleId", undefined)
                }}
                placeholder="Cari pelanggan..."
                options={customerOptions.map((c) => ({ value: String(c.id), label: c.name }))}
                title={QUICK_ADD.customer.title}
                fields={QUICK_ADD.customer.fields}
                action={QUICK_ADD.customer.action}
                onCreated={(created) => {
                  setCustomerOptions((prev) => [...prev, { id: created.id, name: created.label }])
                  field.onChange(created.id)
                  setValue("customerVehicleId", undefined)
                }}
              />
            )}
          />
          {errors.customerId && <span className="text-xs text-danger mt-1">{errors.customerId.message}</span>}
        </div>

        {/* Customer Vehicle */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customerVehicleId">Kendaraan</Label>
          <Controller
            name="customerVehicleId"
            control={control}
            render={({ field }) => (
              <QuickAddSelect
                id="customerVehicleId"
                value={field.value ? String(field.value) : null}
                onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                disabled={!selectedCustomerId}
                placeholder={selectedCustomerId ? "Pilih kendaraan..." : "Pilih pelanggan dulu"}
                options={filteredVehicles.map((v) => ({ value: String(v.id), label: v.label }))}
                title={QUICK_ADD.customerVehicle.title}
                fields={QUICK_ADD.customerVehicle.fields}
                action={QUICK_ADD.customerVehicle.action}
                getLabel={QUICK_ADD.customerVehicle.getLabel}
                // Kendaraan selalu milik pelanggan yang sedang dipilih di dokumen.
                extraValues={{ customerId: selectedCustomerId }}
                onCreated={(created) => {
                  if (!selectedCustomerId) return
                  setVehicleOptions((prev) => [
                    ...prev,
                    { id: created.id, customerId: selectedCustomerId, label: created.label },
                  ])
                  field.onChange(created.id)
                }}
              />
            )}
          />
        </div>

        {/* Date */}
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal *"
            name="date"
            value={watch("date")}
            onChange={(val) => {
              setValue("date", val)
              if (val) {
                const d = new Date(val)
                d.setDate(d.getDate() + 14)
                setValue("validUntil", d.toISOString().split("T")[0])
              }
            }}
            required
          />
          {errors.date && <span className="text-xs text-danger mt-1">{errors.date.message}</span>}
        </div>

        {/* Valid Until */}
        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Berlaku Sampai"
            name="validUntil"
            value={watch("validUntil")}
            onChange={(val) => setValue("validUntil", val)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="paymentMethod">Metode Pembayaran</Label>
          <Controller
            name="paymentMethod"
            control={control}
            render={({ field }) => (
              <Combobox
                id="paymentMethod"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? "")}
                placeholder="Pilih / ketik metode..."
                options={(paymentMethods.length > 0
                  ? paymentMethods
                  : [
                      { code: "transfer", name: "Transfer Bank" },
                      { code: "cash", name: "Tunai" },
                    ]
                ).map((m) => ({ value: m.code, label: m.name }))}
              />
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="shippingMethod">Metode Pengiriman</Label>
          <Controller
            name="shippingMethod"
            control={control}
            render={({ field }) => (
              <Combobox
                id="shippingMethod"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? "")}
                placeholder="Pilih / ketik metode..."
                options={(shippingMethods.length > 0
                  ? shippingMethods
                  : [
                      { code: "pickup", name: "Ambil Sendiri" },
                      { code: "courier", name: "Kurir" },
                    ]
                ).map((m) => ({ value: m.code, label: m.name }))}
              />
            )}
          />
        </div>
        </FormSection>

      <FormSection title="Item Penawaran" columns={1}>
        <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            onPress={() =>
              appendSection({
                name: "",
                items: [
                  {
                    itemId: 0,
                    isCustom: false,
                    description: "",
                    qty: 1,
                    uom: "PCS",
                    unitPrice: 0,
                    discountType: "fixed",
                    discount: 0,
                    total: 0,
                  },
                ],
              })
            }
            variant="primary" size="sm"
          >
            + Tambah Section
          </Button>
        </div>
        </div>

        {sectionFields.map((sectionField, sectionIndex) => (
          <div key={sectionField.id} className="quotation-section-card">
            <div className="flex flex-wrap items-center justify-between gap-2 p-4 px-5 border-b border-default">
              <input
                {...register(`sections.${sectionIndex}.name`)}
                aria-label={`Nama bagian ${sectionIndex + 1}`}
                className="form-input section-name-input"
                placeholder={`Nama Section (opsional)`}
              />
              {sectionFields.length > 1 && (
                <Button
                  type="button"
                  onPress={() => removeSection(sectionIndex)}
                  variant="danger-soft" size="sm"
                >
                  Hapus Section
                </Button>
              )}
            </div>

            <SectionItems
              sectionIndex={sectionIndex}
              control={control}
              items={items}
              setValue={setValue}
              register={register}
              products={products}
              unitOptions={unitOptions}
              uomExtra={uomExtra}
              setUomExtra={setUomExtra}
            />
          </div>
        ))}

        {errors.sections && typeof errors.sections.message === "string" && (
          <span className="text-xs text-danger mt-1">{errors.sections.message}</span>
        )}
      </FormSection>

      <FormSection title="Total" columns={1}>
        <QuotationTotals control={control} setValue={setValue} />
      </FormSection>

      <FormSection title="Lainnya" columns={1}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Catatan</Label>
          <Textarea id="notes" {...register("notes")} rows={3} placeholder="Catatan untuk penawaran ini..." />
        </div>
      </FormSection>

      <FormActions>
        <Button type="button" onPress={() => router.back()}>Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : "Buat Penawaran"}
        </Button>
      </FormActions>
      </FormCard>
    </form>
  )
}
