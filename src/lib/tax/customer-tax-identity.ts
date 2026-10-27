/**
 * Identitas pajak lawan transaksi — validasi bentuk + penanda turunan
 * (F-2026-10-25-004-S, vonis Accountant F-2026-10-25-019-V Q-TX-1).
 *
 * Pure (tanpa Prisma/DOM). Vonis mengikat:
 * - NPWP disimpan digit-saja: 16 = kanonik, 15 = `legacy15` tertanda
 *   (peringatan migrasi, BUKAN lolos diam, BUKAN tolak simpan master),
 *   bentuk lain = tolak simpan. Sistem TIDAK mengkonversi 15→16
 *   (dilarang mengarang awalan "0") dan TIDAK memvalidasi checksum
 *   (tidak ada dasar resmi — label jujur maks "bentuk 16/15 digit").
 * - NITKU digit-saja tepat 22 (16 NPWP pusat/NIK + 6 urut TKU).
 *   Konsistensi awalan vs NPWP 16 master: beda = peringatan master,
 *   tolak terbit bila disalin. NPWP 15/kosong → `nitkuUnlinked`.
 * - Status PKP nilai kini `pkpStatus` + `pkpEffectiveFrom`; default
 *   `unknown` (tidak tahu ≠ bukan-PKP). Status PKP TIDAK PERNAH
 *   menurunkan `transactionCode` (lihat tax-invoice.ts TRANSACTION_CODES).
 * - Penanda `legacy15`/`nitkuUnlinked`/`nitkuAbsent` = turunan baca-saja,
 *   dilarang disimpan sebagai kolom status. Untuk dokumen, penanda
 *   diturunkan dari nilai snapshot beku → otomatis beku bersama snapshot.
 */

export const PKP_STATUSES = ["non_pkp", "pkp", "unknown"] as const
export type PkpStatus = (typeof PKP_STATUSES)[number]

export type NpwpFormat = "canonical16" | "legacy15" | "invalid" | "absent"

export type NitkuLink = "linked" | "unlinked" | "mismatch" | "absent"

/** Blok identitas pajak pelanggan (master kini / usulan snapshot). */
export interface CustomerTaxIdentity {
  /** NPWP existing Customer.taxId (digit mentah/bertanda baca, ternormalisasi di sini). */
  taxId?: string | null
  /** Nama wajib pajak (boleh beda nama dagang). */
  taxpayerName?: string | null
  /** Alamat pajak (boleh beda alamat kirim). */
  taxAddress?: string | null
  nitku?: string | null
  pkpStatus?: PkpStatus | string | null
  pkpEffectiveFrom?: Date | string | null
}

/** Snapshot identitas pada faktur pajak terbit (kolom counterparty existing). */
export interface CounterpartySnapshot {
  counterpartyTaxId?: string | null
  counterpartyName?: string | null
  counterpartyNitku?: string | null
}

const digitsOnly = (v: string | null | undefined): string => (v ?? "").replace(/\D/g, "")

const blank = (v: string | null | undefined): boolean => !(v ?? "").trim()

/** Normalisasi NPWP untuk simpan: digit saja; null bila kosong penuh (sah, opsional). */
export function normalizeNpwp(raw: string | null | undefined): string | null {
  const d = digitsOnly(raw)
  return d ? d : null
}

/** Klasifikasi bentuk NPWP sesudah normalisasi digit. */
export function classifyNpwp(raw: string | null | undefined): NpwpFormat {
  if (blank(raw)) return "absent"
  const d = digitsOnly(raw)
  // Ada isi tapi bukan digit murni (huruf dsb.) → bentuk cacat, bukan absen.
  if (d.length !== (raw ?? "").replace(/[\s.\-]/g, "").length) return "invalid"
  if (d.length === 16) return "canonical16"
  if (d.length === 15) return "legacy15"
  return "invalid"
}

/** Normalisasi NITKU untuk simpan: digit saja; null bila kosong penuh. */
export function normalizeNitku(raw: string | null | undefined): string | null {
  const d = digitsOnly(raw)
  return d ? d : null
}

/** NITKU sah bentuk: tepat 22 digit-saja. Kosong = absen (bukan invalid). */
export function isValidNitkuShape(raw: string | null | undefined): boolean {
  if (blank(raw)) return false
  return digitsOnly(raw).length === 22 && digitsOnly(raw) === (raw ?? "").replace(/[\s.\-]/g, "")
}

