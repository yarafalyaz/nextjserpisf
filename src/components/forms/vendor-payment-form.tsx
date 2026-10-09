"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState, useTransition, useRef, useId } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { QuickAddSelect } from "@/components/ui/quick-add-select"
import { QUICK_ADD } from "@/lib/quick-add/registry"
import { Upload, X, FileText } from "lucide-react"
import { CurrencyInput } from "@/components/ui/currency-input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"
import { toLocalDateOnly } from "@/lib/utils/date-only"

interface UploadedFile {
  id: number
  originalName: string
  fileUrl: string
  mimeType: string
  fileSize: number
}

interface VendorPaymentFormProps {
  vendors: { id: number; name: string }[]
  payment?: { id: number; vendorId: number; amount: number; date: string; accountId?: number | null; notes?: string | null; referenceNumber?: string | null; bankAccount?: string | null; adminFee?: number | null; vendorBillId?: number | null }
  bills: { id: number; documentNo: string; vendorId: number; grandTotal: number; balanceDue?: number }[]
  paymentMethods?: { code: string; name: string }[]
  /** Tagihan yang ditargetkan (dari tombol "Bayar" di halaman tagihan). */
  preselectedBillId?: number | null
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function VendorPaymentForm({ vendors, bills, payment, paymentMethods = [], preselectedBillId = null }: VendorPaymentFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // Tagihan yang sedang ditargetkan: dari tombol "Bayar" (preselected) atau dari
  // pembayaran yang sedang diubah. Dipakai untuk menampilkan kartu ringkasan &
  // mengisi otomatis jumlah = sisa tagihan.
  const [targetBillId, setTargetBillId] = useState<string | null>(
    (payment?.vendorBillId ?? preselectedBillId) ? String(payment?.vendorBillId ?? preselectedBillId) : null,
  )
  const [paymentDate, setPaymentDate] = useState(payment?.date || toLocalDateOnly(new Date()))
  const [vendorId, setVendorId] = useState(
    payment?.vendorId
      ? String(payment.vendorId)
      : (preselectedBillId ? String(bills.find((b) => b.id === preselectedBillId)?.vendorId ?? "") : ""),
  )
  const [vendorOptions, setVendorOptions] = useState(vendors)
  const [paymentMethod, setPaymentMethod] = useState("")
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const labelId = useId()
  const fileInputId = `${labelId}-file`

  const vendorBills = bills.filter((b) => b.vendorId === Number(vendorId))
  const targetBill = targetBillId ? bills.find((b) => b.id === Number(targetBillId)) : null
  const targetDue = targetBill ? Number(targetBill.balanceDue ?? targetBill.grandTotal) : 0

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]
    if (!allowedTypes.includes(file.type)) {
      showError("Format file tidak didukung. Gunakan JPG, PNG, WebP, GIF, atau PDF.")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      showError("Ukuran file maksimal 10MB")
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("referenceType", "vendor_payment")
      formData.append("referenceId", "0")

      const res = await fetch("/api/upload/attachments", { method: "POST", body: formData })
      const data = await res.json()

      if (res.ok) {
        setUploadedFiles((prev) => [...prev, {
          id: data.id,
          originalName: data.originalName,
          fileUrl: data.fileUrl,
          mimeType: data.mimeType,
          fileSize: data.fileSize}])
      } else {
        showError(data.error || "Unggahan gagal")
      }
    } catch (err) {
      showError("Unggahan gagal: " + (err as Error).message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function handleRemoveFile(id: number) {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id))
    fetch(`/api/upload/attachments/${id}`, { method: "DELETE" }).catch(() => {})
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const formData = new FormData(e.currentTarget)
        if (targetBillId) formData.set("vendorBillId", targetBillId)
        if (uploadedFiles.length > 0) {
          formData.set("attachmentIds", JSON.stringify(uploadedFiles.map((f) => f.id)))
        }
        const { createVendorPayment, updateVendorPayment } = await import("@/actions/purchase.actions")
        const result = payment?.id ? await updateVendorPayment(payment.id, formData) : await createVendorPayment(formData)
        if (result && !result.success) { showError(result.error || "Gagal menyimpan data"); return }
        showSuccess(payment?.id ? "Data berhasil diperbarui" : "Data berhasil ditambahkan")
        router.push("/pembelian/pembayaran-vendor")
        router.refresh()
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal menyimpan data")
      }
    })
  }

  return (
    <form onSubmit={onSubmit}>
      <FormCard>
        <FormSection title="Informasi Umum">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendorId">Vendor *</Label>
            <QuickAddSelect
              id="vendorId"
              name="vendorId"
              options={vendorOptions.map((v) => ({ value: String(v.id), label: v.name }))}
              value={vendorId || null}
              onChange={(key) => setVendorId(key ?? "")}
              placeholder="Cari vendor..."
              title={QUICK_ADD.vendor.title}
              fields={QUICK_ADD.vendor.fields}
              action={QUICK_ADD.vendor.action}
              onCreated={(created) => {
                setVendorOptions((prev) => [...prev, { id: created.id, name: created.label }])
                setVendorId(String(created.id))
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker label="Tanggal Bayar *" name="paymentDate" value={paymentDate} onChange={setPaymentDate} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="paymentMethod">Metode Pembayaran *</Label>
            <Combobox
              id="paymentMethod"
              name="paymentMethod"
              value={paymentMethod || null}
              onChange={(v) => setPaymentMethod(v ?? "")}
              placeholder="Pilih / ketik metode..."
              options={(paymentMethods.length > 0
                ? paymentMethods
                : [{ code: "transfer", name: "Transfer Bank" }, { code: "cash", name: "Tunai" }]
              ).map((m) => ({ value: m.code, label: m.name }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="referenceNumber">No. Referensi</Label>
            <Input id="referenceNumber" name="referenceNumber" placeholder="No. referensi pembayaran" defaultValue={payment?.referenceNumber ?? ""} />
          </div>
        </FormSection>

        <FormSection title="Keuangan">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">Jumlah (Rp) *</Label>
            <CurrencyInput id="amount" name="amount" placeholder="0" required defaultValue={payment?.amount ?? (targetBill ? targetDue : undefined)} prefix="Rp" />
            {targetBill && !payment?.id && (
              <p className="text-xs text-muted-foreground">
                Otomatis diisi sisa tagihan. Ubah bila bayar sebagian.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bankAccount">No. Rekening</Label>
            <Input id="bankAccount" name="bankAccount" placeholder="No. rekening tujuan" defaultValue={payment?.bankAccount ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adminFee">Biaya Admin Bank (Rp)</Label>
            <CurrencyInput id="adminFee" name="adminFee" placeholder="0" defaultValue={payment?.adminFee} prefix="Rp" />
            <p className="text-xs text-muted-foreground">
              Biaya admin/transfer saat bayar. Dibukukan sebagai Beban Admin Bank,
              di luar jumlah pelunasan tagihan.
            </p>
          </div>
          <input type="hidden" name="status" value="draft" />
        </FormSection>

        <FormSection title="Lainnya" columns={1}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Catatan</Label>
            <Textarea id="notes" name="notes" rows={2} placeholder="Catatan pembayaran..." defaultValue={payment?.notes ?? ""} />
          </div>

          {/* Attachment Upload */}
          <div className="flex flex-col gap-1.5">
            <Label id={labelId}>Lampiran Bukti</Label>
            <div role="status" aria-live="polite" aria-busy={uploading} className="sr-only">
              {uploading ? "Mengunggah Lampiran Bukti…" : ""}
            </div>
            <div className="form-attachment-area">
              {uploadedFiles.length > 0 && (
                <ul className="form-attachment-list">
                  {uploadedFiles.map((file) => (
                    <li key={file.id} className="form-attachment-item">
                      <div className="form-attachment-icon" aria-hidden="true">
                        {file.mimeType.startsWith("image/") ? (
                          <Image
                            src={file.fileUrl}
                            alt=""
                            width={40}
                            height={40}
                            className="form-attachment-thumb"
                            unoptimized
                          />
                        ) : (
                          <FileText className="size-5 text-muted-foreground" aria-hidden="true" />
                        )}
                      </div>
                      <div className="form-attachment-info">
                        <span className="form-attachment-name">{file.originalName}</span>
                        <span className="form-attachment-size" aria-label={`Ukuran file ${formatFileSize(file.fileSize)}`}>
                          {formatFileSize(file.fileSize)}
                        </span>
                      </div>
                      <Button type="button" isIconOnly variant="danger-soft" size="sm" className="form-attachment-remove" aria-label={`Hapus lampiran ${file.originalName}`} onPress={() => handleRemoveFile(file.id)}>
                        <X className="size-4" aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                type="button"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-default transition-all"
                onPress={() => fileInputRef.current?.click()}
                isDisabled={uploading}
                aria-controls={fileInputId}
              >
                <Upload className="size-4" aria-hidden="true" />
                {uploading ? "Mengunggah..." : "Unggah Bukti (JPG, PDF)"}
              </Button>
              <input
                ref={fileInputRef}
                id={fileInputId}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                onChange={handleFileUpload}
                aria-label="Lampiran Bukti"
                tabIndex={-1}
                className="sr-only"
              />
            </div>
          </div>
        </FormSection>

        {vendorId && vendorBills.length > 0 && (
          <FormSection title="Tagihan yang Dibayar" columns={1}>
            {targetBill ? (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">Tagihan</span>
                    <span className="font-mono text-sm font-medium text-foreground">{targetBill.documentNo}</span>
                  </div>
                  <div className="flex flex-col text-right">
                    <span className="text-xs text-muted-foreground">Sisa Tagihan</span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {targetDue.toLocaleString("id-ID")}
                    </span>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Pembayaran akan dialokasikan ke tagihan ini. Boleh dibayar sebagian —
                  sisanya tetap tercatat sebagai utang.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Belum dipilih tagihan. Pembayaran akan otomatis dialokasikan ke tagihan
                tertua vendor ini saat dikonfirmasi.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="targetBill">Pilih Tagihan (opsional)</Label>
              <Combobox
                id="targetBill"
                options={vendorBills.map((b) => ({
                  value: String(b.id),
                  label: `${b.documentNo} — sisa ${Number(b.balanceDue ?? b.grandTotal).toLocaleString("id-ID")}`,
                }))}
                value={targetBillId}
                onChange={setTargetBillId}
                placeholder="Auto (tertua dulu)..."
              />
              <p className="text-xs text-muted-foreground">
                Kosongkan untuk alokasi otomatis (tagihan tertua dulu).
              </p>
            </div>
          </FormSection>
        )}

        <FormActions>
          <Button type="button" onPress={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" isDisabled={isPending || uploading}>
            {isPending ? "Menyimpan..." : payment?.id ? "Perbarui" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
