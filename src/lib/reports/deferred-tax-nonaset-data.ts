/**
 * Pemuatan data sumber temporer NON-ASET pajak tangguhan (F-2026-10-23-126-V).
 *
 * Provisi garansi: saldo dibuktikan dari jurnal akun provisi terpetakan
 * `SystemSetting.warrantyProvisionAccountId` (210205) s.d. tanggal neraca —
 * kredit − debit jurnal POSTED+REVERSED (`REPORT_JOURNAL_STATUSES`), jurnal
 * terhapus dikecualikan, agar pasangan reversal neto nol. Akun belum
 * terpetakan -> null (belum tersedia bernama). Flag rute provisi TIDAK dibaca:
 * ketiadaan jurnal yang terhitung sendirilah bukti nol (Putusan 1).
 *
 * CKPN: inti penyisihan F-090-V belum ada di schema (akun kontra 110302 usulan
 * F-090-V hari ini = Uang Muka Pembelian) -> null, tampil belum tersedia
 * bernama. DILARANG tarik ECL dari aging berjalan.
 *
 * Rugi fiskal: register input terstruktur kertas kerja SPT belum dibangun
 * (usulan bentuk data ke BOT 4 dulu sebelum migrasi, per vonis Batas build)
 * -> daftar kosong, tampil belum tersedia bernama. DILARANG turunkan dari
 * laba GL/jurnal penutup.
 */

import { prisma } from "@/lib/db/prisma"
import { REPORT_JOURNAL_STATUSES } from "@/lib/services/report-aggregation.service"
import { DEFERRED_TAX_NOTICE } from "@/lib/reports/deferred-tax"
import {
  buildDeferredTaxNonAssetSources,
  type CkpnInput,
  type DeferredTaxNonAssetResult,
  type FiscalLossYearInput,
  type WarrantyProvisionInput,
} from "@/lib/reports/deferred-tax-nonaset"
import type { DeferredTaxRateSource } from "@/lib/reports/deferred-tax"

export { DEFERRED_TAX_NOTICE }

export interface DeferredTaxNonAssetReport {
  report: DeferredTaxNonAssetResult
  notice: string
}

export async function loadDeferredTaxNonAssetSources(input: {
  taxRatePercent: number | null
  rateSource?: DeferredTaxRateSource
  asOf: Date
}): Promise<DeferredTaxNonAssetReport> {
  const settings = await prisma.systemSetting.findFirst({
    select: { warrantyProvisionAccountId: true },
  })
  const provisionAccountId = settings?.warrantyProvisionAccountId ?? null

  let provision: WarrantyProvisionInput
  if (provisionAccountId === null) {
    provision = { postedProvisionBalance: null, postedProvisionJournalCount: 0, profitBasisFrozen: false }
  } else {
    const [agg, count] = await Promise.all([
      prisma.journalEntry.aggregate({
        where: {
          accountId: provisionAccountId,
          journal: { status: { in: [...REPORT_JOURNAL_STATUSES] }, deletedAt: null, transactionDate: { lte: input.asOf } },
        },
        _sum: { debit: true, credit: true },
      }),
      prisma.journalEntry.count({
        where: {
          accountId: provisionAccountId,
          journal: { status: { in: [...REPORT_JOURNAL_STATUSES] }, deletedAt: null, transactionDate: { lte: input.asOf } },
        },
      }),
    ])
    const balance =
      Number(agg._sum.credit ?? 0) - Number(agg._sum.debit ?? 0)
    provision = {
      postedProvisionBalance: balance,
      postedProvisionJournalCount: count,
      // ponytail: dasar laba terbekukan belum ada peristiwa terbekukan —
      // label tetap belum-teruji sampai uji Putusan 4 dipasok peristiwa.
      profitBasisFrozen: false,
    }
  }

  // ponytail: inti F-090-V belum merged — jangan karang saldo dari aging.
  const ckpn: CkpnInput = { postedAllowanceBalance: null, writeOffs: [], profitBasisFrozen: false }
  // ponytail: register rugi fiskal belum dibangun — jangan turunkan dari GL.
  const fiscalLossYears: FiscalLossYearInput[] = []

  const report = buildDeferredTaxNonAssetSources({
    provision,
    ckpn,
    fiscalLossYears,
    taxRatePercent: input.taxRatePercent,
    rateSource: input.rateSource ?? "operator",
    asOf: input.asOf,
  })
  return { report, notice: DEFERRED_TAX_NOTICE }
}
