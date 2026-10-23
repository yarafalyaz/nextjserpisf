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

async function loadMapping(
  tx: TxClient,
  category: {
    name: string
    assetAccountId: number | null
    accumulatedDepreciationAccountId: number | null
    revaluationSurplusAccountId: number | null
    impairmentLossAccountId: number | null
    accumulatedImpairmentAccountId: number | null
  },
): Promise<CategoryAccountMapping> {
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

/** Nilai tercatat jurnal POSTED termasuk kontra impairment peristiwa F-111. */
async function loadPostedFacts(tx: TxClient, assetId: number, mapping: CategoryAccountMapping): Promise<{
  facts: AssetPostedFacts
  assetStatus: string
}> {
  const asset = await tx.asset.findUniqueOrThrow({
    where: { id: assetId },
    select: { status: true },
  })
  const journals = await tx.journal.findMany({
    where: {
      referenceId: assetId,
      status: "POSTED",
      deletedAt: null,
      OR: [
        { referenceType: "ASSET_ACQUISITION" },
        { referenceType: "ASSET_DISPOSAL" },
        { referenceType: { startsWith: "ASSET_DEPRECIATION_" } },
        { referenceType: ASSET_CHANGE_EVENT_REFERENCE_TYPE },
      ],
    },
    select: {
      referenceType: true,
      entries: { select: { accountId: true, debit: true, credit: true } },
    },
  })
  const posted = journalBookValue(
    journals.map((j) => ({
      referenceType: j.referenceType ?? "",
      lines: j.entries.map((e) => ({ accountId: e.accountId, debit: e.debit, credit: e.credit })),
    })),
    {
      fixedAssetAccountId: mapping.assetAccount?.id ?? null,
      accumulatedDepreciationAccountId: mapping.accumulatedDepreciationAccount?.id ?? null,
    },
  )
  // Kontra impairment + surplus + beban lampau dibaca dari JURNAL peristiwa
  // POSTED pada akun snapshot mapping berjalan (akun kontra/beban/surplus
  // kategori ini); peristiwa REVERSED dikecualikan karena jurnal pasangannya
  // sudah meniadakan lewat JurnalService pola existing (status REVERSED).
  const eventJournals = journals.filter((j) => j.referenceType === ASSET_CHANGE_EVENT_REFERENCE_TYPE)
  const sumAccount = (accountId: number | null, side: "debit" | "credit", other: "debit" | "credit") => {
    if (accountId == null) return new Prisma.Decimal(0)
    let total = new Prisma.Decimal(0)
    for (const j of eventJournals) {
      for (const e of j.entries) {
        if (e.accountId !== accountId) continue
        total = total.add(side === "debit" ? e.debit : e.credit).sub(other === "debit" ? e.debit : e.credit)
      }
    }
    return total
  }
  const accumulatedImpairmentPosted = Prisma.Decimal.max(
    new Prisma.Decimal(0),
    sumAccount(mapping.accumulatedImpairmentAccount?.id ?? null, "credit", "debit"),
  )
  const events = await tx.assetChangeEvent.findMany({
    where: { assetId, status: "POSTED" },
    select: {
      kind: true,
      effectiveDate: true,
      revaluationSurplusAfter: true,
      fiscalBaseAfter: true,
    },
    orderBy: [{ effectiveDate: "asc" }, { id: "asc" }],
  })
  const lastEvent = events[events.length - 1]
  const lastFiscal = [...events].reverse().find((e) => e.kind === "FISCAL_REVALUATION_APPROVED")
  const facts: AssetPostedFacts = {
    assetStatus: asset.status,
    hasAcquisitionJournal: posted.hasAcquisitionJournal,
    grossCostPosted: posted.grossCostPosted,
    accumulatedPosted: posted.accumulatedPosted,
    accumulatedImpairmentPosted,
    disposalGrossPosted: posted.disposalGrossPosted,
    revaluationSurplusPerAsset: lastEvent?.revaluationSurplusAfter ?? new Prisma.Decimal(0),
    // Beban lampau aset sama = debit bersih akun beban penurunan pada jurnal
    // peristiwa (revaluasi turun/impairment), bukti jurnal POSTED (P1).
    priorLossChargedToProfitOrLoss: Prisma.Decimal.max(
      new Prisma.Decimal(0),
      sumAccount(mapping.impairmentLossAccount?.id ?? null, "debit", "credit"),
    ),
    lastFiscalRevaluationDate: lastFiscal?.effectiveDate ?? null,
  }
  return { facts, assetStatus: asset.status }
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

      // Anti-replay dokumen sumber SEBELUM kerja lain (E111-10/E115-8).
      const replay = await tx.assetChangeEvent.findUnique({
        where: { sourceDocumentKey: request.sourceDocumentKey },
        select: { id: true },
      })
      if (replay) {
        throw new Error(
          `Dokumen sumber "${request.sourceDocumentKey}" sudah melahirkan peristiwa #${replay.id}; replay ditolak (satu dokumen satu peristiwa).`,
        )
      }

      const mapping = await loadMapping(tx, asset.category)

      // Reklasifikasi: pindah lewat postAssetReclassification (tujuan eksplisit).
      const toMapping: CategoryAccountMapping | null = null
      const toCategoryId: number | null = null
      if (request.kind === "RECLASSIFICATION") {
        throw new Error("Reklasifikasi wajib lewat postAssetReclassification (kategori tujuan eksplisit).")
      }

      const { facts } = await loadPostedFacts(tx, assetId, mapping)

      // Tarif + akun pajak fiskal dari master setting (data, bukan konstanta).
      let enriched: AssetChangeEventRequest = { ...request, toMapping }
      if (request.kind === "FISCAL_REVALUATION_APPROVED") {
        const settings = await tx.systemSetting.findFirst({
          select: {
            assetFiscalRevaluationTaxPayableAccountId: true,
            assetFiscalRevaluationFinalTaxRatePercent: true,
          },
        })
        const taxPayableAccount = await loadAccount(tx, settings?.assetFiscalRevaluationTaxPayableAccountId)
        const priorFiscal = await tx.assetChangeEvent.findFirst({
          where: { assetId, kind: "FISCAL_REVALUATION_APPROVED", status: "POSTED" },
          orderBy: [{ effectiveDate: "desc" }, { id: "desc" }],
          select: { fiscalBaseAfter: true },
        })
        const lastFiscalEvent = await tx.assetChangeEvent.findFirst({
          where: { assetId, status: "POSTED", fiscalBaseAfter: { not: null } },
          orderBy: [{ effectiveDate: "desc" }, { id: "desc" }],
          select: { fiscalBaseAfter: true },
        })
        enriched = {
          ...enriched,
          taxPayableAccount,
          finalTaxRatePercent: settings?.assetFiscalRevaluationFinalTaxRatePercent ?? null,
          fiscalBaseBefore: request.fiscalBaseBefore ?? lastFiscalEvent?.fiscalBaseAfter ?? priorFiscal?.fiscalBaseAfter ?? null,
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

      let journalId: number | null = null
      let journalNumber: string | null = null
      if (event.lines.length > 0) {
        journalNumber = await nextJournalNumber(tx, request.effectiveDate)
        const totalDebit = event.lines.reduce((s, l) => s.add(l.debit), new Prisma.Decimal(0))
        const totalCredit = event.lines.reduce((s, l) => s.add(l.credit), new Prisma.Decimal(0))
        const journal = await tx.journal.create({
          data: {
            journalNumber,
            transactionDate: request.effectiveDate,
            // referenceId diisi sesudah peristiwa lahir (id peristiwa), lihat bawah.
            referenceType: ASSET_CHANGE_EVENT_REFERENCE_TYPE,
            referenceId: null,
            description: `Peristiwa ${event.kind} aset: ${asset.name} (${asset.code})`,
            type: ASSET_CHANGE_EVENT_REFERENCE_TYPE,
            status: "POSTED",
            totalDebit,
            totalCredit,
            createdBy: input.createdBy ?? null,
            entries: {
              create: event.lines.map((l) => ({
                accountId: l.accountId,
                debit: l.debit,
                credit: l.credit,
                memo: l.memo,
              })),
            },
          },
          select: { id: true },
        })
        journalId = journal.id
      }

      const created = await tx.assetChangeEvent.create({
        data: {
          assetId,
          kind: event.kind,
          status: "POSTED",
          effectiveDate: request.effectiveDate,
          sourceDocumentKey: request.sourceDocumentKey,
          sourceDocumentRef: request.appraiserReportRef ?? null,
          journalId,
          carryingBefore: event.carryingBefore,
          carryingAfter: event.carryingAfter,
          grossBefore: event.grossBefore,
          accumulatedBefore: event.accumulatedBefore,
          accumulatedImpairmentBefore: event.accumulatedImpairmentBefore,
          revaluationSurplusAfter: event.revaluationSurplusAfter,
          appraiserName: request.appraiserName ?? null,
          revaluedClassName: request.revaluedClassName ?? null,
          impairmentIndicator: request.impairmentIndicator ?? null,
          recoverableBasis: request.recoverableBasis ?? null,
          recoverableAmount: request.recoverableAmount != null ? new Prisma.Decimal(request.recoverableAmount) : null,
          carryingWithoutImpairment: request.carryingWithoutImpairment != null ? new Prisma.Decimal(request.carryingWithoutImpairment) : null,
          isGoodwillOrNonAmortizing: request.isGoodwillOrNonAmortizing ?? false,
          fromCategoryId: asset.categoryId,
          toCategoryId,
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
          fiscalBaseBefore: event.fiscalBaseBefore,
          fiscalBaseAfter: event.fiscalBaseAfter,
          fiscalSurplusAmount: event.fiscalSurplusAmount,
          finalTaxRatePercent: event.finalTaxRatePercent,
          finalTaxAmount: event.finalTaxAmount,
          fiscalUsefulLifeMonthsAfter: event.fiscalUsefulLifeMonthsAfter,
          fiscalGroupCode: enriched.fiscalGroupCode ?? null,
          fiscalMethodBefore: request.kind === "FISCAL_METHOD_CHANGE" ? (request.oldMethod ?? null) : null,
          fiscalMethodAfter: request.kind === "FISCAL_METHOD_CHANGE" ? (request.newMethod ?? null) : null,
          surplusAccountId: mapping.revaluationSurplusAccount?.id ?? null,
          surplusAccountCode: mapping.revaluationSurplusAccount?.code ?? null,
          impairmentLossAccountId: mapping.impairmentLossAccount?.id ?? null,
          impairmentLossAccountCode: mapping.impairmentLossAccount?.code ?? null,
          accumulatedImpairmentAccountId: mapping.accumulatedImpairmentAccount?.id ?? null,
          accumulatedImpairmentAccountCode: mapping.accumulatedImpairmentAccount?.code ?? null,
          fixedAssetAccountId: mapping.assetAccount?.id ?? null,
          fixedAssetAccountCode: mapping.assetAccount?.code ?? null,
          accumulatedDepreciationAccountId: mapping.accumulatedDepreciationAccount?.id ?? null,
          accumulatedDepreciationAccountCode: mapping.accumulatedDepreciationAccount?.code ?? null,
          taxPayableAccountId: enriched.taxPayableAccount?.id ?? null,
          taxPayableAccountCode: enriched.taxPayableAccount?.code ?? null,
          createdBy: input.createdBy ?? null,
        },
        select: { id: true },
      })

      if (journalId != null) {
        await tx.journal.update({
          where: { id: journalId },
          data: { referenceId: created.id },
        })
      }

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

      return { eventId: created.id, journalId, journalNumber, kind: event.kind }
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

      const replay = await tx.assetChangeEvent.findUnique({
        where: { sourceDocumentKey: request.sourceDocumentKey },
        select: { id: true },
      })
      if (replay) {
        throw new Error(`Dokumen sumber "${request.sourceDocumentKey}" sudah melahirkan peristiwa #${replay.id}; replay ditolak.`)
      }

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

      let journalId: number | null = null
      let journalNumber: string | null = null
      if (event.lines.length > 0) {
        journalNumber = await nextJournalNumber(tx, request.effectiveDate)
        const totalDebit = event.lines.reduce((s, l) => s.add(l.debit), new Prisma.Decimal(0))
        const totalCredit = event.lines.reduce((s, l) => s.add(l.credit), new Prisma.Decimal(0))
        const journal = await tx.journal.create({
          data: {
            journalNumber,
            transactionDate: request.effectiveDate,
            referenceType: ASSET_CHANGE_EVENT_REFERENCE_TYPE,
            referenceId: null,
            description: `Reklasifikasi aset: ${asset.name} (${asset.code})`,
            type: ASSET_CHANGE_EVENT_REFERENCE_TYPE,
            status: "POSTED",
            totalDebit,
            totalCredit,
            createdBy: input.createdBy ?? null,
            entries: { create: event.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, memo: l.memo })) },
          },
          select: { id: true },
        })
        journalId = journal.id
      }

      const created = await tx.assetChangeEvent.create({
        data: {
          assetId,
          kind: "RECLASSIFICATION",
          status: "POSTED",
          effectiveDate: request.effectiveDate,
          sourceDocumentKey: request.sourceDocumentKey,
          sourceDocumentRef: request.appraiserReportRef ?? null,
          journalId,
          carryingBefore: event.carryingBefore,
          carryingAfter: event.carryingAfter,
          grossBefore: event.grossBefore,
          accumulatedBefore: event.accumulatedBefore,
          accumulatedImpairmentBefore: event.accumulatedImpairmentBefore,
          revaluationSurplusAfter: event.revaluationSurplusAfter,
          fromCategoryId: asset.categoryId,
          toCategoryId,
          reasonCode: request.reasonCode ?? null,
          approvedByName: request.approvedByName ?? null,
          surplusAccountId: mapping.revaluationSurplusAccount?.id ?? null,
          surplusAccountCode: mapping.revaluationSurplusAccount?.code ?? null,
          impairmentLossAccountId: mapping.impairmentLossAccount?.id ?? null,
          impairmentLossAccountCode: mapping.impairmentLossAccount?.code ?? null,
          accumulatedImpairmentAccountId: mapping.accumulatedImpairmentAccount?.id ?? null,
          accumulatedImpairmentAccountCode: mapping.accumulatedImpairmentAccount?.code ?? null,
          fixedAssetAccountId: mapping.assetAccount?.id ?? null,
          fixedAssetAccountCode: mapping.assetAccount?.code ?? null,
          accumulatedDepreciationAccountId: mapping.accumulatedDepreciationAccount?.id ?? null,
          accumulatedDepreciationAccountCode: mapping.accumulatedDepreciationAccount?.code ?? null,
          toFixedAssetAccountId: toMapping.assetAccount?.id ?? null,
          toFixedAssetAccountCode: toMapping.assetAccount?.code ?? null,
          toAccumulatedDepreciationAccountId: toMapping.accumulatedDepreciationAccount?.id ?? null,
          toAccumulatedDepreciationAccountCode: toMapping.accumulatedDepreciationAccount?.code ?? null,
          toAccumulatedImpairmentAccountId: toMapping.accumulatedImpairmentAccount?.id ?? null,
          toAccumulatedImpairmentAccountCode: toMapping.accumulatedImpairmentAccount?.code ?? null,
          createdBy: input.createdBy ?? null,
        },
        select: { id: true },
      })
      if (journalId != null) {
        await tx.journal.update({ where: { id: journalId }, data: { referenceId: created.id } })
      }
      await tx.asset.update({ where: { id: assetId }, data: { categoryId: toCategoryId } })
      return { eventId: created.id, journalId, journalNumber, kind: "RECLASSIFICATION" as const }
    })
  } catch (error) {
    if (isSourceKeyConflict(error)) {
      throw new Error(`Dokumen sumber "${request.sourceDocumentKey}" sudah melahirkan peristiwa; replay ditolak.`)
    }
    throw error
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

      const replay = await tx.assetChangeEvent.findUnique({
        where: { sourceDocumentKey: input.sourceDocumentKey },
        select: { id: true },
      })
      if (replay) throw new Error(`Dokumen sumber "${input.sourceDocumentKey}" sudah dipakai peristiwa #${replay.id}.`)

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
            referenceId: null,
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

      const reversal = await tx.assetChangeEvent.create({
        data: {
          assetId: original.assetId,
          kind: original.kind,
          status: "POSTED",
          effectiveDate: input.reversalDate,
          sourceDocumentKey: input.sourceDocumentKey,
          journalId,
          reversesEventId: original.id,
          carryingBefore: original.carryingAfter,
          carryingAfter: original.carryingBefore,
          grossBefore: original.grossBefore,
          accumulatedBefore: original.accumulatedBefore,
          accumulatedImpairmentBefore: original.accumulatedImpairmentBefore,
          revaluationSurplusAfter: original.carryingBefore != null && original.kind === "RECLASSIFICATION"
            ? original.revaluationSurplusAfter
            : null,
          fromCategoryId: original.toCategoryId,
          toCategoryId: original.fromCategoryId,
          surplusAccountId: original.surplusAccountId,
          surplusAccountCode: original.surplusAccountCode,
          impairmentLossAccountId: original.impairmentLossAccountId,
          impairmentLossAccountCode: original.impairmentLossAccountCode,
          accumulatedImpairmentAccountId: original.accumulatedImpairmentAccountId,
          accumulatedImpairmentAccountCode: original.accumulatedImpairmentAccountCode,
          fixedAssetAccountId: original.fixedAssetAccountId,
          fixedAssetAccountCode: original.fixedAssetAccountCode,
          accumulatedDepreciationAccountId: original.accumulatedDepreciationAccountId,
          accumulatedDepreciationAccountCode: original.accumulatedDepreciationAccountCode,
          taxPayableAccountId: original.taxPayableAccountId,
          taxPayableAccountCode: original.taxPayableAccountCode,
          createdBy: input.createdBy ?? null,
        },
        select: { id: true },
      })
      if (journalId != null) {
        await tx.journal.update({ where: { id: journalId }, data: { referenceId: reversal.id } })
      }
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
