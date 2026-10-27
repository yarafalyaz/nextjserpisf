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

// Pemisah baris JS yang sama dengan yang dikenali ^/$ multiline regex lama.
const L3_LINE_SPLIT = /\r\n|\n|\r|\u2028|\u2029/;
const L3_LINE_SPLIT_KEEP = /(\r\n|\n|\r|\u2028|\u2029)/;

/**
 * Parse SATU baris penanda; null bila baris bukan penanda.
 * Parser manual (bukan regex `\s*` berantai) supaya bebas backtracking
 * super-linear (S8786) — pola yang sama dengan parseL3Tag di server.
 * Semantik dipertahankan dari regex lama client
 * /^BIAYA TELAT NON-JOB L3\s*\|\s*WO:\s*(\S+)\s*\|\s*Alasan:\s*(.*)$/m:
 * `\s` JS (termasuk NBSP) dipetakan lewat trim/search, token WO rakus
 * boleh memuat `|` selama pipa terakhir diikuti `Alasan:`, dan alasan
 * kosong di akhir baris tetap diterima (`.*`, beda dari `(.+)` server —
 * vonis alasan kosong tetap milik server). Satu-satunya penyimpangan:
 * pemisah/alasan tidak lagi bocor menyeberangi baris pada input rusak
 * (regex lama menelan `\n` lewat `\s*` dan `(.*)$` multiline); format
 * baku dari formatL3TagClient selalu satu baris sehingga tak terpengaruh.
 */
function parseL3Line(
  line: string,
): { workOrderNo: string; reason: string } | null {
  if (!line.startsWith(L3_MARKER_UI)) return null;
  let rest = line.slice(L3_MARKER_UI.length).trimStart();
  if (!rest.startsWith("|")) return null;
  rest = rest.slice(1).trimStart();
  if (!rest.startsWith("WO:")) return null;
  rest = rest.slice("WO:".length).trimStart();
  // Token WO lama `(\S+)\s*\|`: run non-spasi pertama; pipa pemisah boleh
  // menempel token atau sesudah spasi. Di dalam run, pipa terakhir yang
  // diikuti `Alasan:` yang dipakai (meniru backtracking rakus regex lama).
  const wsAt = rest.search(/\s/);
  const runEnd = wsAt === -1 ? rest.length : wsAt;
  let pipeAt = -1;
  for (let i = runEnd - 1; i > 0; i--) {
    if (rest[i] === "|" && rest.slice(i + 1).trimStart().startsWith("Alasan:")) {
      pipeAt = i;
      break;
    }
  }
  if (pipeAt === -1) {
    let j = runEnd;
    while (j < rest.length && /\s/.test(rest[j])) j++;
    if (rest[j] === "|" && rest.slice(j + 1).trimStart().startsWith("Alasan:")) {
      pipeAt = j;
    }
  }
  if (pipeAt === -1) return null;
  const workOrderNo = rest.slice(0, pipeAt).trimEnd();
  if (!workOrderNo || /\s/.test(workOrderNo)) return null;
  const reason = rest.slice(pipeAt + 1).trimStart().slice("Alasan:".length);
  return { workOrderNo, reason: reason.trim() };
}

/**
 * Baris yang dikelola upsert/remove: baris penanda sah (parseL3Line) ATAU
 * baris perantara yang ditulis formatL3TagClient sendiri sebelum WO/alasan
 * terisi ("... | WO:  | Alasan: "). Regex lama mengenali baris perantara
 * itu secara tidak langsung — match-nya menyeberangi "\n" lewat `\s*`
 * sesudah "Alasan:" lalu menelan baris berikutnya — sehingga upsert
 * langkah berikutnya membersihkannya; tanpa pengenalan ini baris sampah
 * tertinggal di notes (regresi tertangkap tes vendor-bill/expense-form).
 * Deteksi struktural saja: penanda + kedua label hadir berurutan.
 */
function isManagedL3Line(line: string): boolean {
  if (parseL3Line(line)) return true;
  if (!line.startsWith(L3_MARKER_UI)) return false;
  let rest = line.slice(L3_MARKER_UI.length).trimStart();
  if (!rest.startsWith("|")) return false;
  rest = rest.slice(1).trimStart();
  if (!rest.startsWith("WO:")) return false;
  const pipeAt = rest.indexOf("|", "WO:".length);
  return pipeAt !== -1 && rest.slice(pipeAt + 1).trimStart().startsWith("Alasan:");
}

/** Indeks elemen baris penanda pertama dalam hasil split-yang-menyimpan-pemisah. */
function findL3LineIndex(parts: string[]): number {
  for (let i = 0; i < parts.length; i += 2) {
    if (isManagedL3Line(parts[i])) return i;
  }
  return -1;
}

export function parseL3TagClient(
  text: string | null | undefined,
): { workOrderNo: string; reason: string } | null {
  if (!text) return null;
  for (const line of text.split(L3_LINE_SPLIT)) {
    const tag = parseL3Line(line);
    if (tag) return tag;
  }
  return null;
}

/** Ganti baris penanda L3 pertama (atau sisipkan di baris pertama); teks lain operator dipertahankan. */
export function upsertL3Tag(
  text: string,
  workOrderNo: string,
  reason: string,
): string {
  const line = formatL3TagClient(workOrderNo.trim(), reason.trim());
  const parts = text.split(L3_LINE_SPLIT_KEEP);
  const idx = findL3LineIndex(parts);
  if (idx === -1) return text ? `${line}\n${text}` : line;
  parts[idx] = line;
  return parts.join("");
}

/** Hapus baris penanda L3; teks lain operator dipertahankan. */
export function removeL3Tag(text: string): string {
  const parts = text.split(L3_LINE_SPLIT_KEEP);
  const idx = findL3LineIndex(parts);
  if (idx === -1) return text;
  // Buang baris + pemisah sesudahnya; bila baris terakhir, buang pemisah sebelumnya.
  // (Regex lama hanya menangani "\n" dan menyisakan "\r" yatim pada CRLF.)
  if (idx + 1 < parts.length) parts.splice(idx, 2);
  else if (idx > 0) parts.splice(idx - 1, 2);
  else parts.splice(idx, 1);
  return parts.join("");
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
