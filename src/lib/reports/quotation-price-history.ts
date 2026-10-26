/**
 * F-2026-10-25-039-S tahap 1 — riwayat harga PENAWARAN per pasangan
 * (pelanggan, barang), turunan baris berjalan `QuotationItem`.
 *
 * Objek ini PENAWARAN, bukan harga transaksi faktur (F-2026-10-25-028-S,
 * BR-QPH-01): harga di sini harga yang pernah DITAWARKAN pada revisi
 * berjalan satu penawaran — belum tentu terkirim, diterima, atau jadi
 * transaksi. Populasi kedua spec DILARANG digabung.
 *
 * PUTUSAN Lead PR #901 komentar 6399637522 (25 Okt 2026 22:4x WIB,
 * putusan terbaru — mengalahkan angka periode/paginasi komentar
 * 6399514412 sebelumnya):
 * - Q-QPH-2: izin loader `view_reports` reuse, fail-closed di server.
 * - Q-QPH-4: periode maksimum 365 hari; kejadian per pasangan maks 50
 *   baris terbaru dalam periode, hasil ditandai `terpotong`; ember DRAFT
 *   TIDAK tampil default — hanya saringan eksplisit `includeDraft`.
 * - Q-QPH-5: baris `itemId IS NULL` hanya hitungan ringkas + rentang
 *   tanggal per pelanggan, tanpa daftar baris.
 * - Q-QPH-3 (fisik Backend): tahap 1 baris berjalan saja. Bentuk
 *   `QuotationHistory.dataSnapshot` Json bebas TIDAK terbukti stabil,
 *   jadi snapshot TIDAK dibaca; yang tampil revisi berjalan
 *   (`revisiBerjalanLabel`), harga revisi lama tidak tampil (BR-QPH-11).
 *
 * Ember status BR-QPH-02/03/04: makna harga mengikuti status pembawa.
 * Kedaluwarsa TURUNAN baca murni persis `assertQuotationNotExpired`
 * (src/actions/sales.actions.ts): status `sent` + hari WIB hari ini >
 * validUntil; hari validUntil sendiri masih berlaku; validUntil kosong
 * tidak pernah kedaluwarsa. Status tersimpan menang atas turunan:
 * sesudah cron auto-reject, baris yang sama terbaca DITOLAK /
 * DITOLAK OTOMATIS (dari histori `auto_rejected` revisi berjalan yang
 * dipasok loader), bukan KEDALUWARSA (EC-8). Builder TIDAK menulis
 * status `expired` apa pun (tidak ada nilai tersimpan seperti itu).
 *
 * Penawaran terakhir pasangan = kejadian tanggal terbaru; seri tanggal
 * sama diputus documentNo menurun, lalu id quotation menurun, lalu id
 * baris menurun (BR-QPH-05). DILARANG rata-rata/modus/mediana/proba-
 * bilitas (BR-QPH-05/06) dan DILARANG penanda sumber harga —
 * `QuotationItem` tidak menyimpan kolom itu (BR-QPH-07).
 *
 * Pure (tanpa Prisma/DOM). Loader: `quotation-price-history-data.ts`.
 */

import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"

/** Notice wajib verbatim BR-QPH-10 — UI menempel apa adanya. */
export const QUOTATION_PRICE_HISTORY_NOTICE_TEXT =
  "Harga penawaran lampau — bukan harga transaksi dan bukan harga jual saat ini. Harga draft belum pernah terkirim; harga ditolak/kedaluwarsa tidak disepakati pelanggan. Harga berlaku mengikuti daftar harga/master saat penawaran dibuat."

/** Penanda jujur BR-QPH-11: yang tampil revisi berjalan, bukan riwayat revisi. */
export const QUOTATION_PRICE_HISTORY_CURRENT_REVISION_LABEL = "Revisi berjalan"

/** Batas periode maksimum putusan Q-QPH-4 (hari kalender, inklusif). */
export const QUOTATION_PRICE_HISTORY_MAX_PERIOD_DAYS = 365

/** Batas kejadian tampil per pasangan putusan Q-QPH-4. */
export const QUOTATION_PRICE_HISTORY_MAX_EVENTS_PER_PAIR = 50

export const QUOTATION_PRICE_HISTORY_BUCKETS = [
  "DRAFT",
  "TERKIRIM",
  "KEDALUWARSA",
  "DITERIMA",
  "DITOLAK",
  "DITOLAK_OTOMATIS",
  "DIKONVERSI",
  "STATUS_TIDAK_DIKENAL",
] as const

