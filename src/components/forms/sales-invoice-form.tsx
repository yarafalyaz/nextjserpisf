"use client"
/* eslint-disable react-hooks/incompatible-library */

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import "@/lib/validations/zod-locale";
import { createSalesInvoice, updateSalesInvoice } from "@/actions/sales.actions"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { SalesCustomerFormShell } from "@/components/forms/sales-customer-form-shell"
import { useCreditGateBlocked } from "@/components/forms/credit-override-panel"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Input } from "@/components/ui/shadcn/input"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { formatCurrency } from "@/lib/utils/format"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/shadcn/alert"
import { AlertCircle } from "lucide-react"

const salesInvoiceSchema = z.object({
  customerId: z.number({ error: "Pelanggan wajib dipilih" }).min(1, "Pelanggan wajib dipilih"),
  salesOrderId: z.number().optional(),
  date: z.string().min(1, "Tanggal wajib diisi"),
  dueDate: z.string().optional(),
  // Format ringan selaras server (tax-invoice.schemas): kosong boleh.
  taxInvoiceNumber: z
    .string()
    .trim()
    .max(50, "Nomor faktur pajak maksimal 50 karakter")
    .regex(/^[0-9A-Za-z][0-9A-Za-z .-]*$/, "Nomor faktur pajak hanya boleh berisi huruf, angka, spasi, titik, dan strip")
    .optional()
    .or(z.literal("")),
  notes: z.string().optional(),
})

type SalesInvoiceInput = z.infer<typeof salesInvoiceSchema>

interface SalesInvoiceFormProps {
  customers: { id: number; name: string
}[]
  invoice?: { id: number; customerId: number; salesOrderId?: number | null; date: string; dueDate?: string | null; taxInvoiceNumber?: string | null; notes?: string | null; items?: Array<{ itemId: number; qty: number; unitPrice: number; discount?: number }> }
  salesOrders: { id: number; documentNo: string }[]
  /** Sumber dari tautan "buat dari" (mis. dari Perintah Kerja/penawaran lewat
   *  pesanan penjualannya) supaya faktur baru sudah tertaut ke pesanan itu. */
  defaultSalesOrderId?: number
  defaultCustomerId?: number
  /** Faktur lahir langsung dari penawaran (belum ada pesanannya, mis. dari
   *  Perintah Kerja): id penawaran diteruskan ke createSalesInvoice supaya
   *  tautan penawarannya tidak hilang. */
  defaultQuotationId?: number
  /** Item pesanan penjualan sebagai NILAI AWAL — boleh diubah/dihapus.
   *  Fabrikasi: spesifikasi bisa berubah setelah faktur dibuat. */
  initialItems?: InitialItem[]
  /** Tarif PPN awal, diturunkan dari pesanan/penawaran asal bila ada. */
  initialTaxRate?: number
  availableItems?: AvailableItem[]
}

interface AvailableItem {
  id: number
  name: string
  sku?: string | null
  price?: number | null
  isScrapSaleItem?: boolean
}

interface InitialItem {
  itemId: number | null
  description?: string | null
  qty: number
  unitPrice: number
  discount: number
}

interface LineItem {
  key: string
  itemId: number | null
  qty: number
  unitPrice: number
  discount: number
}

let rowSeq = 0
function newRow(): LineItem {
  rowSeq += 1
  return { key: `baris-${rowSeq}`, itemId: null, qty: 1, unitPrice: 0, discount: 0 }
}

function toRow(item: InitialItem): LineItem {
  rowSeq += 1
  return {
    key: `baris-${rowSeq}`,
    itemId: item.itemId,
    qty: Number(item.qty) || 0,
    unitPrice: Number(item.unitPrice) || 0,
    discount: Number(item.discount) || 0,
  }
}

function lineTotal(row: LineItem): number {
  const gross = (Number(row.qty) || 0) * (Number(row.unitPrice) || 0)
  return Math.max(0, gross - (Number(row.discount) || 0))
}

// P2 idempotency UI: generator key murni di luar render (pola customer-credit-panel).
function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

