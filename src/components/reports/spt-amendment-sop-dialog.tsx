"use client"

import { useState } from "react"
import { BookOpen } from "@/components/ui/fontawesome-icons"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/shadcn/dialog"

export function SptAmendmentSopDialog() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 sm:min-h-9 gap-1.5 print:hidden"
        >
          <BookOpen className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span>SOP Pembetulan SPT</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>SOP Pembetulan SPT (Skema Replace Coretax)</DialogTitle>
          <DialogDescription>
            Prosedur baku PER-12/PJ/2026 untuk pembetulan SPT Masa dan Tahunan tanpa merusak jejak audit pembukuan.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-foreground">
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="font-semibold text-foreground">1. Period Lock Tetap Terkunci</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Period lock tidak boleh dibuka untuk pembetulan SPT. Koreksi pembukuan selalu dicatat sebagai jurnal baru bertanggal periode berjalan, bukan mengedit atau menghapus jurnal lama.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="font-semibold text-foreground">2. Skema Replace (Masa &gt;= 2025, Lapor &gt;= 1 Okt 2026)</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sampaikan seluruh isi SPT masa versi terakhir secara utuh ke Coretax, bukan hanya baris selisihnya. Pastikan total DPP dan pajak pada data ekspor sama persis hingga sen (selisih Rp0,00) dengan PDF laporan masa terkait.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="font-semibold text-foreground">3. Catat BPE &amp; Saldo Kompensasi (Append-Only)</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Simpan nomor BPE, versi pembetulan, dan saldo kompensasi Coretax secara kronologis tanpa menimpa versi sebelumnya. Selisih buku vs Coretax dijelaskan pada catatan masa, bukan dipaksa sama dengan jurnal penyesuaian artifisial.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
