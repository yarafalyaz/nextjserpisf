/**
 * F-2026-10-25-028-S tahap 1 — riwayat harga JUAL aktual per pasangan
 * (pelanggan, barang), turunan baris `SalesInvoiceItem` faktur terbit.
 *
 * Objek ini TRANSAKSI FAKTUR, bukan harga penawaran (F-2026-10-25-039-S,
 * BR-QPH-01): harga di sini harga satuan yang benar-benar tertagih pada
 * faktur berstatus diakui. Populasi kedua spec DILARANG digabung.
 *
 * Populasi (BR-PH-01): hanya status `RECOGNISED_AR_STATUSES`
 * (posted|partial|paid, document-status.ts) + `deletedAt IS NULL`.
 * Draft/sent/approved/cancelled tidak pernah masuk walau unitPrice terisi.
 * Builder menegakkan status + deletedAt lagi lapis kedua (AC-PH-B1);
 * loader menegakkan di query Prisma.
 *
 * Harga terakhir pasangan (BR-PH-02/06) = unitPrice baris kejadian
 * terbaru persis: tanggal faktur desc, seri diputus documentNo desc,
 * lalu id faktur desc, lalu id baris desc. DILARANG rata-rata tertimbang,
 * modus, atau harga saran. Diskon baris tampil terpisah, tidak dilebur
 * ke harga satuan (BR-PH-06/AC-PH-B6).
 *
 * Sumber harga (BR-PH-03): label dari `priceSourceLabel` existing
 * (src/lib/utils/price-source.ts) atas snapshot baris. Null = "Sumber
 * harga tidak tercatat" (BUKAN klaim historis); nilai di luar kosakata
 * sah tampil mentah tertanda, tidak dipetakan paksa.
 *
 * Baris `itemId IS NULL` (BR-PH-04): ember BARIS_TANPA_BARANG per
 * pelanggan — hitungan + rentang tanggal saja, tidak dipasangkan ke
 * barang mana pun dan tanpa harga pasangan.
 *
 * Batas (BR-PH-08): pola putusan Lead untuk 039-S (PR #901 komentar
 * 6399637522) diterapkan sejajar — periode maks 365 hari inklusif,
 * kejadian tampil per pasangan maks 50 terbaru ditandai `terpotong`;
 * pelanggan WAJIB dipilih di loader (nol keluaran massal).
 *
 * Pure (tanpa Prisma/DOM). Loader: `sales-price-history-data.ts`.
 */

import { RECOGNISED_AR_STATUSES } from "@/lib/reports/document-status"
import { priceSourceLabel } from "@/lib/utils/price-source"
import { safeAdd } from "@/lib/utils/math"

/** Notice wajib verbatim BR-PH-05 — UI menempel apa adanya. */
export const SALES_PRICE_HISTORY_NOTICE_TEXT =
  "Harga transaksi lampau — bukan harga jual saat ini; harga berlaku mengikuti daftar harga/master saat penawaran dibuat."

/** Label sumber harga tak tercatat verbatim BR-PH-03 — UI menempel apa adanya. */
export const SALES_PRICE_HISTORY_UNKNOWN_SOURCE_LABEL = "Sumber harga tidak tercatat"

/** Ember baris tanpa barang verbatim BR-PH-04 — UI menempel apa adanya. */
export const SALES_PRICE_HISTORY_ITEMLESS_LABEL = "BARIS_TANPA_BARANG"

/** Kosakata sumber harga sah (komentar schema SalesInvoiceItem). */
export const SALES_PRICE_HISTORY_KNOWN_SOURCES = ["price_list_tier", "price_list_base", "item_master"] as const

/** Batas periode maksimum (hari kalender, inklusif) — pola putusan 039-S. */
export const SALES_PRICE_HISTORY_MAX_PERIOD_DAYS = 365

/** Batas kejadian tampil per pasangan — pola putusan 039-S. */
export const SALES_PRICE_HISTORY_MAX_EVENTS_PER_PAIR = 50

const MS_PER_DAY = 86_400_000
const RECOGNISED = new Set<string>(RECOGNISED_AR_STATUSES)

export interface SalesPriceEventInput {
  invoiceId: number
  /** Id baris SalesInvoiceItem; seri terakhir urutan kejadian. */
  invoiceItemId: number
  slug: string | null
  documentNo: string
  customerId: number
  customerName: string
  /** Null = baris deskripsi bebas; masuk ember tanpa-barang (BR-PH-04). */
  itemId: number | null
  itemName: string | null
  itemSku: string | null
  description: string | null
  /** Tanggal faktur (`SalesInvoice.date`). */
  date: Date
  /** Status faktur tersimpan apa adanya; builder menyaring populasi. */
  status: string
  /**
   * Loader menegakkan `deletedAt: null` di query; builder tetap menolak
   * baris terhapus bila dipasok (AC-PH-B1, pertahanan lapis kedua).
   */
  deletedAt?: Date | null
  qty: number
  uom: string | null
  unitPrice: number
  /** Diskon baris apa adanya, terpisah dari unitPrice (AC-PH-B6). */
  discount: number
  total: number
  /** Snapshot sumber harga baris; null = tidak tercatat (BR-PH-03). */
  priceSource: string | null
  priceListId: number | null
  priceListMinQty: number | null
}