export function SalesInvoiceForm({
  customers,
  salesOrders,
  invoice,
  defaultSalesOrderId,
  defaultCustomerId,
  defaultQuotationId,
  initialItems,
  initialTaxRate,
  availableItems = [],
}: SalesInvoiceFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [customerOptions, setCustomerOptions] = useState(customers)
  const { guardCreditReason, appendCreditReason, applyCreditResult, creditGatePanel } = useCreditGateBlocked()
  const [rows, setRows] = useState<LineItem[]>(() => (initialItems ?? []).map(toRow))
  const [taxRate, setTaxRate] = useState<number>(() => Number(initialTaxRate ?? 0) || 0)
  // P2 idempotency UI: satu key stabil per submit create (crypto.randomUUID per
  // submit). Retry/error pakai key sama; sukses/regenerasi ganti key baru.
  // Update (invoice?.id) tak perlu key — guard server hanya di jalur create.
  const idempotencyKeyRef = useRef<string>(newIdempotencyKey())

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<SalesInvoiceInput>({
    resolver: zodResolver(salesInvoiceSchema),
    defaultValues: {
      customerId: invoice?.customerId ?? defaultCustomerId,
      salesOrderId: invoice?.salesOrderId ?? defaultSalesOrderId ?? undefined,
      date: invoice?.date ?? toLocalDateOnly(new Date()),
      dueDate: invoice?.dueDate ?? "",
      taxInvoiceNumber: invoice?.taxInvoiceNumber ?? "",
      notes: invoice?.notes ?? "",
    },
  })

  const subtotal = rows.reduce((sum, row) => sum + lineTotal(row), 0)
  // F-135-V: peringatan tampilan saja dari flag master server — server tetap
  // menolak campuran besi tua + dagang saat posting.
  const pickedItems = rows
    .map((row) => availableItems.find((a) => a.id === row.itemId))
    .filter((a) => a !== undefined)
  const hasMixedScrapLines =
    pickedItems.some((a) => a.isScrapSaleItem) && pickedItems.some((a) => !a.isScrapSaleItem)
  const taxAmount = Math.round((subtotal * (Number(taxRate) || 0)) / 100)
  const grandTotal = subtotal + taxAmount

  function updateRow(key: string, patch: Partial<LineItem>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function onSubmit(data: SalesInvoiceInput) {
    if (!guardCreditReason()) return
    startTransition(async () => {
      try {
        const formData = new FormData()
        Object.entries(data).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== "") formData.append(key, String(value))
        })
        // Hanya baris yang benar-benar punya barang yang dikirim. Baris kosong
        // sisa klik "Tambah Baris" tidak boleh menjadi item tanpa id.
        const payload = rows
          .filter((row) => row.itemId !== null)
          .map((row) => ({
            itemId: row.itemId,
            qty: Number(row.qty) || 0,
            unitPrice: Number(row.unitPrice) || 0,
            discount: Number(row.discount) || 0,
          }))
        if (payload.length > 0) {
          formData.append("items", JSON.stringify(payload))
          formData.append("taxRate", String(Number(taxRate) || 0))
        }
        // P2 idempotency UI: key stabil per intent create; retry/error pakai
        // key sama, sukses ganti baru supaya create berikutnya tak ditolak.
        if (!invoice?.id) formData.set("idempotencyKey", idempotencyKeyRef.current)
        // Tautan penawaran untuk faktur yang lahir langsung dari penawaran.
        if (!invoice?.id && defaultQuotationId) formData.append("quotationId", String(defaultQuotationId))
        appendCreditReason(formData)
        const result = invoice?.id ? await updateSalesInvoice(invoice.id, formData) : await createSalesInvoice(formData)
        if (result.success) {
          if (!invoice?.id) idempotencyKeyRef.current = newIdempotencyKey()
          applyCreditResult(result)
          showSuccess(invoice?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
          router.push(`/penjualan/faktur/${result.slug ?? result.id}`)
          router.refresh()
        } else if (applyCreditResult(result)) {
          showError(result.error ?? "Gagal menyimpan data")
        } else {
          showError(result.error || "Gagal menyimpan data")
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <SalesCustomerFormShell
      onSubmit={handleSubmit(onSubmit)}
      control={control}
      name="customerId"
      options={customerOptions}
      onCustomerCreated={(created) => setCustomerOptions((prev) => [...prev, created])}
      error={errors.customerId?.message}
      submitId="submit-sales-invoice"
      isPending={isPending}
      isEditing={Boolean(invoice?.id)}
      formLabel={invoice?.id ? "Formulir ubah faktur" : "Formulir tambah faktur"}
      creditGatePanel={creditGatePanel}
      afterGrid={
        <>

      {/* Item faktur — nilai awal dari pesanan penjualan, tetap bisa diubah */}
      <div className="mt-6 pt-5 border-t border-default">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <h2 className="text-[0.9375rem] font-semibold text-foreground">Item Faktur</h2>
          <Button type="button" onPress={() => setRows((prev) => [...prev, newRow()])} id="tambah-baris-faktur">
            + Tambah Baris
          </Button>
        </div>

        {hasMixedScrapLines && (
          <Alert variant="warning" className="mb-3">
            <AlertCircle />
            <AlertTitle>Faktur campuran besi tua</AlertTitle>
            <AlertDescription>
              Faktur ini mencampur item besi tua dan barang dagang. Pisahkan ke faktur tersendiri — server menolak posting faktur campuran.
            </AlertDescription>
          </Alert>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada item. Tambahkan baris di sini, atau simpan dulu lalu isi di halaman detail.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-default">
                  <th className="py-2 pr-3 font-medium">Barang</th>
                  <th className="py-2 pr-3 font-medium w-24">Jml</th>
                  <th className="py-2 pr-3 font-medium w-36">Harga</th>
                  <th className="py-2 pr-3 font-medium w-32">Diskon</th>
                  <th className="py-2 pr-3 font-medium w-32 text-right">Total</th>
                  <th className="py-2 w-14" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.key} className="border-b border-default last:border-0 align-top">
                    <td className="py-2 pr-3">
                      <Combobox
                        id={`item-${row.key}`}
                        value={row.itemId ? String(row.itemId) : null}
                        onChange={(key) => {
                          const picked = key ? availableItems.find((a) => String(a.id) === key) : undefined
                          updateRow(row.key, {
                            itemId: picked ? picked.id : null,
                            // Harga dasar hanya mengisi bila baris belum punya harga,
                            // supaya nilai dari pesanan tidak tertimpa diam-diam.
                            unitPrice: row.unitPrice > 0 ? row.unitPrice : Number(picked?.price ?? 0),
                          })
                        }}
                        placeholder="Pilih barang..."
                        options={availableItems.map((a) => ({
                          value: String(a.id),
                          label: `${a.sku ? `${a.name} (${a.sku})` : a.name}${a.isScrapSaleItem ? " — Besi Tua" : ""}`,
                        }))}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <CurrencyInput
                        value={row.qty}
                        onChange={(val) => updateRow(row.key, { qty: Number(val) || 0 })}
                        aria-label={`Jumlah baris ${index + 1}`}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <CurrencyInput
                        value={row.unitPrice}
                        onChange={(val) => updateRow(row.key, { unitPrice: Number(val) || 0 })}
                        aria-label={`Harga satuan baris ${index + 1}`}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <CurrencyInput
                        value={row.discount}
                        onChange={(val) => updateRow(row.key, { discount: Number(val) || 0 })}
                        aria-label={`Diskon baris ${index + 1}`}
                      />
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(lineTotal(row))}</td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                        className="text-danger text-xs"
                        aria-label={`Hapus baris ${index + 1}`}
                      >
                        Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex flex-col items-end gap-1.5 text-sm">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums w-32 text-right">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex items-center gap-3">
            <Label htmlFor="taxRate">PPN (%)</Label>
            <CurrencyInput
              id="taxRate"
              value={taxRate}
              onChange={(val) => setTaxRate(Number(val) || 0)}
              className="w-24 text-right"
            />
            <span className="tabular-nums w-32 text-right">{formatCurrency(taxAmount)}</span>
          </div>
          <div className="flex items-center gap-3 font-semibold">
            <span>Total</span>
            <span className="tabular-nums w-32 text-right">{formatCurrency(grandTotal)}</span>
          </div>
        </div>
      </div>
        </>
      }
    >

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="salesOrderId">Pesanan Penjualan (Opsional)</Label>
          <Controller
            name="salesOrderId"
            control={control}
            render={({ field }) => (
              <Combobox
                id="salesOrderId"
                value={field.value ? String(field.value) : null}
                onChange={(key) => field.onChange(key ? Number(key) : undefined)}
                placeholder="Cari pesanan penjualan..."
                options={salesOrders.map((so) => ({ value: String(so.id), label: so.documentNo }))}
              />
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Tanggal"
            name="date"
            value={watch("date")}
            onChange={(val) => setValue("date", val)}
            required
          />
          {errors.date && <span className="text-xs text-danger mt-1">{errors.date.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <AppDatePicker
            label="Jatuh Tempo"
            name="dueDate"
            value={watch("dueDate")}
            onChange={(val) => setValue("dueDate", val)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="taxInvoiceNumber">Nomor Faktur Pajak (e-Faktur)</Label>
          <Input
            id="taxInvoiceNumber"
            {...register("taxInvoiceNumber")}
            placeholder="Nomor faktur pajak keluaran"
            maxLength={50}
          />
          {errors.taxInvoiceNumber && <span className="text-xs text-danger mt-1">{errors.taxInvoiceNumber.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5 col-span-full">
          <Label htmlFor="notes">Catatan</Label>
          <Textarea id="notes" {...register("notes")} rows={3} placeholder="Catatan untuk faktur ini..." />
        </div>
    </SalesCustomerFormShell>
  )
}
