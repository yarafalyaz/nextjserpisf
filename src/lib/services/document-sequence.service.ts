
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
   */
  static async next(key: string): Promise<number> {
    return await prisma.$transaction(async (tx) => {
      // Atomic upsert — INSERT if not exists, INCREMENT if exists
      await tx.$executeRaw`
        INSERT INTO document_sequences (\`key\`, current_value, created_at, updated_at)
        VALUES (${key}, 1, NOW(), NOW())
        ON DUPLICATE KEY UPDATE current_value = current_value + 1, updated_at = NOW()
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