/**
 * Konsistensi NITKU vs NPWP master (vonis §3): hanya bisa dinilai bila
 * NPWP 16 digit. NPWP 15/kosong → unlinked (jangan tebak awalan "0").
 */
export function nitkuLink(identity: Pick<CustomerTaxIdentity, "taxId" | "nitku">): NitkuLink {
  if (blank(identity.nitku)) return "absent"
  if (!isValidNitkuShape(identity.nitku)) return "unlinked"
  if (classifyNpwp(identity.taxId) !== "canonical16") return "unlinked"
  return digitsOnly(identity.nitku).slice(0, 16) === digitsOnly(identity.taxId) ? "linked" : "mismatch"
}

/** Label peringatan operator untuk NPWP 15 digit (verbatim vonis §2, jangan dipersingkat diam-diam). */
export const NPWP_LEGACY15_WARNING =
  "NPWP 15 digit — minta NPWP 16 digit/NIK lawan; sejak 1 Jul 2024 layanan memakai format 16 digit"

export interface MasterTaxValidation {
  ok: boolean
  /** Pesan tolak simpan (bentuk cacat). Kosong penuh tetap ok (opsional). */
  errors: string[]
  npwpFormat: NpwpFormat
  nitkuLink: NitkuLink
  /** Peringatan non-blokir (legacy15, nitku tidak tertaut). */
  warnings: string[]
}

/**
 * Validasi MASTER (longgar-tertanda, vonis §1): simpan boleh selama
 * bentuk tidak cacat; cacat bentuk tertanda lewat warnings, bukan tolak
 * — kecuali bentuk bukan 15/16 (NPWP) / bukan 22 (NITKU) = tolak simpan.
 */
export function validateMasterTaxIdentity(identity: CustomerTaxIdentity): MasterTaxValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const npwpFormat = classifyNpwp(identity.taxId)
  if (npwpFormat === "invalid") {
    errors.push("NPWP harus 16 digit (atau 15 digit format lama) — periksa kembali nomor lawan")
  }
  if (npwpFormat === "legacy15") warnings.push(NPWP_LEGACY15_WARNING)
  const link = nitkuLink(identity)
  if (!blank(identity.nitku) && !isValidNitkuShape(identity.nitku)) {
    errors.push("NITKU harus tepat 22 digit")
  } else if (link === "mismatch") {
    warnings.push("NITKU tidak diawali NPWP pelanggan — periksa apakah NITKU milik entitas lain")
  } else if (link === "unlinked" && !blank(identity.nitku)) {
    warnings.push("NITKU belum dapat ditautkan ke NPWP (NPWP kosong/15 digit) — tersimpan apa adanya")
  }
  return { ok: errors.length === 0, errors, npwpFormat, nitkuLink: link, warnings }
}

export interface TaxIdentityCompleteness {
  /** Siap terbit faktur pajak dari sisi kelengkapan master (nama WP + NPWP terisi). */
  ready: boolean
  /** Nama field kosong, verbatim untuk tampil ("nama wajib pajak", "NPWP"). */
  missing: string[]
  /** Nama WP kosong tapi nama dagang ada → fallback tertanda (BR-TX-05, BUKAN untuk lolos gerbang faktur). */
  usesTradeNameFallback: boolean
  npwpFormat: NpwpFormat
  nitkuLink: NitkuLink
}

/** Penanda kelengkapan turunan baca-saja (BR-TX-08): tanpa kolom status. */
export function deriveTaxIdentityCompleteness(
  identity: CustomerTaxIdentity & { tradeName?: string | null },
): TaxIdentityCompleteness {
  const missing: string[] = []
  const nameMissing = blank(identity.taxpayerName)
  if (nameMissing) missing.push("nama wajib pajak")
  if (classifyNpwp(identity.taxId) === "absent") missing.push("NPWP")
  return {
    ready: missing.length === 0,
    missing,
    usesTradeNameFallback: nameMissing && !blank(identity.tradeName),
    npwpFormat: classifyNpwp(identity.taxId),
    nitkuLink: nitkuLink(identity),
  }
}

/**
 * Salin identitas master → snapshot counterparty (BR-TX-03).
 * Koreksi operator (override) menang per-field atas master; field tanpa
 * override dan tanpa master tetap null — TIDAK ditebak dari nama dagang
 * (gerbang EC-3 yang memutuskan, bukan penyalin).
 */
