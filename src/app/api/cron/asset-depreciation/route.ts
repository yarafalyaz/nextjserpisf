import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db/prisma"

/**
 * Cron: Run monthly asset depreciation for all active assets.
 * Schedule: 1st of every month at 01:00 (0 1 1 * *)
 * 
 * Mirrors Laravel: PostDepreciation + RunAssetDepreciation commands
 * 
 * Logic:
 * - Find all active assets with a category that has depreciation_rate or useful_life
 * - Calculate monthly depreciation (straight-line)
 * - Create asset history entries for depreciation
 * - Update asset current_value
 * - Create journal entries (debit depreciation expense, credit accumulated depreciation)
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const month = now.getMonth() + 1 // 1-12
  const year = now.getFullYear()
  const periodEnd = new Date(year, month - 1 + 1, 0) // Last day of current month

  // Find all active assets with depreciation info via category
  const assets = await prisma.asset.findMany({
    where: {
      status: "active",
      purchaseDate: { lte: periodEnd },
      category: {
        OR: [
          { depreciationRate: { gt: 0 } },
          { usefulLife: { gt: 0 } },
        ],
      },
    },
    include: { category: true },
  })

  let processed = 0
  let errors = 0
  let skipped = 0
  const errorDetails: string[] = []

  // Fix #36: Validate account IDs exist before processing
  const depExpAccountId = parseInt(process.env.DEPRECIATION_EXPENSE_ACCOUNT_ID || "0")
  const accDepAccountId = parseInt(process.env.ACCUMULATED_DEPRECIATION_ACCOUNT_ID || "0")
  if (!depExpAccountId || !accDepAccountId) {
    return NextResponse.json({
      error: "DEPRECIATION_EXPENSE_ACCOUNT_ID dan ACCUMULATED_DEPRECIATION_ACCOUNT_ID harus di-set di environment variables",
    }, { status: 500 })
  }

  for (const asset of assets) {
    try {
      const category = asset.category
      if (!category) continue

      // Fix #37: Check if already depreciated this period
      const existingDepreciation = await prisma.assetHistory.findFirst({
        where: {
          assetId: asset.id,
          type: "depreciation",
          date: {
            gte: new Date(year, month - 1, 1),
            lt: new Date(year, month, 1),
          },
        },
      })
      if (existingDepreciation) {
        skipped++
        continue
      }

      const purchaseCost = Number(asset.purchaseCost)
      const currentValue = Number(asset.currentValue)

      // Skip if already fully depreciated
      if (currentValue <= 0) continue

      // Calculate monthly depreciation (straight-line method)
      let monthlyDepreciation = 0

      if (category.usefulLife && category.usefulLife > 0) {
        // Straight-line: (cost - residual) / useful_life_months
        // Assuming residual value = 0 for simplicity (no residual field in schema)
        monthlyDepreciation = purchaseCost / (category.usefulLife * 12)
      } else if (category.depreciationRate) {
        // Rate-based: cost * rate / 12
        const rate = Number(category.depreciationRate) / 100
        monthlyDepreciation = purchaseCost * rate / 12
      }

      if (monthlyDepreciation <= 0) continue

      // Don't depreciate more than current value
      if (monthlyDepreciation > currentValue) {
        monthlyDepreciation = currentValue
      }

      const newValue = currentValue - monthlyDepreciation
      const depreciationDecimal = new Prisma.Decimal(monthlyDepreciation.toFixed(2))
      const newValueDecimal = new Prisma.Decimal(newValue.toFixed(2))

      // Generate journal number
      const journalSeq = await prisma.documentSequence.upsert({
        where: { key: "JOURNAL" },
        update: { currentValue: { increment: 1 } },
        create: { key: "JOURNAL", currentValue: 1 },
      })
      const journalNumber = `JRN-${year}${String(month).padStart(2, "0")}-${String(journalSeq.currentValue).padStart(5, "0")}`

      await prisma.$transaction([
        // Update asset current value
        prisma.asset.update({
          where: { id: asset.id },
          data: { currentValue: newValueDecimal },
        }),
        // Create asset history entry
        prisma.assetHistory.create({
          data: {
            assetId: asset.id,
            type: "depreciation",
            description: `Penyusutan bulan ${month}/${year} - ${asset.name}`,
            amount: depreciationDecimal,
            date: new Date(year, month - 1, 1),
          },
        }),
        // Create journal entry for depreciation
        prisma.journal.create({
          data: {
            journalNumber,
            transactionDate: new Date(year, month - 1, 1),
            referenceType: "ASSET_DEPRECIATION",
            referenceId: asset.id,
            description: `Penyusutan aset: ${asset.name} (${asset.code}) - ${month}/${year}`,
            type: "DEPRECIATION",
            status: "POSTED",
            totalDebit: depreciationDecimal,
            totalCredit: depreciationDecimal,
            entries: {
              create: [
                {
                  // Debit: Depreciation Expense
                  accountId: parseInt(process.env.DEPRECIATION_EXPENSE_ACCOUNT_ID || "0") || 0,
                  debit: depreciationDecimal,
                  credit: new Prisma.Decimal(0),
                  memo: `Beban penyusutan - ${asset.name}`,
                },
                {
                  // Credit: Accumulated Depreciation
                  accountId: parseInt(process.env.ACCUMULATED_DEPRECIATION_ACCOUNT_ID || "0") || 0,
                  debit: new Prisma.Decimal(0),
                  credit: depreciationDecimal,
                  memo: `Akumulasi penyusutan - ${asset.name}`,
                },
              ],
            },
          },
        }),
      ])

      processed++
    } catch (e) {
      errors++
      const message = e instanceof Error ? e.message : "Unknown error"
      errorDetails.push(`Asset ${asset.id} (${asset.name}): ${message}`)
    }
  }

  return NextResponse.json({
    period: `${month}/${year}`,
    totalAssets: assets.length,
    processed,
    skipped,
    errors,
    errorDetails: errorDetails.slice(0, 10),
  })
}
