"use client"

import { useCallback, useState, useEffect, useRef, useId } from "react"
import { Upload, FileText, Download, Trash2 } from "lucide-react"
import { showSuccess, showError } from "@/lib/utils/toast"
import { SafeImage } from "./safe-image"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface Attachment {
  id: number
  filename: string
  originalName: string
  fileUrl: string
  fileSize: number
  mimeType: string
  createdAt: string
}

interface TransactionAttachmentsProps {
  referenceType: string
  referenceId: number
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/")
}

export function TransactionAttachments({ referenceType, referenceId }: TransactionAttachmentsProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const headingId = useId()
  const fileInputId = useId()

  const fetchAttachments = useCallback(async () => {
    try {
      const res = await fetch(`/api/upload/attachments?tipeReferensi=${referenceType}&referensiId=${referenceId}`)
      if (res.ok) {
        const data = await res.json()
        setAttachments(data)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [referenceId, referenceType])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchAttachments()
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [fetchAttachments])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
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
      formData.append("referenceType", referenceType)
      formData.append("referenceId", String(referenceId))

      const res = await fetch("/api/upload/attachments", { method: "POST", body: formData })
      const data = await res.json()

      if (res.ok) {
        setAttachments((prev) => [data, ...prev])
        showSuccess("Bukti berhasil diupload")
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

  function handleDeleteClick(id: number) {
    setPendingDeleteId(id)
    setConfirmOpen(true)
  }

  async function executeDelete() {
    if (!pendingDeleteId) return
    const id = pendingDeleteId
    setConfirmOpen(false)

    try {
      const res = await fetch(`/api/upload/attachments/${id}`, { method: "DELETE" })
      if (res.ok) {
        setAttachments((prev) => prev.filter((a) => a.id !== id))
        showSuccess("Lampiran dihapus")
      } else {
        showError("Gagal menghapus lampiran")
      }
    } catch {
      showError("Gagal menghapus lampiran")
    }
  }

  return (
    <section className="attachment-section" aria-labelledby={headingId}>
      <div className="attachment-header">
        <h3 id={headingId} className="attachment-title">
          <FileText className="size-4" aria-hidden="true" />
          Bukti / Lampiran
        </h3>
        <Button
          type="button"
          variant="secondary" size="sm"
          onPress={() => fileInputRef.current?.click()}
          isDisabled={uploading}
          aria-controls={fileInputId}
        >
          <Upload className="size-3" aria-hidden="true" />
          {uploading ? "Mengupload..." : "Upload Bukti"}
        </Button>
        <input
          id={fileInputId}
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          onChange={handleUpload}
          className="sr-only"
          aria-label="Pilih file bukti atau lampiran (JPG, PNG, WebP, GIF, atau PDF, maksimal 10MB)"
          tabIndex={-1}
        />
      </div>

      <div role="status" aria-live="polite" aria-busy={loading} className="sr-only">
        {loading
          ? "Memuat lampiran"
          : `${attachments.length} lampiran tersedia`}
      </div>

      {loading ? (
        <div className="attachment-loading" aria-hidden="true">Memuat lampiran...</div>
      ) : attachments.length === 0 ? (
        <div className="attachment-empty" role="status">
          <FileText className="size-8 text-muted-foreground" aria-hidden="true" />
          <span>Belum ada lampiran bukti</span>
        </div>
      ) : (
        <ul
          className="attachment-grid"
          aria-label={`Daftar ${attachments.length} lampiran bukti`}
        >
          {attachments.map((att) => (
            <li key={att.id} className="attachment-card">
              {isImage(att.mimeType) ? (
                <a
                  href={att.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="attachment-preview"
                  aria-label={`Buka pratinjau gambar ${att.originalName} di tab baru`}
                >
                  <SafeImage src={att.fileUrl} alt="" role="presentation" width={96} height={96} className="attachment-img" />
                </a>
              ) : (
                <a
                  href={att.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="attachment-preview attachment-file"
                  aria-label={`Buka pratinjau PDF ${att.originalName} di tab baru`}
                >
                  <FileText className="size-8" aria-hidden="true" />
                  <span className="text-xs font-medium" aria-hidden="true">PDF</span>
                </a>
              )}
              <div className="attachment-info">
                <span className="attachment-name" title={att.originalName}>{att.originalName}</span>
                <span className="attachment-size" aria-label={`Ukuran file ${formatFileSize(att.fileSize)}`}>
                  {formatFileSize(att.fileSize)}
                </span>
              </div>
              <div className="attachment-actions">
                <a
                  href={att.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="button button--secondary button--sm attachment-action-link"
                  aria-label={`Unduh ${att.originalName}`}
                  title="Unduh"
                >
                  <Download className="size-3.5" aria-hidden="true" />
                </a>
                <Button
                  onPress={() => handleDeleteClick(att.id)}
                  variant="danger-soft"
                  size="sm"
                  className="attachment-action-button"
                  aria-label={`Hapus lampiran ${att.originalName}`}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Hapus lampiran?"
        body="Lampiran yang dihapus tidak dapat dikembalikan. Lanjutkan?"
        confirmLabel="Hapus"
        cancelLabel="Batal"
        variant="danger"
        onConfirm={executeDelete}
      />
    </section>
  )
}
