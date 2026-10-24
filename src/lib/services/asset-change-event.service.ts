/**
 * Service inti peristiwa perubahan aset terbekukan — gabungan vonis BOT 4
 * F-2026-10-23-111-V + F-2026-10-23-115-V, gerbang akun F-2026-10-23-128-V.
 *
 * Service ini SATU-SATUNYA penulis `asset_change_events`. Semua hitung di
 * builder murni `asset-change-event.ts`; service hanya: baca fakta jurnal
 * POSTED, resolusi mapping kategori (fail-closed per peran di builder),
 * `assertPeriodOpen` DALAM tx, anti-replay dokumen sumber, tulis peristiwa +
 * jurnal pasangan + terapkan efek berjalan (reklasifikasi pindah kategori;
 * ganti metode/estimasi timpa kolom berjalan HANYA lewat peristiwa ini).
 * Koreksi = reversal periode terbuka membaca snapshot akun peristiwa asal,
 * bukan mapping berjalan (E128-4). Pajak tangguhan TIDAK dijurnal di sini
 * (F-111-V Putusan 4(d) di luar vonis; read-model F-125 membaca peristiwa).
 *
 * Semantik referensi jurnal: jurnal peristiwa menunjuk ASET
 * (`referenceId = assetId`, `referenceType = ASSET_CHANGE_EVENT`) — pola
 * sama ASSET_ACQUISITION, supaya pembaca per-aset menemukannya. Fakta
 * POSTED peristiwa sendiri dibaca lewat join `AssetChangeEvent.journalId`
 * (satu jurnal per peristiwa), BUKAN dari referenceId: peristiwa ke-2 dst
 * aset sama wajib melihat jurnal peristiwa sebelumnya persis.
 */

import { Prisma } from "@prisma/client"

import { prisma, type TxClient } from "@/lib/db/prisma"
import { assertPeriodOpen } from "@/lib/services/period-lock.service"
import { journalBookValue } from "@/lib/finance/asset-book-value"
import {
  buildAssetChangeEvent,
  ASSET_CHANGE_EVENT_REFERENCE_TYPE,
  type AssetChangeEventKind,
  type AssetChangeEventRequest,
  type AssetPostedFacts,
  type BuiltAssetChangeEvent,
  type CategoryAccountMapping,
  type MappedAccount,
} from "@/lib/finance/asset-change-event"

export type { AssetChangeEventKind }

interface AccountRow {
  id: number
  code: string
  type: string
  reportGroup: string | null
  isActive: boolean
}

interface CategoryRow {
  name: string
  assetAccountId: number | null
  accumulatedDepreciationAccountId: number | null
  revaluationSurplusAccountId: number | null
  impairmentLossAccountId: number | null
  accumulatedImpairmentAccountId: number | null
}

function toMapped(row: AccountRow | null | undefined): MappedAccount | null {
  if (!row) return null
  return { id: row.id, code: row.code, type: row.type, reportGroup: row.reportGroup, isActive: row.isActive }
}

async function loadAccount(tx: TxClient, id: number | null | undefined): Promise<MappedAccount | null> {
  if (id == null) return null
  const row = await tx.account.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, code: true, type: true, reportGroup: true, isActive: true },
  })
  return toMapped(row)
}

async function loadMapping(tx: TxClient, category: CategoryRow): Promise<CategoryAccountMapping> {
  const [assetAccount, accumulatedDepreciationAccount, revaluationSurplusAccount, impairmentLossAccount, accumulatedImpairmentAccount] =
    await Promise.all([
      loadAccount(tx, category.assetAccountId),
      loadAccount(tx, category.accumulatedDepreciationAccountId),
      loadAccount(tx, category.revaluationSurplusAccountId),
      loadAccount(tx, category.impairmentLossAccountId),
      loadAccount(tx, category.accumulatedImpairmentAccountId),
    ])
  return {
    categoryName: category.name,
    assetAccount,
    accumulatedDepreciationAccount,
    revaluationSurplusAccount,
    impairmentLossAccount,
    accumulatedImpairmentAccount,
  }
}

const CATEGORY_SELECT = {
  id: true,
  name: true,
  assetAccountId: true,
  accumulatedDepreciationAccountId: true,
  revaluationSurplusAccountId: true,
  impairmentLossAccountId: true,
  accumulatedImpairmentAccountId: true,
  taxGroupCode: true,
} as const

