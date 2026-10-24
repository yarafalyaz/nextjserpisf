"use client"

import { useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Upload } from "lucide-react"
import { showError, showSuccess } from "@/lib/utils/toast"
import { apiErrorMessage } from "@/lib/utils/api-error-message"
import { Button } from "@/components/ui/button"
import { FormSelect } from "@/components/ui/form-select"
import { PHOTO_CATEGORIES, PHOTO_CATEGORY_LABEL } from "@/lib/reports/attachment-photo"

/**
 * F-2026-10-24-096-S: unggah foto berkategori persis induk yang dipilih.
 * Kategori tertutup BR-PHOTO-02 (dari builder backend); server menolak di
 * luar daftar. Sukses -> router.refresh() agar panel loader tampilkan baris
 * baru apa adanya (UI tidak menyusun ulang grup).
 */
export function PhotoUploadField({
  referenceType,
  referenceId,
  parentLabel,
}: Readonly<{
  referenceType: string
  referenceId: number
  parentLabel: string
}>) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const categoryId = useId()
  const [category, setCategory] = useState("other")
  const [uploading, setUploading] = useState(false)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if (!allowedTypes.includes(file.type)) {
      showError("Format file tidak didukung. Gunakan JPG, PNG, WebP, atau GIF.")
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
      formData.append("photoCategory", category)
      const res = await fetch("/api/upload/attachments", { method: "POST", body: formData })
      const data = await res.json()
      if (res.ok) {
        showSuccess("Foto berhasil diupload")
        router.refresh()
      } else {
        showError(apiErrorMessage(data, "Upload gagal"))
      }
    } catch (err) {
      showError("Upload gagal: " + (err as Error).message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor={categoryId} className="text-xs font-medium text-muted-foreground">
          Kategori foto — {parentLabel}
        </label>
        <FormSelect
          id={categoryId}
          value={category}
          onValueChange={setCategory}
          options={PHOTO_CATEGORIES.map((c) => ({ value: c, label: PHOTO_CATEGORY_LABEL[c] }))}
        />
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onPress={() => fileInputRef.current?.click()}
        isDisabled={uploading}
        aria-controls={inputId}
      >
        <Upload className="size-3" aria-hidden="true" />
        {uploading ? "Mengupload..." : "Upload Foto"}
      </Button>
      <input
        id={inputId}
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleUpload}
        className="sr-only"
        aria-label={`Pilih foto untuk ${parentLabel} (JPG, PNG, WebP, atau GIF, maksimal 10MB)`}
        tabIndex={-1}
      />
    </div>
  )
}
