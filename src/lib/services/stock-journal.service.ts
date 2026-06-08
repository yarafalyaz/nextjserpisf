/* eslint-disable @typescript-eslint/no-explicit-any */
import { JournalService } from '@/lib/services/journal.service'
import { generateDocumentNumber } from '@/lib/utils/document-number'
import { getSystemSettings } from '@/lib/utils/settings'
import type { Prisma } from '@prisma/client'

/**
 * Stock Journal Service — creates journal entries for inventory movements.
 * Called from stock hooks AFTER stock moves are created.
 *
 * Standard double-entry for each stock event type.
 * Account references come from SystemSettings (configurable per tenant).
 */

interface JournalItemInput {
  itemId?: number
  qty: number
  cost: number
}

type AccountIds = {
  inventory?: number | null
  stockAdj?: number | null
  cogs?: number | null
  wip?: number | null
  materialExpense?: number | null
  materialIssueExpense?: number | null
  purchaseInventory?: number | null
  purchaseReturn?: number | null
  salesReturn?: number | null
}

async function getAccountIds(): Promise<AccountIds> {
  const s = await getSystemSettings()
  return {
    inventory: s.inventoryAccountId,
    stockAdj: s.stockAdjustmentAccountId ?? s.inventoryAdjustmentAccountId,
    cogs: s.cogsAccountId,
    wip: s.wipAccountId,
    materialExpense: s.materialExpenseAccountId,
    materialIssueExpense: s.materialIssueExpenseAccountId,
    purchaseInventory: s.purchaseInventoryAccountId,
    purchaseReturn: s.purchaseReturnAccountId,
    salesReturn: s.salesReturnAccountId,
  }
}

function sumValue(items: JournalItemInput[]): number {
  return items.reduce((s, i) => s + Number(i.qty) * Number(i.cost), 0)
}

// ────────────────────────────────────────────────────────────────────────────
// Stock Journal Service
// ────────────────────────────────────────────────────────────────────────────

