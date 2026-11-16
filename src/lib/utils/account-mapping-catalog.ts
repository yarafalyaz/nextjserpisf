/**
 * Katalog tunggal (Single Source of Truth) untuk seluruh grup dan field
 * mapping akun pada `SystemSetting`.
 *
 * Dipakai bersama oleh `/pengaturan/mapping-akun` (tampilan) dan
 * `/pengaturan/mapping-akun/ubah` (`SettingsEditForm`), sehingga jumlah
 * dan label akun tidak pernah menyimpang antar halaman.
 */

export interface AccountMappingFieldDef {
  key: string
  label: string
}

export interface AccountMappingGroupDef {
  title: string
  items: readonly AccountMappingFieldDef[]
}

export const ACCOUNT_MAPPING_CATALOG: readonly AccountMappingGroupDef[] = [
  {
    title: "Penjualan",
    items: [
      { key: "salesReceivableAccountId", label: "Piutang Usaha" },
      { key: "customerDownPaymentAccountId", label: "Uang Muka Penjualan / DP (210102)" },
      { key: "salesRevenueAccountId", label: "Pendapatan Penjualan" },
      { key: "scrapSaleIncomeAccountId", label: "Pendapatan Besi Tua Scrap (kandidat 710003)" },
      { key: "salesTaxAccountId", label: "PPN Keluaran" },
      { key: "salesReturnAccountId", label: "Retur Penjualan" },
      { key: "salesAccountId", label: "Akun Penjualan" },
    ],
  },
  {
    title: "Pembelian",
    items: [
      { key: "purchasePayableAccountId", label: "Hutang Usaha" },
      { key: "purchaseInventoryAccountId", label: "Persediaan (Pembelian)" },
      { key: "purchaseTaxAccountId", label: "PPN Masukan" },
      { key: "purchaseExpenseAccountId", label: "Beban Pembelian" },
      { key: "purchaseDiscountAccountId", label: "Diskon Pembelian" },
      { key: "purchaseShippingAccountId", label: "Ongkos Kirim" },
      { key: "purchaseAdminFeeAccountId", label: "Beban Admin Bank" },
      { key: "purchaseReturnAccountId", label: "Retur Pembelian" },
    ],
  },
  {
    title: "Persediaan & Manufaktur",
    items: [
      { key: "inventoryAccountId", label: "Persediaan" },
      { key: "inventoryAdjustmentAccountId", label: "Penyesuaian Persediaan" },
      { key: "stockAdjustmentAccountId", label: "Penyesuaian Stok" },
      { key: "cogsAccountId", label: "HPP (COGS)" },
      { key: "wipAccountId", label: "WIP" },
      { key: "materialExpenseAccountId", label: "Beban Material" },
      { key: "materialIssueExpenseAccountId", label: "Beban Pengeluaran Material" },
    ],
  },
  {
    title: "Garansi",
    items: [
      { key: "warrantyExpenseAccountId", label: "Beban Garansi (510104)" },
      { key: "warrantyProvisionAccountId", label: "Provisi Garansi (210205)" },
    ],
  },
  {
    title: "Klaim Supplier & Reimbursement",
    items: [
      { key: "supplierClaimReceivableAccountId", label: "Piutang Klaim Supplier (110508)" },
      { key: "reimbursementLiabilityAccountId", label: "Utang Reimbursement (210209)" },
      { key: "commissionExpenseAccountId", label: "Beban Komisi (600002)" },
      { key: "commissionPayableAccountId", label: "Utang Komisi Penjualan (210212)" },
    ],
  },
  {
    title: "Umum & Kas",
    items: [
      { key: "pettyCashAccountId", label: "Kas Kecil" },
      { key: "cashBankAccountId", label: "Kas & Bank" },
      { key: "generalExpenseAccountId", label: "Beban Umum" },
      { key: "defaultCashAccountId", label: "Kas Default" },
    ],
  },
  {
    title: "Penggajian",
    items: [
      { key: "salaryExpenseAccountId", label: "Beban Gaji" },
      { key: "salariesPayableAccountId", label: "Hutang Gaji" },
      { key: "payrollBankAccountId", label: "Bank Penggajian" },
      { key: "employeeReceivableAccountId", label: "Piutang Karyawan" },
      { key: "employeeLoanWriteOffExpenseAccountId", label: "Beban Write-off Pinjaman (720007)" },
      { key: "payrollJournalTypeId", label: "Tipe Jurnal Penggajian" },
      { key: "pkwtCompensationExpenseAccountId", label: "Beban Kompensasi PKWT (600028)" },
      { key: "pkwtCompensationPayableAccountId", label: "Utang Kompensasi PKWT (210207)" },
    ],
  },
  {
    title: "Aset Tetap",
    items: [
      { key: "depreciationExpenseAccountId", label: "Beban Penyusutan" },
      { key: "accumulatedDepreciationAccountId", label: "Akumulasi Penyusutan" },
      { key: "assetFiscalRevaluationTaxPayableAccountId", label: "Utang PPh Final Revaluasi Fiskal" },
    ],
  },
  {
    title: "Penutup Tahun",
    items: [
      { key: "retainedEarningsAccountId", label: "Laba Ditahan (Tujuan Penutup Tahun)" },
      { key: "lateFeeIncomeAccountId", label: "Pendapatan Denda Keterlambatan Piutang" },
    ],
  },
] as const

export const ACCOUNT_MAPPING_CATALOG_KEYS: string[] = ACCOUNT_MAPPING_CATALOG.flatMap(
  (group) => group.items.map((item) => item.key),
)
