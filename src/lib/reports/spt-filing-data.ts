import { prisma } from "@/lib/db/prisma"
import { safeAdd } from "@/lib/utils/math"

export interface SptFilingRow {
  id: number
  sptType: string
  period: string
  amendmentNo: number
  isLatestForKey: boolean
  filedAt: Date
  bpeNumber: string
  underOverPayment: number
  compensationBalance: number
  taxPaymentId: number | null
  taxPaymentDocNo: string | null
  varianceNote: string | null
  createdAt: Date
}

export interface SptFilingTaxPaymentOption {
  id: number
  documentNo: string
  period: string | null
  taxKind: string | null
  amount: number
  ntpn: string | null
}

export interface SptFilingRegisterData {
  rows: SptFilingRow[]
  taxPayments: SptFilingTaxPaymentOption[]
  totals: {
    totalFilings: number
    distinctPeriods: number
    amendedPeriods: number
    latestCompensationTotal: number
  }
}

export async function getSptFilingRegisterData(): Promise<SptFilingRegisterData> {
  const [filings, payments] = await Promise.all([
    prisma.sptFiling.findMany({
      orderBy: [{ period: "desc" }, { sptType: "asc" }, { amendmentNo: "desc" }],
      include: {
        taxPayment: {
          select: { id: true, documentNo: true },
        },
      },
    }),
    prisma.taxPayment.findMany({
      where: { deletedAt: null, NOT: { status: "void" } },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        documentNo: true,
        period: true,
        taxKind: true,
        amount: true,
        ntpn: true,
      },
    }),
  ])

  const latestKeySeen = new Set<string>()
  const amendedKeys = new Set<string>()
  const distinctPeriods = new Set<string>()
  let latestCompensationTotal = 0

  const rows: SptFilingRow[] = filings.map((f) => {
    const key = `${f.sptType}::${f.period}`
    distinctPeriods.add(key)
    if (f.amendmentNo > 0) amendedKeys.add(key)
    const isLatestForKey = !latestKeySeen.has(key)
    if (isLatestForKey) {
      latestKeySeen.add(key)
      latestCompensationTotal = safeAdd(
        latestCompensationTotal,
        Number(f.compensationBalance),
        2,
      )
    }
    return {
      id: f.id,
      sptType: f.sptType,
      period: f.period,
      amendmentNo: f.amendmentNo,
      isLatestForKey,
      filedAt: f.filedAt,
      bpeNumber: f.bpeNumber,
      underOverPayment: Number(f.underOverPayment),
      compensationBalance: Number(f.compensationBalance),
      taxPaymentId: f.taxPaymentId,
      taxPaymentDocNo: f.taxPayment?.documentNo ?? null,
      varianceNote: f.varianceNote,
      createdAt: f.createdAt,
    }
  })

  return {
    rows,
    taxPayments: payments.map((p) => ({
      id: p.id,
      documentNo: p.documentNo,
      period: p.period,
      taxKind: p.taxKind,
      amount: Number(p.amount),
      ntpn: p.ntpn,
    })),
    totals: {
      totalFilings: rows.length,
      distinctPeriods: distinctPeriods.size,
      amendedPeriods: amendedKeys.size,
      latestCompensationTotal,
    },
  }
}
