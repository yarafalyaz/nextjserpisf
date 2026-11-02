"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, useTransition } from "react"
import { importBankStatementLines } from "@/actions/finance.actions"
import { showSuccess, showError } from "@/lib/utils/toast"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/shadcn/label"

// Import CSV rekening koran: berkas .csv ATAU tempel isi CSV. Action atomik —
// satu baris rusak menolak seluruh import dan daftar error per nomor baris
// tampil di sini; tidak ada baris yang tertulis separuh.
export function BankStatementImportForm({
  bankStatementId,
  baseHref,
}: {
  bankStatementId: number
  baseHref: string
}) {
  const router = useRouter()
  // Idempotency: key stabil per intent impor; retry jaringan memakai key
  // yang sama (ditolak server), sukses merotasi untuk berkas berikutnya.
  const idempotencyKeyRef = useRef<string | null>(null)
  if (idempotencyKeyRef.current === null) idempotencyKeyRef.current = crypto.randomUUID()
  const [isPending, startTransition] = useTransition()
  const [rowErrors, setRowErrors] = useState<{ row: number; message: string }[]>([])

  function onSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setRowErrors([])
    startTransition(async () => {
      const fd = new FormData(form)
      fd.set("idempotencyKey", idempotencyKeyRef.current!)
      const res = await importBankStatementLines(fd)
      if (!res.success) {
        showError(res.error || "Gagal mengimpor rekening koran")
        if ("rowErrors" in res && res.rowErrors) setRowErrors(res.rowErrors)
        return
      }
      idempotencyKeyRef.current = crypto.randomUUID()
      showSuccess(`${res.imported} baris rekening koran diimpor`)
      router.push(baseHref)
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" aria-label="Import CSV rekening koran">
      <input type="hidden" name="bankStatementId" value={bankStatementId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="csvFile">Berkas CSV</Label>
        <input
          id="csvFile"
          name="file"
          type="file"
          accept=".csv,text/csv"
          className="text-sm text-foreground"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="csvText">atau tempel isi CSV</Label>
        <textarea
          id="csvText"
          name="csvText"
          rows={8}
          placeholder={"Tanggal;Keterangan;Debit;Kredit;Referensi\n2026-10-01;Transfer masuk;1500000;0;TRF-1"}
          className="rounded-lg border border-default bg-surface px-3 py-2 font-mono text-xs text-foreground"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Header wajib: tanggal + (debit &amp; kredit) atau satu kolom nominal bertanda (positif = debit).
        Tanggal YYYY-MM-DD atau DD/MM/YYYY. Satu baris rusak menolak seluruh import — tidak ada baris
        yang tertulis separuh.
      </p>
      {rowErrors.length > 0 ? (
        <div className="rounded-lg border border-default p-3">
          <p className="text-sm font-medium text-foreground">Baris bermasalah:</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
            {rowErrors.map((error) => (
              <li key={error.row}>
                Baris {error.row}: {error.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" isDisabled={isPending}>
          {isPending ? "Mengimpor..." : "Import"}
        </Button>
        <Button type="button" onPress={() => router.push(baseHref)}>
          Batal
        </Button>
      </div>
    </form>
  )
}