type JournalEntryRow = { accountId: number; debit: Prisma.Decimal; credit: Prisma.Decimal }
type JournalRow = { referenceType: string | null; entries: JournalEntryRow[] }

function sumAccountNet(journals: JournalRow[], accountId: number | null, side: "debit" | "credit"): Prisma.Decimal {
  if (accountId == null) return new Prisma.Decimal(0)
  const other = side === "debit" ? "credit" : "debit"
  let total = new Prisma.Decimal(0)
  for (const j of journals) {
    for (const e of j.entries) {
      if (e.accountId !== accountId) continue
      total = total.add(e[side]).sub(e[other])
    }
  }
  return total
}

/** Nilai tercatat jurnal POSTED termasuk kontra impairment peristiwa F-111. */
async function loadPostedFacts(tx: TxClient, assetId: number, mapping: CategoryAccountMapping): Promise<{
  facts: AssetPostedFacts
}> {
  const asset = await tx.asset.findUniqueOrThrow({
    where: { id: assetId },
    select: { status: true },
  })
  // Jurnal siklus hidup per-aset (perolehan/pelepasan/penyusutan) menunjuk
  // aset lewat referenceId — pola existing.
  const lifecycleJournals: JournalRow[] = await tx.journal.findMany({
    where: {
      referenceId: assetId,
      status: "POSTED",
      deletedAt: null,
      OR: [
        { referenceType: "ASSET_ACQUISITION" },
        { referenceType: "ASSET_DISPOSAL" },
        { referenceType: { startsWith: "ASSET_DEPRECIATION_" } },
      ],
    },
    select: {
      referenceType: true,
      entries: { select: { accountId: true, debit: true, credit: true } },
    },
  })
  // Jurnal peristiwa dibaca lewat join peristiwa POSTED (journalId), bukan
  // referenceId — peristiwa susulan wajib melihat jurnal peristiwa lampau.
  const events = await tx.assetChangeEvent.findMany({
    where: { assetId, status: "POSTED" },
    select: {
      kind: true,
      effectiveDate: true,
      journalId: true,
      revaluationSurplusAfter: true,
      fiscalBaseAfter: true,
    },
    orderBy: [{ effectiveDate: "asc" }, { id: "asc" }],
  })
  const eventJournalIds = events.map((e) => e.journalId).filter((id): id is number => id != null)
  const eventJournals: JournalRow[] = eventJournalIds.length
    ? await tx.journal.findMany({
        where: { id: { in: eventJournalIds }, status: "POSTED", deletedAt: null },
        select: {
          referenceType: true,
          entries: { select: { accountId: true, debit: true, credit: true } },
        },
      })
    : []
  const allJournals = [...lifecycleJournals, ...eventJournals]
  const posted = journalBookValue(
    allJournals.map((j) => ({
      referenceType: j.referenceType ?? "",
      lines: j.entries.map((e) => ({ accountId: e.accountId, debit: e.debit, credit: e.credit })),
    })),
    {
      fixedAssetAccountId: mapping.assetAccount?.id ?? null,
      accumulatedDepreciationAccountId: mapping.accumulatedDepreciationAccount?.id ?? null,
    },
  )
  const lastEvent = events[events.length - 1]
  const lastFiscal = [...events].reverse().find((e) => e.kind === "FISCAL_REVALUATION_APPROVED")
  const facts: AssetPostedFacts = {
    assetStatus: asset.status,
    hasAcquisitionJournal: posted.hasAcquisitionJournal,
    grossCostPosted: posted.grossCostPosted,
    accumulatedPosted: posted.accumulatedPosted,
    accumulatedImpairmentPosted: Prisma.Decimal.max(
      new Prisma.Decimal(0),
      sumAccountNet(eventJournals, mapping.accumulatedImpairmentAccount?.id ?? null, "credit"),
    ),
    disposalGrossPosted: posted.disposalGrossPosted,
    revaluationSurplusPerAsset: lastEvent?.revaluationSurplusAfter ?? new Prisma.Decimal(0),
    priorLossChargedToProfitOrLoss: Prisma.Decimal.max(
      new Prisma.Decimal(0),
      sumAccountNet(eventJournals, mapping.impairmentLossAccount?.id ?? null, "debit"),
    ),
    lastFiscalRevaluationDate: lastFiscal?.effectiveDate ?? null,
  }
  return { facts }
}