export type QuotationPriceHistoryBucket = (typeof QUOTATION_PRICE_HISTORY_BUCKETS)[number]

/** Label ember verbatim §4 spec — UI menempel apa adanya (BR-QPH-02). */
export const QUOTATION_PRICE_HISTORY_BUCKET_LABELS: Record<QuotationPriceHistoryBucket, string> = {
  DRAFT: "DRAFT — BELUM TERKIRIM",
  TERKIRIM: "TERKIRIM",
  KEDALUWARSA: "KEDALUWARSA",
  DITERIMA: "DITERIMA",
  DITOLAK: "DITOLAK",
  DITOLAK_OTOMATIS: "DITOLAK OTOMATIS",
  DIKONVERSI: "DIKONVERSI",
  STATUS_TIDAK_DIKENAL: "Status tidak dikenal",
}

const MS_PER_DAY = 86_400_000

export interface QuotationPriceEventInput {
  quotationId: number
  /** Id baris QuotationItem berjalan; seri terakhir urutan kejadian. */
  quotationItemId: number
  slug: string | null
  documentNo: string
  revisionNumber: number
  customerId: number
  customerName: string
  /** Null = baris deskripsi bebas; masuk ember tanpa-barang (BR-QPH-08). */
  itemId: number | null
  itemName: string | null
  itemSku: string | null
  description: string | null
  /** Tanggal penawaran (`Quotation.date`). */
  date: Date
  validUntil: Date | null
  /** Status tersimpan apa adanya; builder tidak pernah mengubahnya. */
  status: string
  /**
   * Loader menurunkan dari QuotationHistory action `auto_rejected`
   * untuk revisionNumber berjalan. Hanya relevan saat status rejected.
   * dataSnapshot histori TIDAK pernah dibaca (Q-QPH-3).
   */
  autoRejected?: boolean
  /**
   * Loader menegakkan `deletedAt: null` di query; builder tetap menolak
   * baris terhapus bila dipasok (AC-QPH-B1, pertahanan lapis kedua).
   */
  deletedAt?: Date | null
  qty: number
  uom: string | null
  unitPrice: number
  /** Diskon baris apa adanya, terpisah dari unitPrice (BR-QPH-05). */
  discount: number
  total: number
}

export interface QuotationPriceEvent extends QuotationPriceEventInput {
  emberStatus: QuotationPriceHistoryBucket
  /** Label ember verbatim untuk ditampilkan UI apa adanya. */
  emberLabel: string
  /** Status di luar kosakata §4: tampil mentah tertanda (BR-QPH-03). */
  statusTidakDikenal: boolean
  /** Ember KEDALUWARSA hasil turunan baca murni (BR-QPH-04). */
  kedaluwarsaTurunan: boolean
  /** Harga 0 (bonus/contoh) tampil apa adanya tertanda (EC-6). */
  hargaNol: boolean
  /** Tautan detail penawaran existing; gerbangnya `view_quotations`. */
  tautanDetail: string
}

export interface QuotationPricePairGroup {
  customerId: number
  customerName: string
  itemId: number
  itemName: string | null
  itemSku: string | null
  /**
   * Kejadian terbaru DALAM periode + saringan aktif (EC-7); persis satu
   * baris kejadian, bukan rata-rata/modus/mediana (BR-QPH-05).
   */
  penawaranTerakhir: QuotationPriceEvent
  /** Total kejadian pasangan dalam periode + saringan, sebelum dipotong. */
  jumlahKejadian: number
  /** Kejadian tampil sesudah batas per pasangan. */
  jumlahTampil: number
  /** True bila jumlahKejadian > jumlahTampil (putusan Q-QPH-4). */
  terpotong: boolean
  /** Hitungan faktual per ember; tanpa probabilitas (BR-QPH-06). */
  hitunganPerEmber: { ember: QuotationPriceHistoryBucket; label: string; count: number }[]
  /** Kejadian terbaru dulu, maks `QUOTATION_PRICE_HISTORY_MAX_EVENTS_PER_PAIR`. */
  kejadian: QuotationPriceEvent[]
}

export interface QuotationItemlessSummary {
  customerId: number
  customerName: string
  /** Hitungan baris itemId NULL dalam periode + saringan aktif. */
  count: number
  tanggalTerawal: Date
  tanggalTerbaru: Date
}

