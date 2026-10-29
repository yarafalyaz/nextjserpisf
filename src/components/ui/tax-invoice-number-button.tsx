"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileCheck2 } from "lucide-react"
import { Button } from "@/components/ui/shadcn/button"
import { Input } from "@/components/ui/shadcn/input"
import { Label } from "@/components/ui/shadcn/label"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { showSuccess, showError } from "@/lib/utils/toast"

/**
 * F-2026-10-28-157-V Putusan 2 — isi nomor faktur pajak pasca-posting.
 * Dialog + input: server pemilik validasi (fail-closed, pesan Indonesia).
 * UI hanya cermin: trim, nomor wajib non-kosong sebelum kirim.
 */
export function TaxInvoiceNumberButton({
  id,
  action,
  label = "Isi Nomor Faktur",
  title = "Isi nomor faktur pajak?",
  body = "Nomor valid memecah PPN keluar dari HPP menjadi PPN Masukan lewat jurnal ulang. Pastikan nomor dari pemasok sudah benar.",
  successMessage = "Nomor faktur pajak berhasil diisi",
}: {
  id: number
  action: (id: number, formData: FormData) => Promise<{ success: boolean; error?: string }>
  label?: string
  title?: string
  body?: string
  successMessage?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)
  const [value, setValue] = useState("")

  function handleConfirm() {
    if (!value.trim()) {
      showError("Nomor faktur pajak wajib diisi")
      return
    }
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("taxInvoiceNumber", value.trim())
        const result = await action(id, formData)
        if (result && result.success === false) {
          showError(result.error || "Gagal mengisi nomor faktur pajak")
          setIsOpen(false)
          return
        }
        showSuccess(successMessage)
        setIsOpen(false)
        setValue("")
        router.refresh()
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) {
          throw e
        }
        showError(e instanceof Error ? e.message : "Gagal mengisi nomor faktur pajak")
        setIsOpen(false)
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 min-w-11"
        onClick={() => setIsOpen(true)}
        disabled={isPending}
        aria-label="Isi nomor faktur pajak"
      >
        <FileCheck2 size={15} className="mr-1.5" aria-hidden="true" />
        {label}
      </Button>

      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={(open) => { if (!open) setValue(""); setIsOpen(open) }}
        title={title}
        confirmLabel={label}
        cancelLabel="Kembali"
        variant="accent"
        isPending={isPending}
        onConfirm={handleConfirm}
      >
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-muted-foreground">{body}</p>
          <Label htmlFor={`tax-invoice-number-${id}`}>Nomor Faktur Pajak</Label>
          <Input
            id={`tax-invoice-number-${id}`}
            name="taxInvoiceNumber"
            placeholder="Nomor faktur pajak masukan dari pemasok"
            maxLength={50}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={isPending}
          />
        </div>
      </ConfirmDialog>
    </>
  )
}
