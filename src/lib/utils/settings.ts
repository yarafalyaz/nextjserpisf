// @ts-nocheck
import { prisma } from '@/lib/db/prisma'
import { cache } from 'react'

/**
 * System settings singleton with React cache.
 * Cached per-request in RSC — avoids redundant DB queries within a single render.
 * Creates default settings if none exist.
 */
export const getSystemSettings = cache(async () => {
  let settings = await prisma.systemSetting.findFirst()

  if (!settings) {
    settings = await prisma.systemSetting.create({
      data: {
        companyName: 'Yara ERP',
        companyEmail: 'admin@yaraerp.co.id',
        companyPhone: null,
        companyAddress: null,
        companyLogo: null,
        costingMethod: 'FIFO',
        fiscalYearStartMonth: 1,
        currencyCode: 'IDR',
        currencySymbol: 'Rp ',
        taxRate: 11,
        defaultPaymentTermDays: 30,
        salesReceivableAccountId: null,
        salesRevenueAccountId: null,
        salesTaxAccountId: null,
        purchasePayableAccountId: null,
        purchaseExpenseAccountId: null,
        inventoryAccountId: null,
        cashAccountId: null,
        bankAccountId: null,
      },
    })
  }

  return settings
})

/**
 * Get a specific setting value by key.
 * Falls back to the full settings object.
 */
export async function getSettingValue<T = string>(
  key: keyof Awaited<ReturnType<typeof getSystemSettings>>
): Promise<T | null> {
  const settings = await getSystemSettings()
  const value = settings[key]
  return (value as T) ?? null
}
