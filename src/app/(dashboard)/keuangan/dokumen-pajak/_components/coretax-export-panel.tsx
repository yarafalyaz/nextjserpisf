"use client"

import { useState, useTransition } from "react"

import { exportCoretaxOutputXmlAction } from "@/actions/tax-documents.actions"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/shadcn/label"
import { showError, showSuccess } from "@/lib/utils/toast"
import type { TaxOption } from "./tax-doc-submit"

type ExportResult = Extract<Awaited<ReturnType<typeof exportCoretaxOutputXmlAction>>, { success: true }>

/**
 * Ekspor XML Coretax faktur keluaran (F-2026-10-23-113-V, konsumen t_4cba1a22).
 *
 * Pilih faktur keluaran terbit → panggil action existing apa adanya →
 * unduh `xml` sebagai berkas .xml bila non-null. Label hasil (`readyLabel`,
 * `fileCreatedLabel`) dan alasan `rejections` tampil verbatim dari server —
 * UI tidak membentuk elemen XML, tidak hitung ulang, tidak mengklaim
 * terkirim/terdaftar/disetujui DJP (status DJP hanya dari bukti Coretax).
 */
export function CoretaxExportPanel({ invoices }: { invoices: TaxOption[] }) {
  const [selected, setSelected] = useState<string[]>([])
  const [result, setResult] = useState<ExportResult | null>(null)
  const [isPending, startTransition] = useTransition()

  if (invoices.length === 0) return null

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((v) => v !== id)))
  }

  function handleExport() {
    const formData = new FormData()
    formData.set("taxInvoiceIds", selected.join(","))
    startTransition(async () => {
      try {
        const res = await exportCoretaxOutputXmlAction(formData)
        if (!res.success) {
          showError(res.error || "Gagal mengekspor XML Coretax")
          return
        }
        setResult(res)
        if (res.xml) {
          const blob = new Blob([res.xml], { type: "application/xml" })
          const url = URL.createObjectURL(blob)
          const link = document.createElement("a")
          link.href = url
          link.download = "coretax-faktur-keluaran.xml"
          link.click()
          URL.revokeObjectURL(url)
          if (res.fileCreatedLabel) showSuccess(res.fileCreatedLabel)
        }
      } catch (error) {
        showError(error instanceof Error ? error.message : "Gagal mengekspor XML Coretax")
      }
    })
  }

  return (
    <section aria-label="Ekspor XML Coretax faktur keluaran" className="bg-surface rounded-xl border border-default shadow-sm p-6">
      <h2 className="text-base font-semibold text-foreground">Ekspor XML Coretax Faktur Keluaran</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Pilih faktur keluaran terbit, lalu bentuk berkas XML untuk impor Coretax. Berkas yang terbentuk bukan bukti terkirim atau disetujui DJP — status DJP hanya dari bukti Coretax.
      </p>
      <fieldset className="mt-4 flex flex-col gap-2" disabled={isPending}>
        <legend className="text-sm font-medium text-foreground">Faktur Pajak Keluaran</legend>
        {invoices.map((inv) => {
          const inputId = `coretax-export-${inv.value}`
          return (
            <div key={inv.value} className="flex min-h-11 items-center gap-2">
              <input
                id={inputId}
                type="checkbox"
                checked={selected.includes(inv.value)}
                onChange={(e) => toggle(inv.value, e.target.checked)}
                className="size-4 shrink-0"
              />
              <Label htmlFor={inputId} className="font-normal">{inv.label}</Label>
            </div>
          )
        })}
      </fieldset>
      <div className="mt-4">
        <Button type="button" isDisabled={isPending || selected.length === 0} onClick={handleExport}>
          {isPending ? "Membentuk XML…" : "Bentuk & Unduh XML Coretax"}
        </Button>
      </div>
      {result && (
        <div className="mt-5 flex flex-col gap-3" aria-live="polite">
          <p className="text-sm font-medium text-foreground">{result.readyLabel}</p>
          {result.fileCreatedLabel && <p className="text-sm text-muted-foreground">{result.fileCreatedLabel}</p>}
          {result.exportedIds.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Faktur masuk berkas: {result.exportedIds.map((id) => `#${id}`).join(", ")}
              {result.templateVersion ? ` · Versi template: ${result.templateVersion}` : ""}
            </p>
          )}
          {result.rejections.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground">Faktur tertolak ekspor</h3>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                {result.rejections.map((r) => (
                  <li key={`${r.taxInvoiceId}-${r.code}`}>
                    Faktur #{r.taxInvoiceId} ({r.code}): {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
