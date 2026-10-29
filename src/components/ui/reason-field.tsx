"use client"

import { Textarea } from "@/components/ui/shadcn/textarea"

/**
 * Kolom alasan wajib-trim bersama untuk tombol konfirmasi destruktif
 * (VoidButton, ReversePaymentButton). Satu sumber: label, placeholder,
 * dan catatan jejak audit — bukan salinan per tombol.
 */
export function ReasonField({
  id,
  value,
  onChange,
  disabled,
  label,
  placeholder,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  label: string
  placeholder: string
}) {
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label} <span aria-hidden="true" className="text-danger">*</span>
      </label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        rows={3}
        disabled={disabled}
      />
      <p className="text-xs text-muted-foreground">
        Alasan wajib diisi dan tersimpan sebagai jejak audit.
      </p>
    </div>
  )
}