export interface QuotationPriceHistory {
  /** Notice BR-QPH-10 verbatim — selalu terisi. */
  notice: string
  /** Penanda revisi berjalan BR-QPH-11 verbatim — selalu terisi. */
  revisiBerjalanLabel: string
  periodeMulai: Date
  periodeSelesai: Date
  /** Saringan DRAFT eksplisit sedang menyala (default false, Q-QPH-4). */
  menyertakanDraft: boolean
  /** Saringan barang eksplisit; null = semua barang pelanggan. */
  itemId: number | null
  /** Ada pasangan yang kejadiannya terpotong batas per pasangan. */
  terpotong: boolean
  pasangan: QuotationPricePairGroup[]
  /** Ember tanpa-barang: hitungan ringkas saja (Q-QPH-5). */
  tanpaBarang: QuotationItemlessSummary[]
  jumlahPasangan: number
  /** Σ jumlahKejadian semua pasangan (sebelum potong per pasangan). */
  jumlahKejadian: number
}

export interface QuotationPriceHistoryOptions {
  periodeMulai: Date
  periodeSelesai: Date
  now?: Date
  /** Default false: DRAFT hanya tampil lewat saringan eksplisit (Q-QPH-4). */
  includeDraft?: boolean
  /** Saringan satu barang; null/undefined = semua barang pelanggan. */
  itemId?: number | null
  maxEventsPerPair?: number
}

/** Gerbang periode putusan Q-QPH-4; dipakai builder + loader. */
export function assertQuotationPriceHistoryPeriod(periodeMulai: Date, periodeSelesai: Date): void {
  if (!(periodeMulai instanceof Date) || Number.isNaN(periodeMulai.getTime())) {
    throw new Error("Periode mulai riwayat harga penawaran tidak sah.")
  }
  if (!(periodeSelesai instanceof Date) || Number.isNaN(periodeSelesai.getTime())) {
    throw new Error("Periode selesai riwayat harga penawaran tidak sah.")
  }
  if (periodeSelesai.getTime() < periodeMulai.getTime()) {
    throw new Error("Periode selesai riwayat harga penawaran mendahului periode mulai.")
  }
  const spanDays = Math.round((periodeSelesai.getTime() - periodeMulai.getTime()) / MS_PER_DAY)
  if (spanDays > QUOTATION_PRICE_HISTORY_MAX_PERIOD_DAYS) {
    throw new Error(
      `Periode riwayat harga penawaran melebihi batas maksimum ${QUOTATION_PRICE_HISTORY_MAX_PERIOD_DAYS} hari.`,
    )
  }
}

function isExpiredDerived(validUntil: Date | null, todayUtcMidnight: Date): boolean {
  if (!validUntil) return false
  return todayUtcMidnight.getTime() > validUntil.getTime()
}

/** Ember makna status pembawa harga (BR-QPH-02/03/04). Baca murni. */
export function deriveQuotationPriceBucket(
  input: Pick<QuotationPriceEventInput, "status" | "validUntil" | "autoRejected">,
  todayUtcMidnight: Date,
): QuotationPriceHistoryBucket {
  switch (input.status) {
    case "draft":
      return "DRAFT"
    case "sent":
      return isExpiredDerived(input.validUntil, todayUtcMidnight) ? "KEDALUWARSA" : "TERKIRIM"
    case "accepted":
    case "approved":
      return "DITERIMA"
    case "rejected":
      return input.autoRejected ? "DITOLAK_OTOMATIS" : "DITOLAK"
    case "converted":
      return "DIKONVERSI"
    default:
      return "STATUS_TIDAK_DIKENAL"
  }
}

/** Terbaru dulu: date, lalu documentNo, lalu id quotation, lalu id baris. */
function compareEventNewestFirst(a: QuotationPriceEvent, b: QuotationPriceEvent): number {
  const dateDiff = b.date.getTime() - a.date.getTime()
  if (dateDiff !== 0) return dateDiff
  const docDiff = b.documentNo.localeCompare(a.documentNo)
  if (docDiff !== 0) return docDiff
  if (a.quotationId !== b.quotationId) return b.quotationId - a.quotationId
  return b.quotationItemId - a.quotationItemId
}