async function nextJournalNumber(tx: TxClient, date: Date): Promise<string> {
  const seq = await tx.documentSequence.upsert({
    where: { key: "JOURNAL" },
    update: { currentValue: { increment: 1 } },
    create: { key: "JOURNAL", currentValue: 1 },
  })
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  return `JRN-${y}${m}-${String(seq.currentValue).padStart(5, "0")}`
}

function isSourceKeyConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  const rec = error as Record<string, unknown>
  if (rec.code !== "P2002") return false
  const meta = rec.meta as Record<string, unknown> | undefined
  const target = meta ? String(meta.target ?? "") : ""
  const message = error instanceof Error ? error.message : ""
  return /source_document|reference/i.test(target) || /source_document|reference/i.test(message)
}

async function assertSourceDocumentUnused(tx: TxClient, sourceDocumentKey: string): Promise<void> {
  const replay = await tx.assetChangeEvent.findUnique({
    where: { sourceDocumentKey },
    select: { id: true },
  })
  if (replay) {
    throw new Error(
      `Dokumen sumber "${sourceDocumentKey}" sudah melahirkan peristiwa #${replay.id}; replay ditolak (satu dokumen satu peristiwa).`,
    )
  }
}

interface SnapshotAccounts {
  surplusAccountId: number | null
  surplusAccountCode: string | null
  impairmentLossAccountId: number | null
  impairmentLossAccountCode: string | null
  accumulatedImpairmentAccountId: number | null
  accumulatedImpairmentAccountCode: string | null
  fixedAssetAccountId: number | null
  fixedAssetAccountCode: string | null
  accumulatedDepreciationAccountId: number | null
  accumulatedDepreciationAccountCode: string | null
  taxPayableAccountId: number | null
  taxPayableAccountCode: string | null
  toFixedAssetAccountId: number | null
  toFixedAssetAccountCode: string | null
  toAccumulatedDepreciationAccountId: number | null
  toAccumulatedDepreciationAccountCode: string | null
  toAccumulatedImpairmentAccountId: number | null
  toAccumulatedImpairmentAccountCode: string | null
}

function snapshotOf(mapping: CategoryAccountMapping, toMapping: CategoryAccountMapping | null, taxPayable: MappedAccount | null | undefined): SnapshotAccounts {
  const pair = (a: MappedAccount | null | undefined) => ({ id: a?.id ?? null, code: a?.code ?? null })
  const surplus = pair(mapping.revaluationSurplusAccount)
  const loss = pair(mapping.impairmentLossAccount)
  const contra = pair(mapping.accumulatedImpairmentAccount)
  const asset = pair(mapping.assetAccount)
  const accum = pair(mapping.accumulatedDepreciationAccount)
  const toAsset = pair(toMapping?.assetAccount)
  const toAccum = pair(toMapping?.accumulatedDepreciationAccount)
  const toContra = pair(toMapping?.accumulatedImpairmentAccount)
  const tax = pair(taxPayable)
  return {
    surplusAccountId: surplus.id, surplusAccountCode: surplus.code,
    impairmentLossAccountId: loss.id, impairmentLossAccountCode: loss.code,
    accumulatedImpairmentAccountId: contra.id, accumulatedImpairmentAccountCode: contra.code,
    fixedAssetAccountId: asset.id, fixedAssetAccountCode: asset.code,
    accumulatedDepreciationAccountId: accum.id, accumulatedDepreciationAccountCode: accum.code,
    taxPayableAccountId: tax.id, taxPayableAccountCode: tax.code,
    toFixedAssetAccountId: toAsset.id, toFixedAssetAccountCode: toAsset.code,
    toAccumulatedDepreciationAccountId: toAccum.id, toAccumulatedDepreciationAccountCode: toAccum.code,
    toAccumulatedImpairmentAccountId: toContra.id, toAccumulatedImpairmentAccountCode: toContra.code,
  }
}

/**
 * Tulis jurnal pasangan (bila ada baris) + baris peristiwa — langkah bersama
 * posting/reklasifikasi. Jurnal menunjuk aset (referenceId = assetId);
 * tautan jurnal <-> peristiwa lewat `AssetChangeEvent.journalId`.
 */
