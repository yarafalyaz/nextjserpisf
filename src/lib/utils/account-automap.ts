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

/** First account whose `code name` contains every keyword of the earliest matching group. */
function findAccountId(
  accounts: AutomapAccount[],
  keywordGroups: string[][],
  exclude?: Set<string>,
): string {
  for (const keywords of keywordGroups) {
    const match = accounts.find((account) => {
      if (exclude?.has(String(account.id))) return false;
      const haystack = normalize(`${account.code} ${account.name}`);
      return keywords.every((keyword) => haystack.includes(normalize(keyword)));
    });
    if (match) return String(match.id);
  }
  return "";
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