export interface SalesPriceEvent extends SalesPriceEventInput {
  /** Label sumber harga untuk ditampilkan UI apa adanya (BR-PH-03). */
  priceSourceLabel: string
  /** True bila priceSource null/di luar kosakata — tampil tertanda. */
  sumberTidakTercatat: boolean
  /** Harga 0 (bonus) tampil apa adanya tertanda (EC-6). */
  hargaNol: boolean
  /** Tautan detail faktur existing; gerbangnya `view_sales_invoices`. */
  tautanDetail: string
}

export interface SalesPricePairGroup {
  customerId: number
  customerName: string
  itemId: number
  itemName: string | null
  itemSku: string | null
  /**
   * Kejadian terbaru DALAM periode terpilih (EC-5); persis baris pertama
   * urutan kejadian yang sama, bukan hitungan kedua (BR-PH-06).
   */
  transaksiTerakhir: SalesPriceEvent
  /** Total kejadian pasangan dalam periode, sebelum dipotong. */
  jumlahTransaksi: number
  /** Kejadian tampil sesudah batas per pasangan. */
  jumlahTampil: number
  /** True bila jumlahTransaksi > jumlahTampil. */
  terpotong: boolean
  /** Σ qty baris pasangan dalam periode (tanpa konversi uom, EC-3). */
  qtyKumulatif: number
  /** Kejadian terbaru dulu, maks `SALES_PRICE_HISTORY_MAX_EVENTS_PER_PAIR`. */
  kejadian: SalesPriceEvent[]
}

export interface SalesItemlessSummary {
  /** Penanda ember verbatim BR-PH-04. */
  label: string
  customerId: number
  customerName: string
  /** Hitungan baris itemId NULL dalam periode. */
  count: number
  tanggalTerawal: Date
  tanggalTerbaru: Date
}

export interface SalesPriceHistory {
  /** Notice BR-PH-05 verbatim — selalu terisi. */
  notice: string
  periodeMulai: Date
  periodeSelesai: Date
  /** Saringan barang eksplisit; null = semua barang pelanggan. */
  itemId: number | null
  /** Ada pasangan yang kejadiannya terpotong batas per pasangan. */
  terpotong: boolean
  pasangan: SalesPricePairGroup[]
  /** Ember tanpa-barang per pelanggan (BR-PH-04). */
  tanpaBarang: SalesItemlessSummary[]
  jumlahPasangan: number
  /** Σ jumlahTransaksi semua pasangan (sebelum potong per pasangan). */
  jumlahTransaksi: number
}

export interface SalesPriceHistoryOptions {
  periodeMulai: Date
  periodeSelesai: Date
  /** Saringan satu barang; null/undefined = semua barang pelanggan. */
  itemId?: number | null
  maxEventsPerPair?: number
}

/** Gerbang periode; dipakai builder + loader. */
export function assertSalesPriceHistoryPeriod(periodeMulai: Date, periodeSelesai: Date): void {
  if (!(periodeMulai instanceof Date) || Number.isNaN(periodeMulai.getTime())) {
    throw new Error("Periode mulai riwayat harga jual tidak sah.")
  }
  if (!(periodeSelesai instanceof Date) || Number.isNaN(periodeSelesai.getTime())) {
    throw new Error("Periode selesai riwayat harga jual tidak sah.")
  }
  if (periodeSelesai.getTime() < periodeMulai.getTime()) {
    throw new Error("Periode selesai riwayat harga jual mendahului periode mulai.")
  }
  const spanDays = Math.round((periodeSelesai.getTime() - periodeMulai.getTime()) / MS_PER_DAY)
  if (spanDays > SALES_PRICE_HISTORY_MAX_PERIOD_DAYS) {
    throw new Error(
      `Periode riwayat harga jual melebihi batas maksimum ${SALES_PRICE_HISTORY_MAX_PERIOD_DAYS} hari.`,
    )
  }
}

/**
 * Label sumber harga baris (BR-PH-03). Kosakata sah memakai
 * `priceSourceLabel` existing; tier tanpa minQty sah, null, dan nilai
 * asing tampil "Sumber harga tidak tercatat" — nilai asing ikut
 * terbawa mentah di `priceSource` event untuk audit, tidak dipetakan.
 */
export function deriveSalesPriceSourceLabel(input: Pick<SalesPriceEventInput, "priceSource" | "priceListMinQty">): {
  label: string
  tidakTercatat: boolean
} {
  const label = priceSourceLabel(input.priceSource, input.priceListMinQty)
  if (label != null) return { label, tidakTercatat: false }
  return { label: SALES_PRICE_HISTORY_UNKNOWN_SOURCE_LABEL, tidakTercatat: true }
}

