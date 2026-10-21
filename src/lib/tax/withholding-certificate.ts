/**
 * Bukti potong PPh — tarif & DPP per jenis (F-003).
 *
 * Vonis FINAL accountant F-2026-10-21-003:
 * - Seed bawaan HANYA 2 pasal terbukti dipakai repo: PPh 23 jasa umum
 *   tarif 2% (objek per-jenis-jasa PMK-141/2015 — kode dipilih per jasa,
 *   JANGAN satu kode keras untuk semua jasa) dan PPh 4(2) konstruksi/final
 *   (tarif per kualifikasi 1,75%/2,65%/3,5%/4%/6% per kode objek; wajib
 *   pilih kode, tarif mengikuti kode terpilih).
 * - PPh 21 tetap domain payroll (TER); PPh 22/26/15 hanya aktif bila
 *   tenant aktifkan jenisnya — jangan seed mati.
 * - Bupot lahir menyalin pasal+kode+tarif+DPP ke snapshot dokumen; edit
 *   tarif master sesudah itu TIDAK mengubah bupot terbit maupun jurnalnya.
 *
 * Pure (tanpa Prisma/DOM). Uang Decimal(15,2), tarif Decimal(5,2).
 */

import { safeMultiply, safeRound } from "@/lib/utils/math"

/** Pasal PPh snapshot. */
export const WITHHOLDING_ARTICLES = ["PPh21", "PPh22", "PPh23", "PPh4(2)", "PPh26", "PPh15"] as const
export type WithholdingArticle = (typeof WITHHOLDING_ARTICLES)[number]

/** Kode objek PPh 23 jasa per-jenis-jasa PMK-141/2015 (contoh seri 24-104-xx). */
export interface Pph23ServiceObject {
  /** Kode objek e-Bupot, mis. "24-104-01". */
  objectCode: string
  /** Nama jenis jasa. */
  serviceName: string
  /** Selalu 2 — satu tarif, banyak kode (JANGAN satu kode keras). */
  rate: 2
}

/** Kode objek PPh 4(2) konstruksi: tarif mengikuti kode terpilih. */
export interface Pph42ConstructionObject {
  /** Kode objek e-Bupot, mis. "28-409-01". */
  objectCode: string
  /** Kualifikasi usaha. */
  qualification: string
  /** Tarif per kualifikasi: 1,75 / 2,65 / 3,5 / 4 / 6. */
  rate: 1.75 | 2.65 | 3.5 | 4 | 6
}

/** Tarif PPh 23 jasa umum: 2% untuk SEMUA kode objek jasa. */
export const PPH23_SERVICE_RATE = 2

/**
 * Validasi pilihan objek PPh 23: kode objek WAJIB diisi (per-jenis-jasa),
 * tarif selalu 2 — menolak tarif tebakan per kode.
 */
export function resolvePph23Rate(objectCode: string | null | undefined): 2 {
  if (!objectCode || objectCode.trim() === "") {
    throw new Error("PPh 23: kode objek jasa wajib dipilih per jenis jasa (PMK-141/2015) — tanpa kode, tarif tak bisa ditentukan.")
  }
  return PPH23_SERVICE_RATE
}

/**
 * Tarif PPh 4(2) konstruksi mengikuti kode objek terpilih.
 * Tanpa kode = tolak (tarif tak bisa ditebak dari kualifikasi bebas).
 */
export function resolvePph42Rate(
  objectCode: string | null | undefined,
  rateByObjectCode: Readonly<Record<string, number>>,
): number {
  const code = (objectCode ?? "").trim()
  if (code === "") {
    throw new Error("PPh 4(2) konstruksi: kode objek wajib dipilih — tarif mengikuti kode (1,75/2,65/3,5/4/6%).")
  }
  const rate = rateByObjectCode[code]
  if (rate == null || !(rate > 0)) {
    throw new Error(`PPh 4(2) konstruksi: kode objek "${code}" tidak dikenal — pilih kode konstruksi yang berlaku.`)
  }
  return safeRound(rate, 2)
}

/** Tarif PPh 4(2) final sewa tanah/bangunan: TETAP 10% (PP 34/2017). */
export const PPH42_RENT_RATE = 10

/** Pola format kode objek e-Bupot: NN-NNN-NN (PER-11/PJ/2025 Lampiran B). */
const OBJECT_CODE_FORMAT = /^\d{2}-\d{3}-\d{2}$/

/**
 * Satu baris katalog kode objek sewa, DIBACA DARI MASTER jenis pajak
 * (baris WithholdingTaxType aktif keluarga sewa) oleh service — daftar
 * kode sah TIDAK di-hardcode di resolver ini (F51-5 vonis BOT 4
 * F-2026-10-22-051-V). `requiresEvidence` menandai kode bersyarat bukti
 * dokumen (di master: jenis sewa non-default, mis. proyek pemerintah
 * hibah/pinjaman luar negeri); penanda per-jenis, bukan pin kode.
 */
