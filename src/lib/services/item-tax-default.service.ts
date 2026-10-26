/**
 * F-2026-10-25-042-V (vonis Q-ITX-1 Accountant, spec F-2026-10-25-041-S):
 * penjaga + resolver default pajak per Item. MURNI (tanpa Prisma/DOM):
 * pemanggil menyuplai baris Tax yang sudah dimuat; fungsi menolak
 * kombinasi terlarang dan menyalin default sebagai snapshot baris.
 *
 * Aturan mengikat (verbatim vonis):
 * - Penampung = FK nullable ke Tax per arah (defaultSalesTaxId/
 *   defaultPurchaseTaxId) + defaultDppPercent Decimal(5,2) nullable.
 *   Null semua = perilaku existing byte-sama (Putusan 2).
 * - defaultDppPercent = persen dari nilai baris yang menjadi DPP baris;
 *   DILARANG menggantikan/menumpuk faktor 11/12 PMK-131 kode dokumen
 *   (Putusan 2). Fungsi ini tidak pernah menurunkan kode transaksi.
 * - Rujukan Tax sah wajib isActive=true, deletedAt=null, dan efektif
 *   pada tanggal dokumen konsumen; rusak = fail-closed berisik tanpa
 *   fallback ke Tax/tarif lain (Putusan 3 butir 5).
 * - isScrapSaleItem menang: item scrap dilarang membawa default pajak
 *   apa pun, ditolak saat simpan (Putusan 5).
 * - Snapshot baris membekukan (Tax id, tarif efektif saat salin, persen
 *   terpakai) — edit master sesudahnya tidak menulis ulang baris
 *   (Putusan 3 butir 2). Hasil resolver ini murni bantuan input +
 *   jejak rekonsiliasi; DILARANG dipakai menentukan angka TaxInvoice/
 *   SPT/jurnal (Putusan 6).
 */

export interface ItemTaxDefaultInput {
  /** Item.isScrapSaleItem — penanda khusus selalu menang (Putusan 5). */
  isScrapSaleItem: boolean
  defaultSalesTaxId: number | null
  defaultPurchaseTaxId: number | null
  /** Persen 0.00–100.00; null = tanpa default DPP. */
  defaultDppPercent: number | null
}

export type ItemTaxDirection = "sales" | "purchase"

export interface TaxReferenceRow {
  id: number
  /** Tarif Tax.rate (Decimal(5,2)) sebagai number. */
  rate: number
  isActive: boolean
  deletedAt: Date | null
  effectiveFrom: Date | null
  effectiveTo: Date | null
}

/** Snapshot beku default pajak yang tersalin ke baris dokumen baru. */
export interface ItemTaxLineSnapshot {
  /** Tax sumber snapshot; null bila hanya persen DPP yang terisi. */
  taxId: number | null
  /** Tarif efektif Tax saat baris dibuat (beku); null tanpa rujukan. */
  taxRate: number | null
  /** Persen DPP baris terpakai; null = tanpa default DPP (jalur dokumen existing). */
  dppPercent: number | null
}

const dayMs = (d: Date): number =>
  Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

const DIRECTION_LABEL: Record<ItemTaxDirection, string> = {
  sales: "penjualan",
  purchase: "pembelian",
}

/**
 * Penjaga simpan master Item (dipakai create/update Item). Melempar
 * Error berpesan Bahasa Indonesia; pemanggil meneruskan verbatim.
 * - scrap + default apa pun = tolak (Putusan 5)
 * - persen di luar 0–100 / non-finite = tolak, bukan clamp (Putusan 2)
 * - id rujukan bukan bilangan bulat positif = tolak (bukan Tax sah)
 */