export const stockJournalService = {
  /**
   * Goods Receipt (verified) — Stock IN from vendor.
   *
   *   Dr Inventory Account          (inventoryAccountId)
   *   Cr Purchase Inventory Account  (purchaseInventoryAccountId — clearing)
   *
   * Purchase Inventory account acts as clearing/suspense and gets reversed
   * when vendor bill is entered.
   */
  async onGoodsReceipt(
    tx: Prisma.TransactionClient,
    items: JournalItemInput[],
    grDocumentNo: string,
    grId: number,
    userId?: number
  ) {
    const accounts = await getAccountIds()
    if (!accounts.inventory || !accounts.purchaseInventory) return null

    const totalValue = sumValue(items)
    if (totalValue <= 0) return null

    const journalNumber = await generateDocumentNumber('JRN')
    const journalSvc = new JournalService(tx as any)
    return journalSvc.createJournal({
      journalNumber,
      transactionDate: new Date(),
      referenceType: 'GoodsReceipt',
      referenceId: grId,
      type: 'GR',
      description: `Penerimaan Barang ${grDocumentNo}`,
      createdBy: userId,
      entries: [
        {
          accountId: accounts.inventory,
          debit: totalValue,
          credit: 0,
          memo: `Debit Persediaan - GR ${grDocumentNo}`,
        },
        {
          accountId: accounts.purchaseInventory!,
          debit: 0,
          credit: totalValue,
          memo: `Kredit Hutang Pembelian (clearing) - GR ${grDocumentNo}`,
        },
      ],
    })
  },

  /**
   * Stock Adjustment (processed) — Stock IN/OUT from physical count.
   *
   *   If net increase (count > system):
   *     Dr Inventory Account
   *     Cr Stock Adjustment Account
   *
   *   If net decrease (count < system):
   *     Dr Stock Adjustment Account
   *     Cr Inventory Account
   */
  async onStockAdjustment(
    tx: Prisma.TransactionClient,
    items: Array<JournalItemInput & { difference: number }>,
    adjDocumentNo: string,
    adjId: number,
    userId?: number
  ) {
    const accounts = await getAccountIds()
    if (!accounts.inventory || !accounts.stockAdj) return null

    // Net value change = sum of (difference × unitCost)
    const netValue = items.reduce(
      (s, i) => s + Number(i.difference) * Number(i.cost),
      0
    )
    if (Math.abs(netValue) <= 0) return null

    const journalNumber = await generateDocumentNumber('JRN')
    const journalSvc = new JournalService(tx as any)

    const isIncrease = netValue > 0
    const absValue = Math.abs(netValue)

    return journalSvc.createJournal({
      journalNumber,
      transactionDate: new Date(),
      referenceType: 'StockAdjustment',
      referenceId: adjId,
      type: 'ADJ',
      description: `Penyesuaian Stok ${adjDocumentNo}`,
      createdBy: userId,
      entries: [
        {
          accountId: isIncrease ? accounts.inventory : accounts.stockAdj!,
          debit: absValue,
          credit: 0,
          memo: `Debit - Adj ${adjDocumentNo}`,
        },
        {
          accountId: isIncrease ? accounts.stockAdj! : accounts.inventory,
          debit: 0,
          credit: absValue,
          memo: `Kredit - Adj ${adjDocumentNo}`,
        },
      ],
    })
  },

  /**
   * Material Issue (completed) — Stock OUT for production.
   *
   *   Dr Material Expense / COGS
   *   Cr Inventory Account
   */
  async onMaterialIssue(
    tx: Prisma.TransactionClient,
    items: JournalItemInput[],
    miDocumentNo: string,
    miId: number,
    userId?: number
  ) {
    const accounts = await getAccountIds()
    const expenseAcct = accounts.materialIssueExpense ?? accounts.materialExpense ?? accounts.cogs
    if (!accounts.inventory || !expenseAcct) return null

    const totalValue = sumValue(items)
    if (totalValue <= 0) return null

    const journalNumber = await generateDocumentNumber('JRN')
    const journalSvc = new JournalService(tx as any)
    return journalSvc.createJournal({
      journalNumber,
      transactionDate: new Date(),
      referenceType: 'MaterialIssue',
      referenceId: miId,
      type: 'MI',
      description: `Pengeluaran Material ${miDocumentNo}`,
      createdBy: userId,
      entries: [
        {
          accountId: expenseAcct,
          debit: totalValue,
          credit: 0,
          memo: `Debit Beban Material - MI ${miDocumentNo}`,
        },
        {
          accountId: accounts.inventory,
          debit: 0,
          credit: totalValue,
          memo: `Kredit Persediaan - MI ${miDocumentNo}`,
        },
      ],
    })
  },

  /**
   * Sales Return (completed) — Stock IN from customer.
   *
   *   Dr Inventory Account
   *   Cr Sales Return Account
   */
  async onSalesReturn(
    tx: Prisma.TransactionClient,
    items: JournalItemInput[],
    srDocumentNo: string,
    srId: number,
    userId?: number
  ) {
    const accounts = await getAccountIds()
    if (!accounts.inventory || !accounts.salesReturn) return null

    const totalValue = sumValue(items)
    if (totalValue <= 0) return null

    const journalNumber = await generateDocumentNumber('JRN')
    const journalSvc = new JournalService(tx as any)
    return journalSvc.createJournal({
      journalNumber,
      transactionDate: new Date(),
      referenceType: 'SalesReturn',
      referenceId: srId,
      type: 'SR',
      description: `Retur Penjualan ${srDocumentNo}`,
      createdBy: userId,
      entries: [
        {
          accountId: accounts.inventory,
          debit: totalValue,
          credit: 0,
          memo: `Debit Persediaan - Retur ${srDocumentNo}`,
        },
        {
          accountId: accounts.salesReturn!,
          debit: 0,
          credit: totalValue,
          memo: `Kredit Retur Penjualan - ${srDocumentNo}`,
        },
      ],
    })
  },

  /**
   * Purchase Return (processed) — Stock OUT to vendor.
   *
   *   Dr Purchase Return Account
   *   Cr Inventory Account
   */
  async onPurchaseReturn(
    tx: Prisma.TransactionClient,
    items: JournalItemInput[],
    prDocumentNo: string,
    prId: number,
    userId?: number
  ) {
    const accounts = await getAccountIds()
    if (!accounts.inventory || !accounts.purchaseReturn) return null

    const totalValue = sumValue(items)
    if (totalValue <= 0) return null

    const journalNumber = await generateDocumentNumber('JRN')
    const journalSvc = new JournalService(tx as any)
    return journalSvc.createJournal({
      journalNumber,
      transactionDate: new Date(),
      referenceType: 'PurchaseReturn',
      referenceId: prId,
      type: 'PR',
      description: `Retur Pembelian ${prDocumentNo}`,
      createdBy: userId,
      entries: [
        {
          accountId: accounts.purchaseReturn!,
          debit: totalValue,
          credit: 0,
          memo: `Debit Retur Pembelian - ${prDocumentNo}`,
        },
        {
          accountId: accounts.inventory,
          debit: 0,
          credit: totalValue,
          memo: `Kredit Persediaan - ${prDocumentNo}`,
        },
      ],
    })
  },

  /**
   * Work Order (completed) — Materials OUT to WIP.
   *
   *   Dr WIP Account
   *   Cr Inventory Account
   */
  async onWorkOrderCompleted(
    tx: Prisma.TransactionClient,
    items: JournalItemInput[],
    woDocumentNo: string,
    woId: number,
    userId?: number
  ) {
    const accounts = await getAccountIds()
    if (!accounts.inventory || !accounts.wip) return null

    const totalValue = sumValue(items)
    if (totalValue <= 0) return null

    const journalNumber = await generateDocumentNumber('JRN')
    const journalSvc = new JournalService(tx as any)
    return journalSvc.createJournal({
      journalNumber,
      transactionDate: new Date(),
      referenceType: 'WorkOrder',
      referenceId: woId,
      type: 'WO',
      description: `Produksi WO ${woDocumentNo}`,
      createdBy: userId,
      entries: [
        {
          accountId: accounts.wip!,
          debit: totalValue,
          credit: 0,
          memo: `Debit WIP - WO ${woDocumentNo}`,
        },
        {
          accountId: accounts.inventory,
          debit: 0,
          credit: totalValue,
          memo: `Kredit Persediaan (material) - WO ${woDocumentNo}`,
        },
      ],
    })
  },
}