async function createJournalAndEvent(
  tx: TxClient,
  args: {
    assetId: number
    assetLabel: string
    descriptionPrefix: string
    event: BuiltAssetChangeEvent
    effectiveDate: Date
    sourceDocumentKey: string
    createdBy: number | null | undefined
    eventData: Record<string, unknown>
  },
): Promise<{ eventId: number; journalId: number | null; journalNumber: string | null }> {
  const { event } = args
  let journalId: number | null = null
  let journalNumber: string | null = null
  if (event.lines.length > 0) {
    journalNumber = await nextJournalNumber(tx, args.effectiveDate)
    const totalDebit = event.lines.reduce((sum, l) => sum.add(l.debit), new Prisma.Decimal(0))
    const totalCredit = event.lines.reduce((sum, l) => sum.add(l.credit), new Prisma.Decimal(0))
    const journal = await tx.journal.create({
      data: {
        journalNumber,
        transactionDate: args.effectiveDate,
        referenceType: ASSET_CHANGE_EVENT_REFERENCE_TYPE,
        referenceId: args.assetId,
        description: `${args.descriptionPrefix} aset: ${args.assetLabel}`,
        type: ASSET_CHANGE_EVENT_REFERENCE_TYPE,
        status: "POSTED",
        totalDebit,
        totalCredit,
        createdBy: args.createdBy ?? null,
        entries: {
          create: event.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, memo: l.memo })),
        },
      },
      select: { id: true },
    })
    journalId = journal.id
  }
  const created = await tx.assetChangeEvent.create({
    data: {
      assetId: args.assetId,
      kind: event.kind,
      status: "POSTED",
      effectiveDate: args.effectiveDate,
      sourceDocumentKey: args.sourceDocumentKey,
      journalId,
      carryingBefore: event.carryingBefore,
      carryingAfter: event.carryingAfter,
      grossBefore: event.grossBefore,
      accumulatedBefore: event.accumulatedBefore,
      accumulatedImpairmentBefore: event.accumulatedImpairmentBefore,
      revaluationSurplusBefore: event.revaluationSurplusBefore,
      revaluationSurplusAfter: event.revaluationSurplusAfter,
      fiscalBaseBefore: event.fiscalBaseBefore,
      fiscalBaseAfter: event.fiscalBaseAfter,
      fiscalSurplusAmount: event.fiscalSurplusAmount,
      finalTaxRatePercent: event.finalTaxRatePercent,
      finalTaxAmount: event.finalTaxAmount,
      fiscalUsefulLifeMonthsAfter: event.fiscalUsefulLifeMonthsAfter,
      createdBy: args.createdBy ?? null,
      ...args.eventData,
    } as Prisma.AssetChangeEventUncheckedCreateInput,
    select: { id: true },
  })
  return { eventId: created.id, journalId, journalNumber }
}

export interface PostAssetChangeEventInput {
  assetId: number
  request: AssetChangeEventRequest
  createdBy?: number | null
}

export interface PostAssetChangeEventResult {
  eventId: number
  journalId: number | null
  journalNumber: string | null
  kind: AssetChangeEventKind
}

/**
 * Posting satu peristiwa perubahan aset terbekukan. Gagal di gerbang mana
 * pun = throw berisik dan tx rollback: nol peristiwa, nol jurnal.
 */
