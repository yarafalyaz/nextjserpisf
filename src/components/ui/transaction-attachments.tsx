"use client"

import { useCallback, useState, useEffect, useRef } from "react"
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
    <div className="attachment-section">
      <div className="attachment-header">
        <h3 className="attachment-title">
          <FileText className="size-4" />
          Bukti / Lampiran
        </h3>
        <Button
          type="button"
          variant="secondary" size="sm"
          onPress={() => fileInputRef.current?.click()}
          isDisabled={uploading}
        >
          <Upload className="size-3" />
          {uploading ? "Mengupload..." : "Upload Bukti"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {loading ? (
        <div className="attachment-loading">Memuat lampiran...</div>
      ) : attachments.length === 0 ? (
        <div className="attachment-empty">
          <FileText className="size-8 text-muted-foreground" />
          <span>Belum ada lampiran bukti</span>
        </div>
      ) : (
        <div className="attachment-grid">
          {attachments.map((att) => (
            <div key={att.id} className="attachment-card">
              {isImage(att.mimeType) ? (
                <a href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="attachment-preview">
                  <SafeImage src={att.fileUrl} alt={att.originalName} width={96} height={96} className="attachment-img" />
                </a>
              ) : (
                <a href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="attachment-preview attachment-file">
                  <FileText className="size-8" />
                  <span className="text-xs font-medium">PDF</span>
                </a>
              )}
              <div className="attachment-info">
                <span className="attachment-name" title={att.originalName}>{att.originalName}</span>
                <span className="attachment-size">{formatFileSize(att.fileSize)}</span>
              </div>
              <div className="attachment-actions">
                <a href={att.fileUrl} target="_blank" rel="noopener noreferrer" className="button button--secondary button--sm attachment-action-link" title="Unduh">
                  <Download className="size-3.5" />
                </a>
                <Button onPress={() => handleDeleteClick(att.id)} variant="danger-soft" size="sm" className="attachment-action-button" title="Hapus">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
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
    </div>
  )
}
