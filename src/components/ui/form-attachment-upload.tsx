"use client"

import { useState, useRef } from "react"
import { Upload, X, FileText } from "lucide-react"
import { showError } from "@/lib/utils/toast"
import { Label } from "@heroui/react"

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
    <div className="flex flex-col gap-1.5 col-span-full">
      <Label>{label}</Label>
      <input type="hidden" name="attachmentIds" value={JSON.stringify(uploadedFiles.map((f) => f.id))} />
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
                <button type="button" onClick={() => handleRemoveFile(file.id)} className="form-attachment-remove" aria-label="Hapus">
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all form-attachment-upload-"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="size-4" />
          {uploading ? "Mengupload..." : "Upload Bukti (JPG, PDF)"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>
    </div>
  )
}