export async function postAssetChangeEvent(
  input: PostAssetChangeEventInput,
): Promise<PostAssetChangeEventResult> {
  const { assetId, request } = input
  try {
    return await prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({
        where: { id: assetId },
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          categoryId: true,
          depreciationMethod: true,
          residualValue: true,
          usefulLifeMonths: true,
          category: { select: CATEGORY_SELECT },
        },
      })
      if (!asset) throw new Error("Aset tidak ditemukan.")
      if (!asset.category) {
        throw new Error("Aset belum berkategori; peristiwa perubahan aset wajib kategori terpetakan.")
      }

      if (request.kind === "RECLASSIFICATION") {
        throw new Error("Reklasifikasi wajib lewat postAssetReclassification (kategori tujuan eksplisit).")
      }

      await assertSourceDocumentUnused(tx, request.sourceDocumentKey)

      const mapping = await loadMapping(tx, asset.category)

      const { facts } = await loadPostedFacts(tx, assetId, mapping)

      // Tarif + akun pajak fiskal dari master setting (data, bukan konstanta).
      let enriched: AssetChangeEventRequest = { ...request }
      if (request.kind === "FISCAL_REVALUATION_APPROVED") {
        const settings = await tx.systemSetting.findFirst({
          select: {
            assetFiscalRevaluationTaxPayableAccountId: true,
            assetFiscalRevaluationFinalTaxRatePercent: true,
          },
        })
        const taxPayableAccount = await loadAccount(tx, settings?.assetFiscalRevaluationTaxPayableAccountId)
        const lastFiscalEvent = await tx.assetChangeEvent.findFirst({
          where: { assetId, status: "POSTED", fiscalBaseAfter: { not: null } },
          orderBy: [{ effectiveDate: "desc" }, { id: "desc" }],
          select: { fiscalBaseAfter: true },
        })
        enriched = {
          ...enriched,
          taxPayableAccount,
          finalTaxRatePercent: settings?.assetFiscalRevaluationFinalTaxRatePercent ?? null,
          fiscalBaseBefore: request.fiscalBaseBefore ?? lastFiscalEvent?.fiscalBaseAfter ?? null,
          fiscalGroupCode: request.fiscalGroupCode ?? asset.category.taxGroupCode,
        }
      }
      if (request.kind === "FISCAL_METHOD_CHANGE") {
        enriched = { ...enriched, fiscalGroupCode: request.fiscalGroupCode ?? asset.category.taxGroupCode }
      }
      if (request.kind === "COMMERCIAL_METHOD_CHANGE" && !enriched.oldMethod) {
        enriched = { ...enriched, oldMethod: asset.depreciationMethod }
      }

      const built = buildAssetChangeEvent({ request: enriched, facts, mapping })
      if (!built.ok) throw new Error(built.error)
      const event = built.event

      await assertPeriodOpen(request.effectiveDate, tx)

      const result = await createJournalAndEvent(tx, {
        assetId,
        assetLabel: `${asset.name} (${asset.code})`,
        descriptionPrefix: `Peristiwa ${event.kind}`,
        event,
        effectiveDate: request.effectiveDate,
        sourceDocumentKey: request.sourceDocumentKey,
        createdBy: input.createdBy,
        eventData: {
          sourceDocumentRef: request.appraiserReportRef ?? null,
          appraiserName: request.appraiserName ?? null,
          revaluedClassName: request.revaluedClassName ?? null,
          impairmentIndicator: request.impairmentIndicator ?? null,
          recoverableBasis: request.recoverableBasis ?? null,
          recoverableAmount: request.recoverableAmount != null ? new Prisma.Decimal(request.recoverableAmount) : null,
          carryingWithoutImpairment: request.carryingWithoutImpairment != null ? new Prisma.Decimal(request.carryingWithoutImpairment) : null,
          isGoodwillOrNonAmortizing: request.isGoodwillOrNonAmortizing ?? false,
          fromCategoryId: asset.categoryId,
          toCategoryId: null,
          reasonCode: request.reasonCode ?? null,
          approvedByName: request.approvedByName ?? null,
          oldMethod: enriched.oldMethod ?? null,
          newMethod: request.newMethod ?? null,
          oldUsefulLifeMonths: asset.usefulLifeMonths,
          newUsefulLifeMonths: request.newUsefulLifeMonths ?? null,
          oldResidualValue: asset.residualValue,
          newResidualValue: request.newResidualValue != null ? new Prisma.Decimal(request.newResidualValue) : null,
          djpApprovalNumber: request.djpApprovalNumber ?? null,
          djpApprovalDate: request.djpApprovalDate ?? null,
          fiscalGroupCode: enriched.fiscalGroupCode ?? null,
          fiscalMethodBefore: request.kind === "FISCAL_METHOD_CHANGE" ? (request.oldMethod ?? null) : null,
          fiscalMethodAfter: request.kind === "FISCAL_METHOD_CHANGE" ? (request.newMethod ?? null) : null,
          ...snapshotOf(mapping, null, enriched.taxPayableAccount),
        },
      })

      // Efek berjalan — HANYA lewat peristiwa ini (F-115 P2/P4).
      if (event.kind === "COMMERCIAL_METHOD_CHANGE" && request.newMethod) {
        await tx.asset.update({ where: { id: assetId }, data: { depreciationMethod: request.newMethod } })
      }
      if (event.kind === "ESTIMATE_CHANGE") {
        await tx.asset.update({
          where: { id: assetId },
          data: {
            ...(request.newUsefulLifeMonths != null ? { usefulLifeMonths: request.newUsefulLifeMonths } : {}),
            ...(request.newResidualValue != null ? { residualValue: new Prisma.Decimal(request.newResidualValue) } : {}),
          },
        })
      }
      // Cache currentValue mengikuti nilai tercatat jurnal sesudah peristiwa.
      if (event.lines.length > 0) {
        await tx.asset.update({
          where: { id: assetId },
          data: { currentValue: event.carryingAfter },
        })
      }

      return { eventId: result.eventId, journalId: result.journalId, journalNumber: result.journalNumber, kind: event.kind }
    })
  } catch (error) {
    if (isSourceKeyConflict(error)) {
      throw new Error(
        `Dokumen sumber "${request.sourceDocumentKey}" sudah melahirkan peristiwa; replay ditolak (satu dokumen satu peristiwa).`,
      )
    }
    throw error
  }
}

