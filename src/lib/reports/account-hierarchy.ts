/**
 * Helper to gather an account ID and all of its descendant IDs recursively.
 */
export interface AccountHierarchyItem {
  id: number
  parentId?: number | null
}

export function collectDescendantAccountIds(
  accounts: AccountHierarchyItem[],
  rootId: number,
): number[] {
  const result = new Set<number>([rootId])
  let added = true

  while (added) {
    added = false
    for (const acc of accounts) {
      if (acc.parentId != null && result.has(acc.parentId) && !result.has(acc.id)) {
        result.add(acc.id)
        added = true
      }
    }
  }

  return Array.from(result)
}
