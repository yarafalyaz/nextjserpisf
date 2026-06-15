"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { useState, useTransition, useRef } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Input } from "@/components/ui/shadcn/input"
import { Textarea } from "@/components/ui/shadcn/textarea"
import { Combobox } from "@/components/ui/combobox"
import { Upload, X, FileText } from "lucide-react"
import { CurrencyInput } from "@/components/ui/currency-input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"

interface UploadedFile {
  id: number
  originalName: string
  fileUrl: string
  mimeType: string
  fileSize: number
}

interface VendorPaymentFormProps {
  vendors: { id: number; name: string }[]
  payment?: { id: number; vendorId: number; amount: number; date: string; accountId?: number | null; notes?: string | null; referenceNumber?: string | null; bankAccount?: string | null }
  bills: { id: number; documentNo: string; vendorId: number; grandTotal: number }[]
  paymentMethods?: { code: string; name: string }[]
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function VendorPaymentForm({ vendors, bills, payment, paymentMethods = [] }: VendorPaymentFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [paymentDate, setPaymentDate] = useState(payment?.date || new Date().toISOString().split("T")[0])
  const [vendorId, setVendorId] = useState(payment?.vendorId ? String(payment.vendorId) : "")
  const [paymentMethod, setPaymentMethod] = useState("")
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const vendorBills = bills.filter((b) => b.vendorId === Number(vendorId))

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
            <Label htmlFor="vendorId">Pemasok *</Label>
            <Combobox
              id="vendorId"
              name="vendorId"
              options={vendors.map((v) => ({ value: String(v.id), label: v.name }))}
              value={vendorId || null}
              onChange={(key) => setVendorId(key ?? "")}
              placeholder="Cari pemasok..."
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
            <CurrencyInput id="amount" name="amount" placeholder="0" required defaultValue={payment?.amount} prefix="Rp" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bankAccount">No. Rekening</Label>
            <Input id="bankAccount" name="bankAccount" placeholder="No. rekening tujuan" defaultValue={payment?.bankAccount ?? ""} />
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
            <Label>Lampiran Bukti</Label>
            <div className="form-attachment-area">
              {uploadedFiles.length > 0 && (
                <div className="form-attachment-list">
                  {uploadedFiles.map((file) => (
                    <div key={file.id} className="form-attachment-item">
                      <div className="form-attachment-icon">
                        {file.mimeType.startsWith("image/") ? (
                          <Image
                            src={file.fileUrl}
                            alt={file.originalName}
                            width={40}
                            height={40}
                            className="form-attachment-thumb"
                            unoptimized
                          />
                        ) : (
                          <FileText className="size-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="form-attachment-info">
                        <span className="form-attachment-name">{file.originalName}</span>
                        <span className="form-attachment-size">{formatFileSize(file.fileSize)}</span>
                      </div>
                      <Button type="button" onPress={() => handleRemoveFile(file.id)} className="form-attachment-remove" aria-label="Hapus">
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button
                type="button"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-default transition-all"
                onPress={() => fileInputRef.current?.click()}
                isDisabled={uploading}
              >
                <Upload className="size-4" />
                {uploading ? "Mengunggah..." : "Unggah Bukti (JPG, PDF)"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          </div>
        </FormSection>

        {vendorId && vendorBills.length > 0 && (
          <FormSection title="Tagihan Belum Lunas" columns={1}>
            <table className="w-full border-collapse" style={{ fontSize: "0.8125rem" }}>
              <thead><tr><th>No. Dokumen</th><th>Total Keseluruhan</th></tr></thead>
              <tbody>
                {vendorBills.map((b) => (
                  <tr key={b.id}>
                    <td className="font-mono">{b.documentNo}</td>
                    <td className="text-right">{Number(b.grandTotal).toLocaleString("id-ID")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