export function buildQuotationPriceHistory(
  inputs: QuotationPriceEventInput[],
  options: QuotationPriceHistoryOptions,
): QuotationPriceHistory {
  assertQuotationPriceHistoryPeriod(options.periodeMulai, options.periodeSelesai)
  const today = getWibTodayUtcDate(options.now ?? new Date())
  const includeDraft = options.includeDraft ?? false
  const itemFilter = options.itemId ?? null
  const maxEvents = Math.max(
    1,
    Math.floor(options.maxEventsPerPair ?? QUOTATION_PRICE_HISTORY_MAX_EVENTS_PER_PAIR),
  )
  const startMs = options.periodeMulai.getTime()
  const endMs = options.periodeSelesai.getTime()

  const eventsByPair = new Map<string, QuotationPriceEvent[]>()
  const pairMeta = new Map<
    string,
    { customerId: number; customerName: string; itemId: number; itemName: string | null; itemSku: string | null }
  >()
  const itemlessByCustomer = new Map<number, QuotationItemlessSummary>()

  for (const input of inputs) {
    // AC-QPH-B1: penawaran terhapus keluar populasi seluruhnya.
    if (input.deletedAt != null) continue
    const dateMs = input.date.getTime()
    if (dateMs < startMs || dateMs > endMs) continue

    const emberStatus = deriveQuotationPriceBucket(input, today)
    // Q-QPH-4: DRAFT tidak tampil default; hanya saringan eksplisit.
    if (emberStatus === "DRAFT" && !includeDraft) continue

    // AC-QPH-B5: itemId NULL hanya ember tanpa-barang, tak dipasangkan.
    if (input.itemId == null) {
      const existing = itemlessByCustomer.get(input.customerId)
      if (!existing) {
        itemlessByCustomer.set(input.customerId, {
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

    const event: QuotationPriceEvent = {
      ...input,
      emberStatus,
      emberLabel: QUOTATION_PRICE_HISTORY_BUCKET_LABELS[emberStatus],
      statusTidakDikenal: emberStatus === "STATUS_TIDAK_DIKENAL",
      kedaluwarsaTurunan: emberStatus === "KEDALUWARSA",
      hargaNol: input.unitPrice === 0,
      tautanDetail: `/penjualan/penawaran/${input.slug ?? input.quotationId}`,
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

  const pasangan: QuotationPricePairGroup[] = []
  for (const [key, events] of eventsByPair) {
    const meta = pairMeta.get(key)
    if (!meta) continue
    const sorted = [...events].sort(compareEventNewestFirst)
    const tampil = sorted.slice(0, maxEvents)
    const counts = new Map<QuotationPriceHistoryBucket, number>()
    for (const event of sorted) counts.set(event.emberStatus, (counts.get(event.emberStatus) ?? 0) + 1)
    pasangan.push({
      ...meta,
      // sorted tidak kosong menurut konstruksi Map.
      penawaranTerakhir: sorted[0],
      jumlahKejadian: sorted.length,
      jumlahTampil: tampil.length,
      terpotong: sorted.length > tampil.length,
      hitunganPerEmber: QUOTATION_PRICE_HISTORY_BUCKETS.filter((ember) => (counts.get(ember) ?? 0) > 0).map(
        (ember) => ({
          ember,
          label: QUOTATION_PRICE_HISTORY_BUCKET_LABELS[ember],
          count: counts.get(ember) ?? 0,
        }),
      ),
      kejadian: tampil,
    })
  }

  // Pasangan dengan penawaran terakhir paling baru dulu; seri nama.
  pasangan.sort((a, b) => {
    const lastDiff = compareEventNewestFirst(a.penawaranTerakhir, b.penawaranTerakhir)
    if (lastDiff !== 0) return lastDiff
    const customerDiff = a.customerName.localeCompare(b.customerName)
    if (customerDiff !== 0) return customerDiff
    return (a.itemName ?? "").localeCompare(b.itemName ?? "")
  })

  const tanpaBarang = [...itemlessByCustomer.values()].sort((a, b) =>
    a.customerName.localeCompare(b.customerName),
  )

  return {
    notice: QUOTATION_PRICE_HISTORY_NOTICE_TEXT,
    revisiBerjalanLabel: QUOTATION_PRICE_HISTORY_CURRENT_REVISION_LABEL,
    periodeMulai: options.periodeMulai,
    periodeSelesai: options.periodeSelesai,
    menyertakanDraft: includeDraft,
    itemId: itemFilter,
    terpotong: pasangan.some((pair) => pair.terpotong),
    pasangan,
    tanpaBarang,
    jumlahPasangan: pasangan.length,
    jumlahKejadian: pasangan.reduce((sum, pair) => sum + pair.jumlahKejadian, 0),
  }
}