export interface Pph42RentCatalogEntry {
  objectCode: string
  /** Tarif master baris ini; wajib cocok tarif resmi katalog (10). */
  rate: number
  requiresEvidence: boolean
}

/**
 * Validasi penerbitan bupot sewa terhadap katalog master (vonis BOT 4
 * F-2026-10-22-051-V Putusan 1+2, menutup lubang PR #408):
 * - kode wajib terisi, format NN-NNN-NN;
 * - kode WAJIB ada di katalog master aktif yang diteruskan pemanggil —
 *   di luar katalog (konstruksi 28-409-*, pengalihan 28-402-*, PPh 23
 *   24-*, 28-403 karangan, acak) TOLAK fail-closed berisik;
 * - tarif baris katalog wajib tepat tarif resmi sewa (10) — tarif master
 *   menyimpang ditolak, jangan dipakai diam-diam (F51-6);
 * - kode bersyarat bukti (`requiresEvidence`) wajib bukti dokumen
 *   non-kosong (F51-3).
 * Mengembalikan tarif resmi 10 untuk snapshot. Master belum bertanggal
 * efektif/histori — katalog = baris aktif saat terbit, dibekukan snapshot.
 */
export function resolvePph42RentRate(
  objectCode: string | null | undefined,
  catalog: readonly Pph42RentCatalogEntry[],
  opts?: { evidence?: string | null },
): 10 {
  const code = (objectCode ?? "").trim()
  if (code === "") {
    throw new Error("PPh 4(2) sewa: kode objek wajib terisi di master jenis PPH42-SEWA — tanpa kode, bupot sewa tidak diterbitkan.")
  }
  if (!OBJECT_CODE_FORMAT.test(code)) {
    throw new Error(`PPh 4(2) sewa: kode objek "${code}" berformat rusak (wajib pola NN-NNN-NN) — di luar katalog kode objek sewa.`)
  }
  if (code.startsWith("28-409")) {
    throw new Error("PPh 4(2) sewa: kode objek konstruksi tidak berlaku untuk sewa tanah/bangunan — pilih kode objek sewa.")
  }
  const entry = catalog.find((e) => e.objectCode.trim() === code)
  if (!entry) {
    throw new Error(`PPh 4(2) sewa: kode objek "${code}" di luar katalog master aktif — bupot sewa hanya memakai kode objek dari master jenis PPH42-SEWA yang aktif.`)
  }
  if (safeRound(entry.rate, 2) !== PPH42_RENT_RATE) {
    throw new Error(`PPh 4(2) sewa: tarif master untuk kode objek "${code}" menyimpang dari tarif resmi ${PPH42_RENT_RATE}% — koreksi master sebelum bupot diterbitkan.`)
  }
  if (entry.requiresEvidence && !(opts?.evidence ?? "").trim()) {
    throw new Error(`PPh 4(2) sewa: kode objek "${code}" hanya untuk sewa terbukti dokumen dasarnya (proyek pemerintah hibah/pinjaman luar negeri) — tanpa bukti dokumen, pakai kode objek sewa umum di master.`)
  }
  return PPH42_RENT_RATE
}

export interface WithholdingComputation {
  dpp: number
  tariff: number
  withheldAmount: number
}

/**
 * Hitung PPh dipotong = DPP × tarif snapshot, presisi sen.
 * Fasilitas SKB/PP23/DTP menurunkan tarif efektif di sisi service
 * (bukan di sini — fungsi ini murni hitung dari tarif snapshot).
 */
export function computeWithheld(dpp: number, tariff: number): WithholdingComputation {
  const base = safeRound(dpp, 2)
  const rate = safeRound(tariff, 2)
  return { dpp: base, tariff: rate, withheldAmount: safeMultiply(base, rate / 100, 2) }
}

/**
 * Snapshot bupot dari jenis master terpilih: salin pasal+kode+tarif+DPP.
 * Sesudah snapshot, edit master tak mengubah hasil ini (falsifikasi f).
 */
export function snapshotWithholding(input: {
  article: WithholdingArticle
  objectCode: string | null | undefined
  rate: number
  dpp: number
  facility?: "SKB" | "PP23" | "DTP" | null
}): WithholdingComputation & { article: WithholdingArticle; objectCode: string | null; facility: string | null } {
  const tariff = safeRound(input.rate, 2)
  if (!(tariff >= 0)) throw new Error("Tarif snapshot bupot tidak valid.")
  const c = computeWithheld(input.dpp, tariff)
  return {
    ...c,
    article: input.article,
    objectCode: input.objectCode?.trim() ? input.objectCode.trim() : null,
    facility: input.facility ?? null,
  }
}