export function validateItemTaxDefaults(input: ItemTaxDefaultInput): void {
  const { defaultSalesTaxId, defaultPurchaseTaxId, defaultDppPercent } = input

  for (const [field, value] of [
    ["defaultSalesTaxId", defaultSalesTaxId],
    ["defaultPurchaseTaxId", defaultPurchaseTaxId],
  ] as const) {
    if (value !== null && (!Number.isInteger(value) || value <= 0)) {
      throw new Error(
        `Rujukan pajak default (${field}) tidak valid: wajib bilangan bulat positif atau kosong.`,
      )
    }
  }

  if (defaultDppPercent !== null) {
    if (!Number.isFinite(defaultDppPercent) || defaultDppPercent < 0 || defaultDppPercent > 100) {
      throw new Error(
        "Persen DPP default item wajib di antara 0,00 dan 100,00 (vonis Q-ITX-1 Putusan 2).",
      )
    }
  }

  if (
    input.isScrapSaleItem &&
    (defaultSalesTaxId !== null || defaultPurchaseTaxId !== null || defaultDppPercent !== null)
  ) {
    throw new Error(
      "Item besi tua tidak boleh membawa default pajak — penanda scrap menang atas default pajak per item (vonis Q-ITX-1 Putusan 5). Kosongkan default pajak penjualan, pembelian, dan persen DPP.",
    )
  }
}

/** true bila Tax berlaku efektif pada tanggal dokumen (per hari kalender UTC). */
export function taxEffectiveOn(tax: TaxReferenceRow, documentDate: Date): boolean {
  const t = dayMs(documentDate)
  if (tax.effectiveFrom !== null && dayMs(tax.effectiveFrom) > t) return false
  if (tax.effectiveTo !== null && dayMs(tax.effectiveTo) < t) return false
  return true
}

/**
 * Salin default item menjadi snapshot baris pada tanggal dokumen.
 * - Item null (baris bebas) / tanpa rujukan arah ini DAN tanpa persen
 *   = null persis (perilaku existing byte-sama — BR-ITX-01/07).
 * - Hanya persen terisi: snapshot persen-only (taxId/taxRate null);
 *   persen tetap bantuan alokasi DPP baris, bukan rezim dokumen.
 * - Rujukan Tax rusak (tidak ditemukan pemanggil / nonaktif /
 *   terhapus / di luar masa efektif) = lempar fail-closed; DILARANG
 *   fallback (Putusan 3 butir 5).
 */
export function resolveItemTaxLineSnapshot(args: {
  item: ItemTaxDefaultInput | null
  direction: ItemTaxDirection
  tax: TaxReferenceRow | null
  documentDate: Date
}): ItemTaxLineSnapshot | null {
  const { item, direction, tax, documentDate } = args
  if (item === null) return null

  validateItemTaxDefaults(item)

  const taxId = direction === "sales" ? item.defaultSalesTaxId : item.defaultPurchaseTaxId
  const dppPercent = item.defaultDppPercent

  if (taxId === null && dppPercent === null) return null

  if (taxId === null) {
    // Persen-only: tidak ada tarif untuk dibekukan.
    return { taxId: null, taxRate: null, dppPercent }
  }

  if (tax === null || tax.id !== taxId) {
    throw new Error(
      `Kode pajak default ${DIRECTION_LABEL[direction]} (Tax id ${taxId}) tidak ditemukan di master pajak. Perbaiki rujukan di master barang atau master pajak — tanpa fallback tarif lain (vonis Q-ITX-1 Putusan 3).`,
    )
  }
  if (!tax.isActive || tax.deletedAt !== null) {
    throw new Error(
      `Kode pajak default ${DIRECTION_LABEL[direction]} "${tax.id}" nonaktif atau terhapus. Aktifkan kembali di master pajak atau kosongkan default di master barang — tanpa fallback tarif lain (vonis Q-ITX-1 Putusan 3).`,
    )
  }
  if (!taxEffectiveOn(tax, documentDate)) {
    throw new Error(
      `Kode pajak default ${DIRECTION_LABEL[direction]} "${tax.id}" di luar masa efektif pada tanggal dokumen. Periksa masa berlaku di master pajak — tanpa fallback tarif lain (vonis Q-ITX-1 Putusan 3).`,
    )
  }

  return { taxId: tax.id, taxRate: tax.rate, dppPercent }
}
