"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, useRef } from "react"
import { AppDatePicker } from "@/components/ui/date-picker"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Select, ComboBox, ListBox, Label } from "@heroui/react"
import { Upload, X, FileText } from "lucide-react"
import { SelectValue, SelectLabel, Input, TextArea } from "@/components/ui/heroui-compat"
import { CurrencyInput } from "@/components/ui/currency-input"
import { FormCard, FormSection, FormActions } from "@/components/ui/form-section"
import { Button } from "@/components/ui/page-header"

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
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function VendorPaymentForm({ vendors, bills, payment }: VendorPaymentFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0])
  const [vendorId, setVendorId] = useState("")
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
        showError(data.error || "Upload gagal")
      }
    } catch (err) {
      showError("Upload gagal: " + (err as Error).message)
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
        payment?.id ? await updateVendorPayment(payment.id, formData) : await createVendorPayment(formData)
        showSuccess(payment?.id ? "Data berhasil diupdate" : "Data berhasil ditambahkan")
        router.push("/purchase/vendor-payments")
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
            <ComboBox name="vendorId" selectedKey={vendorId || null} onSelectionChange={(key) => setVendorId(key ? String(key) : "")} className="w-full" isRequired>
              <Label>Vendor *</Label>
              <ComboBox.InputGroup><Input placeholder="Cari vendor..." /><ComboBox.Trigger /></ComboBox.InputGroup>
              <ComboBox.Popover>
                <ListBox>
                  {vendors.map((v) => (
                    <ListBox.Item key={v.id} id={String(v.id)} textValue={v.name}>{v.name}</ListBox.Item>
                  ))}
                </ListBox>
              </ComboBox.Popover>
            </ComboBox>
          </div>
          <div className="flex flex-col gap-1.5">
            <AppDatePicker label="Tanggal Bayar *" name="paymentDate" value={paymentDate} onChange={setPaymentDate} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Select name="paymentMethod" className="w-full" isRequired>
              <Label>Metode Pembayaran *</Label>
              <Select.Trigger><SelectValue placeholder="Pilih Metode" /><Select.Indicator /></Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="transfer" textValue="Transfer Bank">Transfer Bank<ListBox.ItemIndicator /></ListBox.Item>
                  <ListBox.Item id="cash" textValue="Tunai">Tunai<ListBox.ItemIndicator /></ListBox.Item>
                  <ListBox.Item id="giro" textValue="Giro">Giro<ListBox.ItemIndicator /></ListBox.Item>
                  <ListBox.Item id="cek" textValue="Cek">Cek<ListBox.ItemIndicator /></ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
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
            <TextArea id="notes" name="notes" rows={2} placeholder="Catatan pembayaran..." defaultValue={payment?.notes ?? ""} />
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
                          <img src={file.fileUrl} alt={file.originalName} className="form-attachment-thumb" />
                        ) : (
                          <FileText className="size-5 text-muted" />
                        )}
                      </div>
                      <div className="form-attachment-info">
                        <span className="form-attachment-name">{file.originalName}</span>
                        <span className="form-attachment-size">{formatFileSize(file.fileSize)}</span>
                      </div>
                      <Button onClick={() => handleRemoveFile(file.id)} className="form-attachment-remove" aria-label="Hapus">
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button
                type="button"
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-default transition-all"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="size-4" />
                {uploading ? "Mengupload..." : "Upload Bukti (JPG, PDF)"}
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
          <FormSection title="Bill Belum Lunas" columns={1}>
            <table className="w-full border-collapse" style={{ fontSize: "0.8125rem" }}>
              <thead><tr><th>No. Dokumen</th><th>Grand Total</th></tr></thead>
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
          <Button onClick={() => router.back()}>Batal</Button>
          <Button type="submit" variant="primary" disabled={isPending || uploading}>
            {isPending ? "Menyimpan..." : payment?.id ? "Update" : "Simpan"}
          </Button>
        </FormActions>
      </FormCard>
    </form>
  )
}