/** Reklasifikasi dengan kategori tujuan eksplisit (F-115 Putusan 1). */
export async function postAssetReclassification(input: {
  assetId: number
  toCategoryId: number
  request: AssetChangeEventRequest
  createdBy?: number | null
}): Promise<PostAssetChangeEventResult> {
  const { assetId, toCategoryId, request } = input
  try {
    return await prisma.$transaction(async (tx) => {
      const asset = await tx.asset.findUnique({
        where: { id: assetId },
        select: {
          id: true, name: true, code: true, status: true, categoryId: true,
          category: { select: CATEGORY_SELECT },
        },
      })
      if (!asset) throw new Error("Aset tidak ditemukan.")
      if (!asset.category) throw new Error("Aset belum berkategori; reklasifikasi wajib kategori asal terpetakan.")
      if (asset.categoryId === toCategoryId) throw new Error("Kategori tujuan reklasifikasi harus berbeda dari kategori asal.")

      await assertSourceDocumentUnused(tx, request.sourceDocumentKey)

      const toCategory = await tx.assetCategory.findUnique({
        where: { id: toCategoryId },
        select: CATEGORY_SELECT,
      })
      if (!toCategory) throw new Error("Kategori tujuan reklasifikasi tidak ditemukan.")

      const mapping = await loadMapping(tx, asset.category)
      const toMapping = await loadMapping(tx, toCategory)
      const { facts } = await loadPostedFacts(tx, assetId, mapping)

      const built = buildAssetChangeEvent({
        request: { ...request, kind: "RECLASSIFICATION", toMapping },
        facts,
        mapping,
      })
      if (!built.ok) throw new Error(built.error)
      const event = built.event

      await assertPeriodOpen(request.effectiveDate, tx)

      const result = await createJournalAndEvent(tx, {
        assetId,
        assetLabel: `${asset.name} (${asset.code})`,
        descriptionPrefix: "Reklasifikasi",
        event,
        effectiveDate: request.effectiveDate,
        sourceDocumentKey: request.sourceDocumentKey,
        createdBy: input.createdBy,
        eventData: {
          sourceDocumentRef: request.appraiserReportRef ?? null,
          fromCategoryId: asset.categoryId,
          toCategoryId,
          reasonCode: request.reasonCode ?? null,
          approvedByName: request.approvedByName ?? null,
          ...snapshotOf(mapping, toMapping, null),
        },
      })
      await tx.asset.update({ where: { id: assetId }, data: { categoryId: toCategoryId } })
      return { eventId: result.eventId, journalId: result.journalId, journalNumber: result.journalNumber, kind: "RECLASSIFICATION" as const }
    })
  } catch (error) {
    if (isSourceKeyConflict(error)) {
      throw new Error(`Dokumen sumber "${request.sourceDocumentKey}" sudah melahirkan peristiwa; replay ditolak.`)
    }
    throw error
  }
}

type OriginalEvent = Prisma.AssetChangeEventGetPayload<{
  include: { asset: { select: { name: true; code: true; categoryId: true } } }
}>

/**
 * Snapshot reversal = mirror persis peristiwa asal: akun tujuan dibalik
 * (to* reversal = akun asal peristiwa asal; akun asal reversal = akun
 * tujuan asal bila ada), dan seluruh konteks terstruktur asal disalin.
 */