/** Terbaru dulu: date, lalu documentNo, lalu id faktur, lalu id baris. */
function compareEventNewestFirst(a: SalesPriceEvent, b: SalesPriceEvent): number {
  const dateDiff = b.date.getTime() - a.date.getTime()
  if (dateDiff !== 0) return dateDiff
  const docDiff = b.documentNo.localeCompare(a.documentNo)
  if (docDiff !== 0) return docDiff
  if (a.invoiceId !== b.invoiceId) return b.invoiceId - a.invoiceId
  return b.invoiceItemId - a.invoiceItemId
}

export function buildSalesPriceHistory(
  inputs: SalesPriceEventInput[],
  options: SalesPriceHistoryOptions,
): SalesPriceHistory {
  assertSalesPriceHistoryPeriod(options.periodeMulai, options.periodeSelesai)
  const itemFilter = options.itemId ?? null
  const maxEvents = Math.max(
    1,
    Math.floor(options.maxEventsPerPair ?? SALES_PRICE_HISTORY_MAX_EVENTS_PER_PAIR),
  )
  const startMs = options.periodeMulai.getTime()
  const endMs = options.periodeSelesai.getTime()

  const eventsByPair = new Map<string, SalesPriceEvent[]>()
  const pairMeta = new Map<
    string,
    { customerId: number; customerName: string; itemId: number; itemName: string | null; itemSku: string | null }
  >()
  const itemlessByCustomer = new Map<number, SalesItemlessSummary>()

  for (const input of inputs) {
    // AC-PH-B1: populasi hanya status diakui + tidak terhapus.
    if (!RECOGNISED.has(input.status)) continue
    if (input.deletedAt != null) continue
    const dateMs = input.date.getTime()
    if (dateMs < startMs || dateMs > endMs) continue

    // AC-PH-B4: itemId NULL hanya ember tanpa-barang, tak dipasangkan.
    if (input.itemId == null) {
      const existing = itemlessByCustomer.get(input.customerId)
      if (!existing) {
        itemlessByCustomer.set(input.customerId, {
          label: SALES_PRICE_HISTORY_ITEMLESS_LABEL,
          customerId: input.customerId,
          customerName: input.customerName,
          count: 1,
          tanggalTerawal: input.date,
          tanggalTerbaru: input.date,
        })
      } else {
        existing.count += 1
        if (dateMs < existing.tanggalTerawal.getTime()) existing.tanggalTerawal = input.date
        if (dateMs > existing.tanggalTerbaru.getTime()) existing.tanggalTerbaru = input.date
      }
      continue
    }

    if (itemFilter != null && input.itemId !== itemFilter) continue

    const sumber = deriveSalesPriceSourceLabel(input)
    const event: SalesPriceEvent = {
      ...input,
      priceSourceLabel: sumber.label,
      sumberTidakTercatat: sumber.tidakTercatat,
      hargaNol: input.unitPrice === 0,
      tautanDetail: `/penjualan/faktur/${input.slug ?? input.invoiceId}`,
    }
    const key = `${input.customerId}:${input.itemId}`
    const list = eventsByPair.get(key) ?? []
    list.push(event)
    eventsByPair.set(key, list)
    if (!pairMeta.has(key)) {
      pairMeta.set(key, {
        customerId: input.customerId,
        customerName: input.customerName,
        itemId: input.itemId,
        itemName: input.itemName,
        itemSku: input.itemSku,
      })
    }
  }

  const pasangan: SalesPricePairGroup[] = []
  for (const [key, events] of eventsByPair) {
    const meta = pairMeta.get(key)
    if (!meta) continue
    const sorted = [...events].sort(compareEventNewestFirst)
    const tampil = sorted.slice(0, maxEvents)
    pasangan.push({
      ...meta,
      // sorted tidak kosong menurut konstruksi Map; baris pertama urutan
      // yang sama = transaksi terakhir (BR-PH-06, satu sumber kebenaran).
      transaksiTerakhir: sorted[0],
      jumlahTransaksi: sorted.length,
      jumlahTampil: tampil.length,
      terpotong: sorted.length > tampil.length,
      qtyKumulatif: sorted.reduce((sum, event) => safeAdd(sum, event.qty, 2), 0),
      kejadian: tampil,
    })
  }

  // Pasangan dengan transaksi terakhir paling baru dulu; seri nama.
  pasangan.sort((a, b) => {
    const lastDiff = compareEventNewestFirst(a.transaksiTerakhir, b.transaksiTerakhir)
    if (lastDiff !== 0) return lastDiff
    const customerDiff = a.customerName.localeCompare(b.customerName)
    if (customerDiff !== 0) return customerDiff
    return (a.itemName ?? "").localeCompare(b.itemName ?? "")
  })

  const tanpaBarang = [...itemlessByCustomer.values()].sort((a, b) =>
    a.customerName.localeCompare(b.customerName),
  )

  return {
    notice: SALES_PRICE_HISTORY_NOTICE_TEXT,
    periodeMulai: options.periodeMulai,
    periodeSelesai: options.periodeSelesai,
    itemId: itemFilter,
    terpotong: pasangan.some((pair) => pair.terpotong),
    pasangan,
    tanpaBarang,
    jumlahPasangan: pasangan.length,
    jumlahTransaksi: pasangan.reduce((sum, pair) => sum + pair.jumlahTransaksi, 0),
  }
}
