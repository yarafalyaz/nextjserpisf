import { z } from "zod"
import "./zod-locale";

/**
 * Nomor faktur pajak (e-Faktur/Coretax) — validasi format RINGAN, boleh kosong.
 *
 * Sengaja tidak dikunci ke 16 digit persis: awalan/kode transaksi e-Faktur
 * berubah antar regulasi (mis. PER-12/PJ/2026) dan nomor lama memakai pemisah
 * titik/strip. Yang ditolak hanya karakter di luar digit/huruf/spasi/titik/strip
 * dan panjang berlebih — isi persisnya urusan rekonsiliasi SPT, bukan form.
 * Satu helper dipakai schema penjualan (keluaran) & pembelian (masukan) supaya
 * aturan keduanya tidak berpisah.
 */
export const taxInvoiceNumber = z
  .string()
  .trim()
  .max(50, "Nomor faktur pajak maksimal 50 karakter")
  .regex(
    /^[0-9A-Za-z][0-9A-Za-z .-]*$/,
    "Nomor faktur pajak hanya boleh berisi huruf, angka, spasi, titik, dan strip",
  )
  .optional()
  .or(z.literal("").transform(() => undefined))
