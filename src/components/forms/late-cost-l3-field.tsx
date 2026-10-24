"use client";

import { Label } from "@/components/ui/shadcn/label";
import { Input } from "@/components/ui/shadcn/input";
import { Textarea } from "@/components/ui/shadcn/textarea";

/**
 * F-2026-10-24-133-V jalur L3 (biaya telat NON-JOB sesudah WO closed).
 * Frasa penanda baku SATU sumber kebenaran di server:
 * src/lib/services/late-cost-l3.service.ts (L3_MARKER/formatL3Tag/parseL3Tag).
 * Modul server itu mengimpor Prisma sehingga tidak bisa diimpor komponen
 * client; frasa di bawah menduplikasinya PERSIS dan dijaga tes paritas
 * terhadap berkas server (late-cost-l3-field.test.tsx). Jangan parafrase.
 * UI hanya menyusun frasa ke notes/description — server pemilik vonis akhir
 * (WO closed, alasan, akun); error server tampil verbatim pemanggil.
 */
// ponytail: duplikasi frasa persis + tes paritas; satukan bila server mengekspor modul penanda murni tanpa Prisma.
export const L3_MARKER_UI = "BIAYA TELAT NON-JOB L3";

export function formatL3TagClient(workOrderNo: string, reason: string): string {
  return `${L3_MARKER_UI} | WO: ${workOrderNo} | Alasan: ${reason}`;
}

const L3_LINE_RE =
  /^BIAYA TELAT NON-JOB L3\s*\|\s*WO:\s*(\S+)\s*\|\s*Alasan:\s*(.*)$/m;

export function parseL3TagClient(
  text: string | null | undefined,
): { workOrderNo: string; reason: string } | null {
  if (!text) return null;
  const m = L3_LINE_RE.exec(text);
  if (!m) return null;
  return { workOrderNo: m[1].trim(), reason: m[2].trim() };
}

/** Ganti baris penanda L3 pertama (atau sisipkan di baris pertama); teks lain operator dipertahankan. */
export function upsertL3Tag(
  text: string,
  workOrderNo: string,
  reason: string,
): string {
  const line = formatL3TagClient(workOrderNo.trim(), reason.trim());
  return L3_LINE_RE.test(text)
    ? text.replace(L3_LINE_RE, line)
    : text
      ? `${line}\n${text}`
      : line;
}

/** Hapus baris penanda L3; teks lain operator dipertahankan. */
export function removeL3Tag(text: string): string {
  return text.replace(/^BIAYA TELAT NON-JOB L3\s*\|.*(?:\n|$)/m, "");
}

interface LateCostL3FieldProps {
  /** id unik per form (notes di VendorBill, description di Expense). */
  idPrefix: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  workOrderNo: string;
  onWorkOrderNoChange: (value: string) => void;
  reason: string;
  onReasonChange: (value: string) => void;
}

export function LateCostL3Field({
  idPrefix,
  enabled,
  onEnabledChange,
  workOrderNo,
  onWorkOrderNoChange,
  reason,
  onReasonChange,
}: LateCostL3FieldProps) {
  const woId = `${idPrefix}-l3-work-order-no`;
  const reasonId = `${idPrefix}-l3-reason`;
  const missingWo = enabled && !workOrderNo.trim();
  const missingReason = enabled && !reason.trim();
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={`${idPrefix}-l3-enabled`}
        className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
      >
        <input
          id={`${idPrefix}-l3-enabled`}
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          className="size-4 rounded border-default"
        />
        Biaya telat non-job (L3) — WO sudah ditutup
      </label>
      {enabled ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={woId}>
              Nomor WO yang sudah ditutup{" "}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <Input
              id={woId}
              value={workOrderNo}
              onChange={(e) => onWorkOrderNoChange(e.target.value)}
              placeholder="mis. WO-0007"
              required
              aria-invalid={missingWo || undefined}
              aria-describedby={missingWo ? `${woId}-error` : undefined}
            />
            {missingWo ? (
              <span id={`${woId}-error`} role="alert" className="text-xs text-danger">
                Nomor WO wajib diisi untuk penanda L3.
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={reasonId}>
              Alasan bukan biaya job{" "}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <Textarea
              id={reasonId}
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              rows={2}
              placeholder="Alasan biaya ini bukan biaya job…"
              required
              aria-invalid={missingReason || undefined}
              aria-describedby={missingReason ? `${reasonId}-error` : undefined}
            />
            {missingReason ? (
              <span id={`${reasonId}-error`} role="alert" className="text-xs text-danger">
                Alasan wajib diisi untuk penanda L3.
              </span>
            ) : null}
          </div>
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
            Biaya ini dicatat sebagai beban periode berjalan, bukan biaya job —
            tidak mengubah margin atau total biaya WO. Tagihan L3 tidak boleh
            tertaut PO/penerimaan; pengeluaran L3 wajib akun beban operasional.
          </p>
        </div>
      ) : null}
    </div>
  );
}
