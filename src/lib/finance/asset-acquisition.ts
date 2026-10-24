/**
 * Perolehan aset tetap NON-KAS — klasifikasi jenis, lawan kredit, dan
 * dasar fiskal, lapis aman vonis BOT 4 F-2026-10-23-120-V (PR #635 MERGED).
 *
 * Lapisan ini MURNI (tanpa Prisma/DB/jurnal/schema): kontrak hitung yang
 * akan dipakai inti perolehan. Kode akun TIDAK hidup di sini — lawan
 * kredit hanya dinyatakan sebagai KELAS lawan; resolver kode akun dari
 * mapping existing (Utang Usaha, Modal Saham 300003, pendapatan hibah
 * terpetakan) adalah urusan inti sesudah usulan kode akun hibah divonis
 * BOT 4 (Batas build F-120-V). Kelas lawan yang mapping-nya kosong wajib
 * ditolak inti berdasar `counterpartMapped` di bawah (E120-7).
 *
 * Putusan yang dibekukan di sini:
 *  - P1: jenis perolehan terdaftar wajib untuk perolehan berharga; jenis
 *    kosong/teks bebas DITOLAK (E120-2). Lawan kredit mengikuti jenis,
 *    bukan selalu Kas/Bank (E120-1/E120-5).
 *  - P2 / UU PPh Pasal 10: dasar fiskal per jenis — harga sesungguhnya;
 *    harga pasar untuk hubungan istimewa (E120-10), tukar-menukar
 *    (E120-4), hibah tak terkecuali, dan setoran modal. Hibah memenuhi
 *    Pasal 4(3)(a): dasar = nilai sisa buku fiskal pemberi DAN fiskal
 *    TIDAK dapat disusutkan (E120-3). Status pengecualian ragu bukan
 *    pilihan operator di sini: input wajib eksplisit dari dokumen;
 *    builder tidak menebak.
 *  - P3: PPN Masukan HANYA dari faktur pajak tertaut; builder tidak
 *    menerima tarif dan tidak menghitung PPN dari harga perolehan
 *    (E120-6). Dokumen sumber wajib untuk perolehan non-kas.
 *
 * Inti (kolom jenis/dokumen/dasar fiskal snapshot, jurnal per jenis,
 * pembayaran CREDIT lewat jalur utang existing, idempotency dokumen)
 * DITUNDA mengikuti Batas build F-120-V.
 */

import { Prisma } from "@prisma/client"

const ZERO = new Prisma.Decimal(0)

function dec(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value)
}

export const ASSET_ACQUISITION_TYPES = [
  "CASH_PURCHASE",
  "CREDIT_PURCHASE",
  "GRANT_DONATION",
  "CAPITAL_CONTRIBUTION",
  "EXCHANGE",
] as const

export type AssetAcquisitionType = (typeof ASSET_ACQUISITION_TYPES)[number]

export function isRegisteredAcquisitionType(
  value: string | null | undefined,
): value is AssetAcquisitionType {
  return (
    value != null &&
    (ASSET_ACQUISITION_TYPES as readonly string[]).includes(value)
  )
}

/** Kelas lawan kredit Dr Aset Tetap; kode akun di-resolve inti dari mapping. */
export type AcquisitionCounterpartKind =
  | "cash-bank"
  | "accounts-payable"
  | "grant-income"
  | "equity"
  | "exchange-settlement"

const COUNTERPART_BY_TYPE: Record<AssetAcquisitionType, AcquisitionCounterpartKind> = {
  CASH_PURCHASE: "cash-bank",
  CREDIT_PURCHASE: "accounts-payable",
  GRANT_DONATION: "grant-income",
  CAPITAL_CONTRIBUTION: "equity",
  EXCHANGE: "exchange-settlement",
}

