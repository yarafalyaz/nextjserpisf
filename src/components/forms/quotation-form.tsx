"use client"

import { useRouter } from "next/navigation"
import { useTransition, useCallback, useMemo } from "react"
import { useForm, useFieldArray, useWatch, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { quotationSchema, type QuotationInput } from "@/lib/validators"
import { createQuotation } from "@/actions/sales.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Input, TextArea, Label, ComboBox, ListBox, Select } from "@heroui/react"
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
  quotation?: Record<string, unknown> // for edit mode
}

// ==================== SECTION ITEMS COMPONENT ====================

function SectionItems({
  sectionIndex,
  control,
  items,
  setValue,
  register,
  errors,
}: {
  sectionIndex: number
  control: any
  items: ItemOption[]
  setValue: any
  register: any
  errors: any
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
            <th style={{ width: "70px" }}>Qty</th>
            <th style={{ width: "70px" }}>UoM</th>
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
              errors={errors}
            />
          ))}
        </tbody>
      </table>
      <Button
        type="button"
        onPress={() =>
          append({
            itemId: 0,
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
        style={{ marginTop: "8px" }}
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
  errors,
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
  errors: any
}) {
  const prefix = `sections.${sectionIndex}.items.${itemIndex}`
  const watchedItem = useWatch({ control, name: prefix })

  return (
    <tr>
      <td>
        <Controller
          name={`${prefix}.itemId`}
          control={control}
          render={({ field }) => (
            <ComboBox
              selectedKey={field.value ? String(field.value) : null}
              onSelectionChange={(key) => {
                if (key) onItemSelect(itemIndex, Number(key))
              }}
              className="w-full"
            >
              <ComboBox.InputGroup>
                <Input placeholder="Pilih item..." style={{ fontSize: "0.8125rem", padding: "6px 8px" }} />
                <ComboBox.Trigger />
              </ComboBox.InputGroup>
              <ComboBox.Popover>
                <ListBox>
                  {items.map((item) => (
                    <ListBox.Item key={item.id} id={String(item.id)} textValue={item.name}>
                      {item.name}
                    </ListBox.Item>
                  ))}
                </ListBox>
              </ComboBox.Popover>
            </ComboBox>
          )}
        />
      </td>
      <td>
        <input
          {...register(`${prefix}.description`)}
          className="form-input"
          style={{ fontSize: "0.8125rem", padding: "6px 8px" }}
          placeholder="Deskripsi..."
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
        <input
          type="number"
          step="0.01"
          min="0"
          {...register(`${prefix}.unitPrice`, { valueAsNumber: true })}
          className="form-input"
          style={{ fontSize: "0.8125rem", padding: "6px 8px", textAlign: "right" }}
          onChange={(e) => {
            setValue(`${prefix}.unitPrice`, (Number.isFinite((Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0)) ? (Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0) : 0))
            setTimeout(() => onRecalc(itemIndex), 0)
          }}
        />
      </td>
      <td>
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <select
            {...register(`${prefix}.discountType`)}
            className="form-input"
            style={{ fontSize: "0.8125rem", padding: "6px 8px", width: "60px", flexShrink: 0 }}
            onChange={(e) => {
              setValue(`${prefix}.discountType`, e.target.value)
              setTimeout(() => onRecalc(itemIndex), 0)
            }}
          >
            <option value="fixed">Rp</option>
            <option value="percent">%</option>
          </select>
          <input
            type="number"
            step="0.01"
            min="0"
            {...register(`${prefix}.discount`, { valueAsNumber: true })}
            className="form-input"
            style={{ fontSize: "0.8125rem", padding: "6px 8px", textAlign: "right", flex: 1 }}
            onChange={(e) => {
              setValue(`${prefix}.discount`, (Number.isFinite((Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0)) ? (Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0) : 0))
              setTimeout(() => onRecalc(itemIndex), 0)
            }}
          />
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
            <input
              type="number"
              step="0.01"
              min="0"
              className="form-input"
              style={{ fontSize: "0.875rem", padding: "6px 8px", textAlign: "right", maxWidth: "160px" }}
              defaultValue={discount}
              onChange={(e) => setValue("discount", (Number.isFinite((Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0)) ? (Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0) : 0))}
            />
          </div>
        </div>
        <div className="totals-row">
          <span className="totals-label">Pajak</span>
          <div className="totals-input">
            <span className="totals-prefix">Rp</span>
            <input
              type="number"
              step="0.01"
              min="0"
              className="form-input"
              style={{ fontSize: "0.875rem", padding: "6px 8px", textAlign: "right", maxWidth: "160px" }}
              defaultValue={tax}
              onChange={(e) => setValue("tax", (Number.isFinite((Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0)) ? (Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 0) : 0))}
            />
          </div>
        </div>
        <div className="totals-row totals-grand">
          <span className="totals-label">Grand Total</span>
          <span className="totals-value">Rp {formatCurrency(grandTotal)}</span>
        </div>
      </div>
    </div>
  )
}

// ==================== MAIN FORM COMPONENT ====================

export function QuotationForm({ customers, customerVehicles, items, generatedCode, quotation }: QuotationFormProps) {
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
          notes: "",
          sections: [
            {
              name: "",
              items: [
                {
                  itemId: 0,
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
        formData.set("data", JSON.stringify(data))
        const result = await createQuotation(formData)
        if (result.success) {
          showSuccess("Quotation berhasil dibuat")
          router.push(`/sales/quotations/${result.id}`)
          router.refresh()
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FormCard>
        <FormSection title="Informasi Quotation">
        {/* Document Number (read-only) */}
        <div className="flex flex-col gap-1.5">
          <Label>No. Dokumen</Label>
          <Input
            value={generatedCode || "Auto-generated"}
            readOnly
            className="bg-muted"
          />
        </div>

        {/* Customer */}
        <div className="flex flex-col gap-1.5">
          <Controller
            name="customerId"
            control={control}
            render={({ field }) => (
              <ComboBox
                selectedKey={field.value ? String(field.value) : null}
                onSelectionChange={(key) => {
                  field.onChange(key ? Number(key) : undefined)
                  // Reset vehicle when customer changes
                  setValue("customerVehicleId", undefined)
                }}
                className="w-full"
              >
                <Label>Customer *</Label>
                <ComboBox.InputGroup>
                  <Input placeholder="Cari customer..." />
                  <ComboBox.Trigger />
                </ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox>
                    {customers.map((c) => (
                      <ListBox.Item key={c.id} id={String(c.id)} textValue={c.name}>
                        {c.name}
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
            )}
          />
          {errors.customerId && <span className="text-xs text-danger mt-1">{errors.customerId.message}</span>}
        </div>

        {/* Customer Vehicle */}
        <div className="flex flex-col gap-1.5">
          <Controller
            name="customerVehicleId"
            control={control}
            render={({ field }) => (
              <ComboBox
                selectedKey={field.value ? String(field.value) : null}
                onSelectionChange={(key) => field.onChange(key ? Number(key) : undefined)}
                className="w-full"
                isDisabled={!selectedCustomerId}
              >
                <Label>Kendaraan</Label>
                <ComboBox.InputGroup>
                  <Input placeholder={selectedCustomerId ? "Pilih kendaraan..." : "Pilih customer dulu"} />
                  <ComboBox.Trigger />
                </ComboBox.InputGroup>
                <ComboBox.Popover>
                  <ListBox>
                    {filteredVehicles.map((v) => {
                      const label = `${v.plateNumber} - ${v.brandName} ${v.modelName}`.trim()
                      return (
                        <ListBox.Item key={v.id} id={String(v.id)} textValue={label}>
                          {label}
                        </ListBox.Item>
                      )
                    })}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
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
            label="Valid Sampai"
            name="validUntil"
            value={watch("validUntil")}
            onChange={(val) => setValue("validUntil", val)}
          />
        </div>
        </FormSection>

      <FormSection title="Item Quotation" columns={1}>
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
              errors={errors?.sections?.[sectionIndex]?.items}
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
          <TextArea id="notes" {...register("notes")} rows={3} placeholder="Catatan untuk quotation ini..." />
        </div>
      </FormSection>

      <FormActions>
        <Button onPress={() => router.back()}>Batal</Button>
        <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Menyimpan..." : "Buat Quotation"}
        </Button>
      </FormActions>
      </FormCard>
    </form>
  )
}
