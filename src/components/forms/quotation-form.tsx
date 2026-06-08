/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"
/* eslint-disable react-hooks/incompatible-library */

import { useRouter } from "next/navigation"
import { useTransition, useCallback, useMemo } from "react"
import { useForm, useFieldArray, useWatch, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { quotationSchema, type QuotationInput } from "@/lib/validators"
import { createQuotation, updateQuotation } from "@/actions/sales.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { CurrencyInput } from "@/components/ui/currency-input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/page-header"

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

interface QuotationFormProps {
  customers: { id: number; name: string }[]
  customerVehicles: CustomerVehicle[]
  items: ItemOption[]
  generatedCode?: string
  paymentMethods?: { code: string; name: string }[]
  shippingMethods?: { code: string; name: string }[]
  quotation?: Record<string, unknown> // for edit mode
}

// ==================== SECTION ITEMS COMPONENT ====================

function SectionItems({
  sectionIndex,
  control,
  items,
  setValue,
  register,
}: {
  sectionIndex: number
  control: any
  items: ItemOption[]
  setValue: any
  register: any
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `sections.${sectionIndex}.items`,
  })

  const handleItemSelect = useCallback(
    (itemIndex: number, itemId: number) => {
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
    },
    [items, sectionIndex, setValue, control]
  )

  const recalcItem = useCallback(
    (itemIndex: number) => {
      const item = control._formValues?.sections?.[sectionIndex]?.items?.[itemIndex]
      if (item) {
        const total = calculateItemTotal(item.qty, item.unitPrice, item.discountType, item.discount)
        setValue(`sections.${sectionIndex}.items.${itemIndex}.total`, total)
      }
    },
    [sectionIndex, setValue, control]
  )

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
            />
          ))}
        </tbody>
      </table>
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
        className="mt-2"
      >
        + Tambah Item
      </Button>
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
                ? "bg-warning-soft border-warning text-warning-soft-foreground font-bold" 
                : "bg-default-soft border-default text-muted-foreground hover:bg-default"
            }`}
          >
            {isCustomMode ? "Jasa" : "Item"}
          </button>

          {isCustomMode ? (
            <input
              {...register(`${prefix}.description`)}
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
          {...register(`${prefix}.qty`, { valueAsNumber: true })}
          className="form-input"
          style={{ fontSize: "0.8125rem", padding: "6px 8px", textAlign: "right" }}
          onChange={(e) => {
            setValue(`${prefix}.qty`, (Number.isFinite((Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0)) ? (Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0) : 0))
            setTimeout(() => onRecalc(itemIndex), 0)
          }}
        />
      </td>
      <td>
        <input
          {...register(`${prefix}.uom`)}
          className="form-input"
          style={{ fontSize: "0.8125rem", padding: "6px 8px" }}
          placeholder="pcs"
        />
      </td>
      <td>
        <div style={{ width: "130px" }}>
          <CurrencyInput
            value={watchedItem?.unitPrice || 0}
            onChange={(val) => {
              setValue(`${prefix}.unitPrice`, val)
              setTimeout(() => onRecalc(itemIndex), 0)
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
                  setTimeout(() => onRecalc(itemIndex), 0)
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
              {...register(`${prefix}.discount`, { valueAsNumber: true })}
              className="form-input"
              style={{ fontSize: "0.8125rem", padding: "6px 8px", textAlign: "right", flex: 1 }}
              onChange={(e) => {
                const raw = Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0
                const clamped = Math.min(100, Math.max(0, raw))
                setValue(`${prefix}.discount`, clamped)
                setTimeout(() => onRecalc(itemIndex), 0)
              }}
            />
          ) : (
            <CurrencyInput
              value={watchedItem?.discount ?? 0}
              onChange={(v) => {
                setValue(`${prefix}.discount`, v)
                setTimeout(() => onRecalc(itemIndex), 0)
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

  // Sync calculated values to form
  useMemo(() => {
    setValue("subtotal", subtotal, { shouldDirty: false })
    setValue("grandTotal", grandTotal, { shouldDirty: false })
  }, [subtotal, grandTotal, setValue])

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
            <span className="totals-prefix">Rp</span>
            <CurrencyInput
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
            <span className="totals-prefix">Rp</span>
            <CurrencyInput
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

export function QuotationForm({ customers, customerVehicles, items, generatedCode, paymentMethods = [], shippingMethods = [], quotation }: QuotationFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

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
          date: new Date().toISOString().split("T")[0],
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
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

  // Filter vehicles by selected customer
  const filteredVehicles = useMemo(() => {
    if (!selectedCustomerId) return []
    return customerVehicles.filter((v) => v.customerId === selectedCustomerId)
  }, [selectedCustomerId, customerVehicles])

  function onSubmit(data: QuotationInput) {
    startTransition(async () => {
      try {
        const formData = new FormData()
        let result: { success: boolean; id?: number; error?: string }
        if (quotation?.id) {
          formData.set("customerId", String(data.customerId))
          if (data.customerVehicleId) formData.set("customerVehicleId", String(data.customerVehicleId))
          formData.set("date", data.date)
          if (data.validUntil) formData.set("validUntil", data.validUntil)
          formData.set("paymentMethod", data.paymentMethod || "")
          formData.set("shippingMethod", data.shippingMethod || "")
          formData.set("notes", data.notes || "")
          result = await updateQuotation(Number(quotation.id), formData)
        } else {
          formData.set("data", JSON.stringify(data))
          result = await createQuotation(formData)
        }
        if (result.success) {
          showSuccess(quotation?.id ? "Penawaran berhasil diperbarui" : "Penawaran berhasil dibuat")
          router.push(`/penjualan/penawaran/${result.id || quotation?.id}`)
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
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormCard>
        <FormSection title="Informasi Penawaran">
        {/* Document Number (read-only) */}
        <div className="flex flex-col gap-1.5">
          <Label>No. Dokumen</Label>
          <Input
            value={String(quotation?.documentNo || generatedCode || "Dibuat otomatis")}
            readOnly
            className="bg-muted"
          />
        </div>

        {/* Customer */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customerId">Pelanggan *</Label>
          <Controller
            name="customerId"
            control={control}
            render={({ field }) => (
              <Combobox
                id="customerId"
                value={field.value ? String(field.value) : null}
                onChange={(key) => {
                  field.onChange(key ? Number(key) : undefined)
                  // Reset vehicle when customer changes
                  setValue("customerVehicleId", undefined)
                }}
                placeholder="Cari pelanggan..."
                options={customers.map((c) => ({ value: String(c.id), label: c.name }))}
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
              <Combobox
                id="customerVehicleId"
                value={field.value ? String(field.value) : null}
                onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                disabled={!selectedCustomerId}
                placeholder={selectedCustomerId ? "Pilih kendaraan..." : "Pilih pelanggan dulu"}
                options={filteredVehicles.map((v) => ({ value: String(v.id), label: `${v.plateNumber} - ${v.brandName} ${v.modelName}`.trim() }))}
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
            <div className="section-flex items-center justify-between p-4 px-5 border-b border-default">
              <input
                {...register(`sections.${sectionIndex}.name`)}
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