export function snapshotCounterpartyFromMaster(
  identity: CustomerTaxIdentity,
  override?: Partial<CounterpartySnapshot>,
): CounterpartySnapshot {
  return {
    counterpartyTaxId: override?.counterpartyTaxId ?? normalizeNpwp(identity.taxId),
    counterpartyName: override?.counterpartyName ?? (blank(identity.taxpayerName) ? null : identity.taxpayerName!.trim()),
    counterpartyNitku: override?.counterpartyNitku ?? normalizeNitku(identity.nitku),
  }
}

/** Penanda dokumen diturunkan dari snapshot BEKU → ikut beku, tanpa kolom penanda (vonis §6). */
export interface SnapshotTaxMarkers {
  npwpFormat: NpwpFormat
  legacy15: boolean
  nitkuAbsent: boolean
  /**
   * NITKU sah-bentuk ada tetapi NPWP bukan canonical16 (legacy15/kosong/
   * cacat) → tidak dapat ditautkan (019-V §8A-3). Bukan mismatch: mismatch
   * (NPWP 16 + awalan NITKU beda) ditolak gerbang terbit, jadi tidak pernah
   * beku di dokumen.
   */
  nitkuUnlinked: boolean
}

export function deriveSnapshotMarkers(snapshot: CounterpartySnapshot): SnapshotTaxMarkers {
  const npwpFormat = classifyNpwp(snapshot.counterpartyTaxId)
  return {
    npwpFormat,
    legacy15: npwpFormat === "legacy15",
    nitkuAbsent: blank(snapshot.counterpartyNitku),
    nitkuUnlinked: isValidNitkuShape(snapshot.counterpartyNitku) && npwpFormat !== "canonical16",
  }
}

export type IssueGateDecision =
  | { allowed: true; warnings: string[] }
  | { allowed: false; error: string }

/**
 * Gerbang terbit faktur pajak keluaran (vonis §5, server-side).
 * Satu paket: nama kosong → tolak; NPWP kosong → tolak; bentuk cacat
 * → tolak; 15 digit → lolos HANYA dengan konfirmasi eksplisit tercatat;
 * NITKU cacat → tolak, NITKU absen → lolos bertanda nitkuAbsent.
 * TANPA pengecualian ritel (putusan Lead §8A butir 5: belum ada jalur
 * ritel di kode — mengarang pengecualian dilarang).
 */
export function evaluateTaxInvoiceIssueGate(
  snapshot: CounterpartySnapshot,
  opts: { legacy15Confirmed?: boolean } = {},
): IssueGateDecision {
  if (blank(snapshot.counterpartyName)) {
    return { allowed: false, error: "Nama lawan transaksi wajib terisi untuk menerbitkan faktur pajak (identitas pembeli wajib — PER-11/PJ/2025 Pasal 33)" }
  }
  const npwpFormat = classifyNpwp(snapshot.counterpartyTaxId)
  if (npwpFormat === "absent") {
    return { allowed: false, error: "NPWP/NIK lawan transaksi wajib terisi untuk menerbitkan faktur pajak (identitas pembeli wajib — PER-11/PJ/2025 Pasal 33)" }
  }
  if (npwpFormat === "invalid") {
    return { allowed: false, error: "NPWP lawan transaksi bentuknya tidak sah (harus 16 digit, atau 15 digit format lama)" }
  }
  if (!blank(snapshot.counterpartyNitku) && !isValidNitkuShape(snapshot.counterpartyNitku)) {
    return { allowed: false, error: "NITKU lawan transaksi harus tepat 22 digit" }
  }
  if (nitkuLink({ taxId: snapshot.counterpartyTaxId, nitku: snapshot.counterpartyNitku }) === "mismatch") {
    return { allowed: false, error: "NITKU lawan transaksi tidak diawali NPWP lawan transaksi — periksa apakah NITKU milik entitas lain" }
  }
  const warnings: string[] = []
  if (npwpFormat === "legacy15") {
    if (!opts.legacy15Confirmed) {
      return { allowed: false, error: `${NPWP_LEGACY15_WARNING} — konfirmasi eksplisit diperlukan sebelum terbit dengan NPWP 15 digit` }
    }
    warnings.push(NPWP_LEGACY15_WARNING)
  }
  if (blank(snapshot.counterpartyNitku)) warnings.push("NITKU lawan transaksi kosong (nitkuAbsent) — terbit bertanda, lengkapi bila penyerahan ke TKU lain")
  return { allowed: true, warnings }
}
