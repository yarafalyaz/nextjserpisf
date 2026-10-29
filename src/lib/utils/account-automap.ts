/**
 * Pure auto-mapping of the chart of accounts onto the system-settings account
 * fields (Pengaturan → Akuntansi → "Auto-Map Akun").
 *
 * Kept as a plain function — no React — so the mapping rules (especially the
 * requirement that Persediaan and the purchase-clearing/GRNI account stay
 * DISTINCT) can be unit-tested without rendering the settings form.
 */

export interface AutomapAccount {
  id: number;
  code: string;
  name: string;
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[&()/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * First account whose `code name` contains every keyword of the earliest matching group.
 *
 * Pencocokan dilakukan PER KATA (token), bukan substring: dengan substring,
 * kata kunci "utang" ikut cocok dengan "pi-UTANG usaha" sehingga akun Utang
 * Usaha dan Piutang Usaha bisa tertukar. Kode akun ikut menjadi token sehingga
 * aturan bisa menjangkar ke kode standar (mis. "2101") secara tepat.
 */
function findAccountId(
  accounts: AutomapAccount[],
  keywordGroups: string[][],
  exclude?: Set<string>,
): string {
  const tokensOf = (value: string) => normalize(value).split(" ").filter(Boolean);

  // Exact token matches across ALL groups win over prefix matches: needle
  // "5101" must prefer code 5101 itself (or name rule "harga pokok
  // penjualan") over child code 510104, otherwise COGS auto-maps onto
  // Beban Garansi (F-2026-10-21-021). Prefix stays as legacy fallback.
  const findIn = (exact: boolean) => {
    for (const keywords of keywordGroups) {
      const match = accounts.find((account) => {
        if (exclude?.has(String(account.id))) return false;
        const tokens = tokensOf(`${account.code} ${account.name}`);
        return keywords.every((keyword) => {
          const needle = normalize(keyword);
          return tokens.some((token) => (exact ? token === needle : token === needle || token.startsWith(needle)));
        });
      });
      if (match) return String(match.id);
    }
    return "";
  };
  return findIn(true) || findIn(false);
}

const INVENTORY_GROUPS = [
  ["persediaan", "barang", "dagang"],
  ["persediaan", "sparepart"],
  ["persediaan"],
  ["inventory"],
];

// Explicitly-named clearing / GRNI accounts, in priority order. If none of
// these exist we fall back (below) to any non-inventory account.
const CLEARING_GROUPS = [
  ["hutang", "pembelian", "belum", "ditagih"],
  ["barang", "belum", "ditagih"],
  ["penerimaan", "barang", "belum"],
  ["grni"],
  ["clearing"],
  ["persediaan", "pembelian"],
  ["hutang", "pembelian"],
];

const CLEARING_FALLBACK_GROUPS = [
  ["barang", "dagang"],
  ["persediaan", "sparepart"],
  ["persediaan"],
  ["inventory"],
  ["hutang", "usaha"],
  ["utang", "usaha"],
  ["payable"],
];

/**
 * Resolve Persediaan + the purchase-clearing (GRNI) account so they are never
 * the SAME account: the goods-receipt journal posts Dr Persediaan / Cr clearing,
 * and if both resolve to one account the entry nets to zero and inventory value
 * silently never reaches the general ledger.
 */
export function resolveInventoryAccounts(accounts: AutomapAccount[]): {
  inventoryAccountId: string;
  purchaseInventoryAccountId: string;
} {
  const inventoryAccountId = findAccountId(accounts, INVENTORY_GROUPS);
  const excludeInventory = new Set(inventoryAccountId ? [inventoryAccountId] : []);

  let purchaseInventoryAccountId = findAccountId(accounts, CLEARING_GROUPS, excludeInventory);
  if (!purchaseInventoryAccountId) {
    purchaseInventoryAccountId = findAccountId(
      accounts,
      CLEARING_FALLBACK_GROUPS,
      excludeInventory,
    );
  }

  return { inventoryAccountId, purchaseInventoryAccountId };
}

// ── Fixed assets ────────────────────────────────────────────────────────────
// "Beban Penyusutan" (P&L) and "Akumulasi Penyusutan" (contra-asset) both
// contain the word "penyusutan", so the accumulated account is resolved FIRST
// and excluded from the expense lookup — otherwise the bare ["penyusutan"]
// fallback would assign the accumulated account (code 2400) to the expense
// field and the depreciation journal would debit the wrong account.
const ACCUMULATED_DEPRECIATION_GROUPS = [
  ["akumulasi", "penyusutan"],
  ["akumulasi"],
  ["accumulated", "depreciation"],
];

const DEPRECIATION_EXPENSE_GROUPS = [
  ["beban", "penyusutan"],
  ["beban", "depresiasi"],
  ["penyusutan"],
  ["depreciation", "expense"],
];

/**
 * Resolve the two asset-depreciation accounts that are stored on SystemSetting
 * (Beban Penyusutan + Akumulasi Penyusutan). The fixed-asset control account has
 * no system-settings field — it is set per asset category — so it is not
 * resolved here.
 */
export function resolveAssetAccounts(accounts: AutomapAccount[]): {
  depreciationExpenseAccountId: string;
  accumulatedDepreciationAccountId: string;
} {
  const accumulatedDepreciationAccountId = findAccountId(
    accounts,
    ACCUMULATED_DEPRECIATION_GROUPS,
  );
  const excludeAccumulated = new Set(
    accumulatedDepreciationAccountId ? [accumulatedDepreciationAccountId] : [],
  );
  const depreciationExpenseAccountId = findAccountId(
    accounts,
    DEPRECIATION_EXPENSE_GROUPS,
    excludeAccumulated,
  );

  return { depreciationExpenseAccountId, accumulatedDepreciationAccountId };
}

/**
 * Keyword rules for every account field on SystemSetting, in priority order.
 * Moved verbatim from the settings form's "Auto-Map Akun" handler so the
 * first-run install and the form share one implementation.
 *
 * Pairs that must never resolve to the same account (Persediaan vs GRNI/clearing,
 * Beban vs Akumulasi Penyusutan) are excluded here and handled below.
 */
export const ACCOUNT_MAPPING_RULES: { key: string; groups: string[][] }[] = [
  { key: "salesReceivableAccountId", groups: [["piutang", "usaha"], ["1103"], ["piutang", "dagang"], ["receivable"]] },
  { key: "salesRevenueAccountId", groups: [["pendapatan", "penjualan"], ["400001"], ["pendapatan", "jasa"], ["revenue"], ["penjualan"]] },
  { key: "salesTaxAccountId", groups: [["ppn", "keluaran"], ["210201"], ["ppn", "keluar"], ["tax", "out"]] },
  { key: "salesReturnAccountId", groups: [["retur", "penjualan"], ["400003"], ["sales", "return"]] },
  // AUD-FIN-01: kewajiban Uang Muka Penjualan (CoA 210102). Grup "uang","muka"
  // duluan agar tak tertukar Piutang ("1103"/"piutang") maupun Utang Usaha.
  { key: "customerDownPaymentAccountId", groups: [["uang", "muka", "penjualan"], ["210102"], ["uang", "muka"], ["down", "payment"]] },
  // F-2026-10-21-021 tahap 3: akun garansi final vonis BOT 4 (koreksi F-69).
  // Kode persis didahulukan; 510103 (Penyesuaian Persediaan) DILARANG garansi.
  { key: "warrantyExpenseAccountId", groups: [["510104"], ["beban", "garansi"], ["warranty", "expense"]] },
  { key: "warrantyProvisionAccountId", groups: [["210205"], ["provisi", "garansi"], ["warranty", "provision"]] },
  { key: "supplierClaimReceivableAccountId", groups: [["110508"], ["piutang", "klaim", "supplier"], ["supplier", "claim"]] },
  { key: "salesAccountId", groups: [["pendapatan", "penjualan"], ["400001"], ["akun", "penjualan"], ["sales", "account"], ["penjualan"]] },
  { key: "purchasePayableAccountId", groups: [["hutang", "usaha"], ["utang", "usaha"], ["2101"], ["hutang", "dagang"], ["payable"]] },
  { key: "purchaseTaxAccountId", groups: [["ppn", "masukan"], ["110504"], ["ppn", "masuk"], ["tax", "in"]] },
  // COA Accurate tidak punya akun khusus "beban pembelian" → pakai Beban
  // Operasional Lainnya (600020) sebagai akun beban jasa/biaya pembelian.
  { key: "purchaseExpenseAccountId", groups: [["beban", "pembelian"], ["beban", "operasional", "lainnya"], ["600020"], ["purchase", "expense"]] },
  { key: "purchaseDiscountAccountId", groups: [["diskon", "pembelian"], ["600025"], ["purchase", "discount"]] },
  { key: "purchaseShippingAccountId", groups: [["ongkos", "kirim"], ["ekspedisi"], ["600014"], ["shipping"], ["ongkir"]] },
  { key: "purchaseAdminFeeAccountId", groups: [["admin", "bank"], ["adm", "bank"], ["720002"], ["admin", "transfer"], ["bank", "fee"]] },
  { key: "purchaseReturnAccountId", groups: [["retur", "pembelian"], ["600026"], ["purchase", "return"]] },
  { key: "inventoryAdjustmentAccountId", groups: [["penyesuaian", "persediaan"], ["510103"], ["inventory", "adj"]] },
  { key: "stockAdjustmentAccountId", groups: [["penyesuaian", "persediaan"], ["510103"], ["inventory", "adj"], ["stock", "adjustment"]] },
  // Nama standar Accurate: "Beban Pokok Penjualan" (5101), bukan "Harga Pokok Penjualan".
  { key: "cogsAccountId", groups: [["beban", "pokok", "penjualan"], ["harga", "pokok", "penjualan"], ["5101"], ["hpp"], ["cogs"]] },
  { key: "wipAccountId", groups: [["barang", "dalam", "proses"], ["110404"], ["wip"], ["work", "progress"]] },
  { key: "materialExpenseAccountId", groups: [["beban", "material"], ["510102"], ["material", "expense"]] },
  { key: "materialIssueExpenseAccountId", groups: [["beban", "material"], ["510102"], ["material", "issue"], ["consumables"]] },
  { key: "pettyCashAccountId", groups: [["kas", "kecil"], ["110101"], ["petty", "cash"]] },
  { key: "cashBankAccountId", groups: [["kas", "bank"], ["1101"], ["bank"], ["kas", "utama"], ["kas"]] },
  { key: "generalExpenseAccountId", groups: [["beban", "umum"], ["beban", "operasional", "lainnya"], ["600020"], ["administrasi"], ["general", "expense"]] },
  { key: "defaultCashAccountId", groups: [["kas", "utama"], ["kas", "bank"], ["1101"], ["bank"], ["kas"]] },
  { key: "salaryExpenseAccountId", groups: [["beban", "gaji"], ["600004"], ["salary", "expense"]] },
  { key: "salariesPayableAccountId", groups: [["hutang", "gaji"], ["utang", "gaji"], ["210204"], ["salaries", "payable"]] },
  // F-2026-10-24-132-V: mapping kompensasi PKWT (kode persis didahulukan).
  { key: "pkwtCompensationExpenseAccountId", groups: [["600028"], ["beban", "kompensasi", "pkwt"], ["pkwt", "compensation", "expense"]] },
  { key: "pkwtCompensationPayableAccountId", groups: [["210207"], ["utang", "kompensasi", "pkwt"], ["pkwt", "compensation", "payable"]] },
  // F-2026-10-24-135-V Putusan 4: kandidat 710003 Penjualan Persediaan /
  // Perlengkapan (OINC) — automap hanya saran; kosong tetap fail-closed.
  // F-2026-10-25-018-V Putusan 3: kode persis 210209 didahulukan; 210204/210101/210205 dilarang.
  { key: "reimbursementLiabilityAccountId", groups: [["210209"], ["utang", "reimbursement"], ["reimbursement"]] },
  { key: "scrapSaleIncomeAccountId", groups: [["710003"], ["penjualan", "persediaan"]] },
  // Bank payroll didahulukan ke akun "Bank" (110102), bukan "Kas & Bank".
  { key: "payrollBankAccountId", groups: [["110102"], ["bank", "buku"], ["bank"], ["kas", "bank"], ["kas", "utama"]] },
  { key: "employeeReceivableAccountId", groups: [["piutang", "karyawan"], ["110506"], ["employee", "receivable"]] },
  // F-2026-10-29-162-V (c): beban write-off piutang karyawan — default
  // 720007 (OEXP non-operasional), bukan 6000/EXPS.
  { key: "employeeLoanWriteOffExpenseAccountId", groups: [["720007"], ["beban", "diluar", "usaha"], ["write", "off"]] },
  // Tahap 3 komisi (vonis R-komisi-vonispayable §4): kode persis
  // didahulukan; 210204–210211 DILARANG untuk jalur ini.
  { key: "commissionExpenseAccountId", groups: [["600002"], ["beban", "komisi"], ["commission", "expense"]] },
  { key: "commissionPayableAccountId", groups: [["210212"], ["utang", "komisi"], ["commission", "payable"]] },
  { key: "payrollJournalTypeId", groups: [["beban", "gaji"], ["hutang", "gaji"], ["jurnal", "payroll"], ["payroll", "journal"]] },
];

/**
 * Every account field auto-mapping can fill — used by the settings checklist to
 * report how many mappings are still empty.
 */
export const ACCOUNT_MAPPING_FIELDS: string[] = [
  ...ACCOUNT_MAPPING_RULES.map((rule) => rule.key),
  "inventoryAccountId",
  "purchaseInventoryAccountId",
  "depreciationExpenseAccountId",
  "accumulatedDepreciationAccountId",
];

/**
 * Resolve EVERY account field on SystemSetting at once — the whole "Auto-Map
 * Akun" result, keyed by the exact Prisma field name. Empty string means no
 * match was found (the caller keeps the field unset).
 */
export function resolveAllAccountMappings(accounts: AutomapAccount[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const rule of ACCOUNT_MAPPING_RULES) {
    mapping[rule.key] = findAccountId(accounts, rule.groups);
  }

  const inventory = resolveInventoryAccounts(accounts);
  mapping.inventoryAccountId = inventory.inventoryAccountId;
  mapping.purchaseInventoryAccountId = inventory.purchaseInventoryAccountId;

  const assets = resolveAssetAccounts(accounts);
  mapping.depreciationExpenseAccountId = assets.depreciationExpenseAccountId;
  mapping.accumulatedDepreciationAccountId = assets.accumulatedDepreciationAccountId;

  return mapping;
}