export interface AssetAcquisitionInput {
  /** Jenis perolehan terdaftar; wajib bila `purchaseCost > 0` (E120-2). */
  acquisitionType: string | null | undefined
  /** Harga perolehan komersial sen persis dari dokumen sumber. */
  purchaseCost: Prisma.Decimal | number | string
  /** Nomor/dokumen sumber (faktur vendor/akta hibah/BA setoran/BA tukar). Wajib non-kas (P3). */
  sourceDocumentRef: string | null | undefined
  /** Pihak berelasi terstruktur (Pasal 10(1)); true = dasar fiskal harga pasar. */
  isRelatedParty: boolean | null | undefined
  /** Harga pasar dari penilaian terstruktur; wajib bila dasar pasar dipakai. */
  marketValue: Prisma.Decimal | number | string | null | undefined
  /** Nama penilai + rujukan penilaian; wajib mendampingi `marketValue`. */
  marketValueAssessor: string | null | undefined
  /** Hibah memenuhi pengecualian Pasal 4(3)(a) per dokumen (fakta, bukan tebakan). */
  grantIsExempt: boolean | null | undefined
  /** Nilai sisa buku fiskal pemberi; dasar fiskal hibah terkecuali (Pasal 10(4)). */
  grantorFiscalBookValue: Prisma.Decimal | number | string | null | undefined
  /** Nilai tercatat jurnal aset diserahkan (EXCHANGE tanpa nilai wajar andal, PSAK 16). */
  surrenderedAssetCarryingAmount: Prisma.Decimal | number | string | null | undefined
  /** Faktur pajak masukan tertaut dokumen pembelian ada (P3). */
  hasLinkedTaxInvoice: boolean | null | undefined
  /** PPN Masukan dari faktur tertaut itu (sen persis); diabaikan bila tak tertaut. */
  linkedInputVatAmount: Prisma.Decimal | number | string | null | undefined
  /**
   * Mapping akun lawan untuk jenis ini sudah terisi di inti.
   * CASH_PURCHASE existing selalu terpetakan; jenis lain false/kosong =
   * ditolak berisik (E120-7). Kode akunnya sendiri bukan urusan builder.
   */
  counterpartMapped: boolean | null | undefined
}

export type AssetAcquisitionResult =
  | {
      status: "no-journal"
      /** Aset warisan `purchaseCost = 0` existing: boleh tanpa jurnal (P4). */
      reason: "zero-cost-legacy"
    }
  | {
      status: "reject"
      reason:
        | "unregistered-acquisition-type"
        | "missing-source-document"
        | "missing-counterpart-account"
        | "missing-market-value"
        | "missing-assessor"
        | "missing-grantor-fiscal-book-value"
        | "missing-surrendered-carrying-amount"
    }
  | {
      status: "resolved"
      acquisitionType: AssetAcquisitionType
      counterpartKind: AcquisitionCounterpartKind
      /** Basis penyusutan komersial sen persis (P1). */
      commercialBasis: Prisma.Decimal
      /** Dasar fiskal beku Pasal 10 sen persis (P2); tidak meniru lawan komersial. */
      fiscalBasis: Prisma.Decimal
      fiscalBasisSource:
        | "actual-price"
        | "market-value"
        | "grantor-fiscal-book-value"
      /** false hanya hibah terkecuali Pasal 4(3)(a): fiskal tak dapat disusutkan (E120-3). */
      fiscalDepreciable: boolean
      /** PPN Masukan diakui: hanya dari faktur tertaut, nol selain itu (E120-6). */
      inputVatAmount: Prisma.Decimal
      vatEvidence: "linked-invoice" | "none"
    }

/**
 * Klasifikasi perolehan berharga. Urutan gerbang: jenis terdaftar ->
 * dokumen sumber -> mapping lawan -> dasar per jenis. Satu gerbang gugur
 * = reject bernama, nol angka dikarang.
 */
