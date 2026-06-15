
import { prisma } from '@/lib/db/prisma'

/**
 * Atomic document numbering service.
 * Uses INSERT ON DUPLICATE KEY UPDATE for MySQL to guarantee
 * unique sequential numbers even under concurrent access.
 */
export class DocumentSequenceService {
  /**
   * Get the next sequence number for a given key.
   * Atomically increments the counter using MySQL's ON DUPLICATE KEY UPDATE.
   *
   * @param key    sequence key (e.g. "INV-2026-06")
   * @param floor  optional minimum: the returned value is guaranteed to be
   *               at least `floor + 1`. Used to keep the atomic counter in
   *               sync with the highest document number already present in the
   *               data table, preventing collisions with legacy/manual numbers.
   */
  static async next(key: string, floor = 0): Promise<number> {
    const floorPlusOne = Math.max(1, Math.floor(floor) + 1)
    return await prisma.$transaction(async (tx) => {
      // Atomic upsert — never returns a value below floor+1, and always
      // strictly increases (GREATEST(current_value + 1, floor + 1)).
      await tx.$executeRaw`
        INSERT INTO document_sequences (\`key\`, current_value, created_at, updated_at)
        VALUES (${key}, ${floorPlusOne}, NOW(), NOW())
        ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value + 1, ${floorPlusOne}), updated_at = NOW()
      `

      // Read back the current value with lock to ensure consistency
      const row = await tx.$queryRaw<{ current_value: number }[]>`
        SELECT current_value FROM document_sequences
        WHERE \`key\` = ${key} FOR UPDATE
      `

      if (!row || row.length === 0) {
        throw new Error(`Failed to retrieve sequence for key: ${key}`)
      }

      return Number(row[0].current_value)
    })
  }

  /**
   * Reserve a contiguous block of `count` sequence numbers in ONE atomic
   * round-trip. Returns the assigned numbers in ascending order. Used by bulk
   * operations (e.g. generateBulkPayroll) to replace N serial `next()` calls
   * with a single counter bump. Same floor + GREATEST semantics as `next()`,
   * so the block never collides with legacy/manual document numbers.
   */
  static async nextBatch(key: string, count: number, floor = 0): Promise<number[]> {
    if (count <= 0) return []
    if (count === 1) return [await this.next(key, floor)]

    const floorPlusOne = Math.max(1, Math.floor(floor) + 1)
    // If the row is created fresh, the highest assigned number must cover the
    // whole block AND respect the floor: max(floor+1, 1) + (count-1).
    const insertValue = floorPlusOne + count - 1
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO document_sequences (\`key\`, current_value, created_at, updated_at)
        VALUES (${key}, ${insertValue}, NOW(), NOW())
        ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value + ${count}, ${insertValue}), updated_at = NOW()
      `

      const row = await tx.$queryRaw<{ current_value: number }[]>`
        SELECT current_value FROM document_sequences
        WHERE \`key\` = ${key} FOR UPDATE
      `

      if (!row || row.length === 0) {
        throw new Error(`Failed to retrieve sequence for key: ${key}`)
      }

      const end = Number(row[0].current_value)
      const start = end - count + 1
      return Array.from({ length: count }, (_, i) => start + i)
    })
  }

  /**
   * Peek at the current sequence value without incrementing.
   * Returns 0 if the key doesn't exist yet.
   */
  static async peek(key: string): Promise<number> {
    const row = await prisma.documentSequence.findUnique({ where: { key } })
    return row ? Number(row.currentValue) : 0
  }

  /**
   * Reset a sequence to a specific value.
   * Useful for year-end resets or corrections.
   */
  static async reset(key: string, value: number = 0): Promise<void> {
    await prisma.$executeRaw`
      UPDATE document_sequences
      SET current_value = ${value}, updated_at = NOW()
      WHERE \`key\` = ${key}
    `
  }

  /**
   * Get all sequences matching a prefix pattern.
   * Useful for reporting or auditing.
   */
  static async listByPrefix(prefix: string): Promise<{ key: string; currentValue: number }[]> {
    const rows = await prisma.documentSequence.findMany({
      where: { key: { startsWith: prefix } },
      orderBy: { key: 'asc' },
    })

    return rows.map((r) => ({
      key: r.key,
      currentValue: Number(r.currentValue),
    }))
  }
}