function reversalEventData(original: OriginalEvent): Record<string, unknown> {
  const mirrorAccounts: SnapshotAccounts = {
    surplusAccountId: original.surplusAccountId, surplusAccountCode: original.surplusAccountCode,
    impairmentLossAccountId: original.impairmentLossAccountId, impairmentLossAccountCode: original.impairmentLossAccountCode,
    accumulatedImpairmentAccountId: original.accumulatedImpairmentAccountId, accumulatedImpairmentAccountCode: original.accumulatedImpairmentAccountCode,
    fixedAssetAccountId: original.toFixedAssetAccountId ?? original.fixedAssetAccountId,
    fixedAssetAccountCode: original.toFixedAssetAccountCode ?? original.fixedAssetAccountCode,
    accumulatedDepreciationAccountId: original.toAccumulatedDepreciationAccountId ?? original.accumulatedDepreciationAccountId,
    accumulatedDepreciationAccountCode: original.toAccumulatedDepreciationAccountCode ?? original.accumulatedDepreciationAccountCode,
    taxPayableAccountId: original.taxPayableAccountId, taxPayableAccountCode: original.taxPayableAccountCode,
    toFixedAssetAccountId: original.fixedAssetAccountId, toFixedAssetAccountCode: original.fixedAssetAccountCode,
    toAccumulatedDepreciationAccountId: original.accumulatedDepreciationAccountId, toAccumulatedDepreciationAccountCode: original.accumulatedDepreciationAccountCode,
    toAccumulatedImpairmentAccountId: original.accumulatedImpairmentAccountId, toAccumulatedImpairmentAccountCode: original.accumulatedImpairmentAccountCode,
  }
  return {
    sourceDocumentRef: original.sourceDocumentRef,
    reversesEventId: original.id,
    appraiserName: original.appraiserName,
    revaluedClassName: original.revaluedClassName,
    impairmentIndicator: original.impairmentIndicator,
    recoverableBasis: original.recoverableBasis,
    recoverableAmount: original.recoverableAmount,
    carryingWithoutImpairment: original.carryingWithoutImpairment,
    isGoodwillOrNonAmortizing: original.isGoodwillOrNonAmortizing,
    fromCategoryId: original.toCategoryId,
    toCategoryId: original.fromCategoryId,
    reasonCode: original.reasonCode,
    reasonNote: original.reasonNote,
    approvedByName: original.approvedByName,
    oldMethod: original.newMethod,
    newMethod: original.oldMethod,
    oldUsefulLifeMonths: original.newUsefulLifeMonths,
    newUsefulLifeMonths: original.oldUsefulLifeMonths,
    oldResidualValue: original.newResidualValue,
    newResidualValue: original.oldResidualValue,
    djpApprovalNumber: original.djpApprovalNumber,
    djpApprovalDate: original.djpApprovalDate,
    fiscalGroupCode: original.fiscalGroupCode,
    fiscalMethodBefore: original.fiscalMethodAfter,
    fiscalMethodAfter: original.fiscalMethodBefore,
    ...mirrorAccounts,
  }
}

/**
 * Reversal peristiwa di periode terbuka (F-111 P4 / F-115 P1): jurnal lawan
 * dari SNAPSHOT akun peristiwa asal + peristiwa reversal terbekukan +
 * peristiwa asal REVERSED. Edit baris asal tidak pernah terjadi.
 */