export function resolveAssetAcquisition(
  input: AssetAcquisitionInput,
): AssetAcquisitionResult {
  const cost = dec(input.purchaseCost)
  if (cost.lte(ZERO)) return { status: "no-journal", reason: "zero-cost-legacy" }

  if (!isRegisteredAcquisitionType(input.acquisitionType)) {
    return { status: "reject", reason: "unregistered-acquisition-type" }
  }
  const type = input.acquisitionType

  // P3: perolehan non-kas tanpa dokumen sumber ditolak; tunai existing
  // tidak diperketat surut.
  if (type !== "CASH_PURCHASE" && !input.sourceDocumentRef?.trim()) {
    return { status: "reject", reason: "missing-source-document" }
  }

  if (type !== "CASH_PURCHASE" && input.counterpartMapped !== true) {
    return { status: "reject", reason: "missing-counterpart-account" }
  }

  const marketValue =
    input.marketValue == null ? null : dec(input.marketValue)
  const assessor = input.marketValueAssessor?.trim()
  const requireMarketValue = (): AssetAcquisitionResult | null => {
    if (marketValue == null || marketValue.lte(ZERO)) {
      return { status: "reject", reason: "missing-market-value" }
    }
    if (!assessor) return { status: "reject", reason: "missing-assessor" }
    return null
  }

  let commercialBasis = cost
  let fiscalBasis = cost
  let fiscalBasisSource: "actual-price" | "market-value" | "grantor-fiscal-book-value" =
    "actual-price"
  let fiscalDepreciable = true

  if (type === "GRANT_DONATION") {
    if (input.grantIsExempt === true) {
      // Pasal 10(4): dasar = nilai sisa buku fiskal pemberi; penyusutan
      // fiskal atas hibah terkecuali TIDAK dapat dikurangkan (E120-3).
      if (
        input.grantorFiscalBookValue == null ||
        dec(input.grantorFiscalBookValue).lt(ZERO)
      ) {
        return { status: "reject", reason: "missing-grantor-fiscal-book-value" }
      }
      fiscalBasis = dec(input.grantorFiscalBookValue)
      fiscalBasisSource = "grantor-fiscal-book-value"
      fiscalDepreciable = false
    } else {
      const rejected = requireMarketValue()
      if (rejected) return rejected
      fiscalBasis = marketValue!
      fiscalBasisSource = "market-value"
    }
  } else if (type === "CAPITAL_CONTRIBUTION") {
    // Pasal 10(6): setoran modal berupa harta = harga pasar.
    const rejected = requireMarketValue()
    if (rejected) return rejected
    fiscalBasis = marketValue!
    fiscalBasisSource = "market-value"
  } else if (type === "EXCHANGE") {
    // Pasal 10(2): fiskal selalu harga pasar (E120-4); komersial nilai
    // wajar bila andal, selain itu nilai tercatat aset diserahkan.
    const rejected = requireMarketValue()
    if (rejected) return rejected
    fiscalBasis = marketValue!
    fiscalBasisSource = "market-value"
    if (
      input.surrenderedAssetCarryingAmount != null &&
      dec(input.surrenderedAssetCarryingAmount).gte(ZERO)
    ) {
      commercialBasis = dec(input.surrenderedAssetCarryingAmount)
    }
  } else if (input.isRelatedParty === true) {
    // CASH/CREDIT pihak berelasi: Pasal 10(1) harga pasar (E120-10).
    const rejected = requireMarketValue()
    if (rejected) return rejected
    fiscalBasis = marketValue!
    fiscalBasisSource = "market-value"
  }

  // E120-6: PPN tidak pernah dihitung dari harga perolehan di sini.
  const hasInvoice = input.hasLinkedTaxInvoice === true
  const inputVatAmount =
    hasInvoice && input.linkedInputVatAmount != null
      ? dec(input.linkedInputVatAmount).toDecimalPlaces(2)
      : ZERO

  return {
    status: "resolved",
    acquisitionType: type,
    counterpartKind: COUNTERPART_BY_TYPE[type],
    commercialBasis: commercialBasis.toDecimalPlaces(2),
    fiscalBasis: fiscalBasis.toDecimalPlaces(2),
    fiscalBasisSource,
    fiscalDepreciable,
    inputVatAmount,
    vatEvidence: hasInvoice ? "linked-invoice" : "none",
  }
}
