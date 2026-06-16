"use client"

import { useId, useRef, useState } from "react"
import { FileText, Upload, X } from "lucide-react"
import { SafeImage } from "./safe-image"
import { showError } from "@/lib/utils/toast"
import { Label } from "@/components/ui/shadcn/label"
import { Button } from "@/components/ui/button"

interface UploadedFile {
  id: number
  originalName: string
  fileUrl: string
  mimeType: string
  fileSize: number
}

interface FormAttachmentUploadProps {
  referenceType: string
  label?: string
  onAttachmentsChange?: (ids: number[]) => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FormAttachmentUpload({ referenceType, label = "Lampiran Bukti", onAttachmentsChange }: FormAttachmentUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const labelId = useId()
  const fileInputId = `${labelId}-file`

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
      formData.append("referenceType", referenceType)
      formData.append("referenceId", "0")

      const res = await fetch("/api/upload/attachments", { method: "POST", body: formData })
      const data = await res.json()

      if (res.ok) {
        const newFiles = [...uploadedFiles, {
          id: data.id,
          originalName: data.originalName,
          fileUrl: data.fileUrl,
          mimeType: data.mimeType,
          fileSize: data.fileSize,
        }]
        setUploadedFiles(newFiles)
        onAttachmentsChange?.(newFiles.map((f) => f.id))
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
    const newFiles = uploadedFiles.filter((f) => f.id !== id)
    setUploadedFiles(newFiles)
    onAttachmentsChange?.(newFiles.map((f) => f.id))
    fetch(`/api/upload/attachments/${id}`, { method: "DELETE" }).catch(() => {})
  }

  return (
    <section aria-labelledby={labelId} className="flex flex-col gap-1.5 col-span-full">
      <Label id={labelId}>{label}</Label>
      <input type="hidden" name="attachmentIds" value={JSON.stringify(uploadedFiles.map((f) => f.id))} />
      <div
        role="status"
        aria-live="polite"
        aria-busy={uploading}
        className="sr-only"
      >
        {uploading ? `Mengunggah ${label}…` : ""}
      </div>
      <div className="form-attachment-area">
        {uploadedFiles.length > 0 && (
          <ul className="form-attachment-list">
            {uploadedFiles.map((file) => (
              <li key={file.id} className="form-attachment-item">
                <div className="form-attachment-icon" aria-hidden="true">
                  {file.mimeType.startsWith("image/") ? (
                    <SafeImage src={file.fileUrl} alt="" width={40} height={40} className="form-attachment-thumb" />
                  ) : (
                    <FileText className="size-5 text-muted-foreground" />
                  )}
                </div>
                <div className="form-attachment-info">
                  <span className="form-attachment-name">{file.originalName}</span>
                  <span className="form-attachment-size" aria-label={`Ukuran file ${formatFileSize(file.fileSize)}`}>
                    {formatFileSize(file.fileSize)}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="danger-soft"
                  size="sm"
                  isIconOnly
                  className="form-attachment-remove"
                  aria-label={`Hapus lampiran ${file.originalName}`}
                  onPress={() => handleRemoveFile(file.id)}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="form-attachment-upload-btn"
          onPress={() => fileInputRef.current?.click()}
          isDisabled={uploading}
          aria-controls={fileInputId}
        >
          <Upload className="size-4" aria-hidden="true" />
          {uploading ? "Mengupload..." : "Upload Bukti (JPG, PDF)"}
        </Button>
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          onChange={handleFileUpload}
          aria-label={label}
          tabIndex={-1}
          className="sr-only"
        />
      </div>
    </section>
  )
}