export async function reverseAssetChangeEvent(input: {
  eventId: number
  reversalDate: Date
  sourceDocumentKey: string
  createdBy?: number | null
}): Promise<PostAssetChangeEventResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const original = await tx.assetChangeEvent.findUnique({
        where: { id: input.eventId },
        include: { asset: { select: { name: true, code: true, categoryId: true } } },
      })
      if (!original) throw new Error("Peristiwa perubahan aset tidak ditemukan.")
      if (original.status !== "POSTED") throw new Error("Peristiwa sudah dibalik atau tidak POSTED.")

      await assertSourceDocumentUnused(tx, input.sourceDocumentKey)
      await assertPeriodOpen(input.reversalDate, tx)

      let journalId: number | null = null
      let journalNumber: string | null = null
      if (original.journalId != null) {
        const originalJournal = await tx.journal.findUnique({
          where: { id: original.journalId },
          include: { entries: true },
        })
        if (!originalJournal || originalJournal.status !== "POSTED") {
          throw new Error("Jurnal pasangan peristiwa asal tidak POSTED; reversal ditolak.")
        }
        journalNumber = await nextJournalNumber(tx, input.reversalDate)
        const journal = await tx.journal.create({
          data: {
            journalNumber,
            transactionDate: input.reversalDate,
            referenceType: ASSET_CHANGE_EVENT_REFERENCE_TYPE,
            referenceId: original.assetId,
            description: `Reversal peristiwa ${original.kind} #${original.id} aset: ${original.asset.name} (${original.asset.code})`,
            type: ASSET_CHANGE_EVENT_REFERENCE_TYPE,
            status: "POSTED",
            totalDebit: originalJournal.totalCredit,
            totalCredit: originalJournal.totalDebit,
            createdBy: input.createdBy ?? null,
            entries: {
              create: originalJournal.entries.map((e) => ({
                accountId: e.accountId,
                debit: e.credit,
                credit: e.debit,
                memo: `Reversal: ${e.memo ?? ""}`,
              })),
            },
          },
          select: { id: true },
        })
        journalId = journal.id
        await tx.journal.update({ where: { id: originalJournal.id }, data: { status: "REVERSED" } })
      }

      // Surplus mirror: sesudah reversal = sebelum peristiwa asal (kolom
      // terbekukan asal). Baris lama tanpa kolom before diturunkan dari
      // rantai peristiwa POSTED lain aset sama sebagai cadangan.
      let surplusAfterReversal = original.revaluationSurplusBefore
      if (surplusAfterReversal == null) {
        const prior = await tx.assetChangeEvent.findFirst({
          where: { assetId: original.assetId, status: "POSTED", id: { not: original.id } },
          orderBy: [{ effectiveDate: "desc" }, { id: "desc" }],
          select: { revaluationSurplusAfter: true },
        })
        surplusAfterReversal = prior?.revaluationSurplusAfter ?? new Prisma.Decimal(0)
      }

      const reversal = await tx.assetChangeEvent.create({
        data: {
          ...(reversalEventData(original) as Prisma.AssetChangeEventUncheckedCreateInput),
          assetId: original.assetId,
          kind: original.kind,
          status: "POSTED",
          effectiveDate: input.reversalDate,
          sourceDocumentKey: input.sourceDocumentKey,
          journalId,
          carryingBefore: original.carryingAfter,
          carryingAfter: original.carryingBefore,
          grossBefore: original.grossBefore,
          accumulatedBefore: original.accumulatedBefore,
          accumulatedImpairmentBefore: original.accumulatedImpairmentBefore,
          revaluationSurplusBefore: original.revaluationSurplusAfter,
          revaluationSurplusAfter: surplusAfterReversal,
          fiscalBaseBefore: original.fiscalBaseAfter,
          fiscalBaseAfter: original.fiscalBaseBefore,
          fiscalSurplusAmount: original.fiscalSurplusAmount != null ? original.fiscalSurplusAmount.negated() : null,
          finalTaxRatePercent: original.finalTaxRatePercent,
          finalTaxAmount: original.finalTaxAmount != null ? original.finalTaxAmount.negated() : null,
          fiscalUsefulLifeMonthsAfter: null,
          createdBy: input.createdBy ?? null,
        } as Prisma.AssetChangeEventUncheckedCreateInput,
        select: { id: true },
      })
      await tx.assetChangeEvent.update({ where: { id: original.id }, data: { status: "REVERSED" } })

      // Balikkan efek berjalan peristiwa asal.
      if (original.kind === "RECLASSIFICATION" && original.fromCategoryId != null) {
        await tx.asset.update({ where: { id: original.assetId }, data: { categoryId: original.fromCategoryId } })
      }
      if (original.kind === "COMMERCIAL_METHOD_CHANGE" && original.oldMethod) {
        await tx.asset.update({ where: { id: original.assetId }, data: { depreciationMethod: original.oldMethod } })
      }
      if (original.kind === "ESTIMATE_CHANGE") {
        await tx.asset.update({
          where: { id: original.assetId },
          data: {
            ...(original.oldUsefulLifeMonths != null ? { usefulLifeMonths: original.oldUsefulLifeMonths } : {}),
            ...(original.oldResidualValue != null ? { residualValue: original.oldResidualValue } : {}),
          },
        })
      }
      if (original.carryingBefore != null && original.journalId != null) {
        await tx.asset.update({ where: { id: original.assetId }, data: { currentValue: original.carryingBefore } })
      }
      return { eventId: reversal.id, journalId, journalNumber, kind: original.kind as AssetChangeEventKind }
    })
  } catch (error) {
    if (isSourceKeyConflict(error)) {
      throw new Error(`Dokumen sumber "${input.sourceDocumentKey}" sudah melahirkan peristiwa; replay ditolak.`)
    }
    throw error
  }
}
