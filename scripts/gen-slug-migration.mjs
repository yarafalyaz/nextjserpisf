/**
 * Emit the migration SQL for the slug columns: for each model that now has a
 * `slug String? @unique`, add the column + a unique index on its mapped table.
 *
 * Usage: node scripts/gen-slug-migration.mjs > prisma/migrations/<dir>/migration.sql
 */
import { readFileSync } from "node:fs"

const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8")

// Split into model blocks.
const blocks = schema.split(/\nmodel\s+/).slice(1)

const out = []
out.push("-- Add a nullable, unique `slug` column to every routed entity table.")
out.push("-- Slugs are backfilled by scripts/backfill-slugs.mjs after migration.")

for (const block of blocks) {
  const name = block.match(/^(\w+)/)?.[1]
  if (!name) continue
  if (!/^\s*slug\s+String\?\s+@unique/m.test(block)) continue
  const table = block.match(/@@map\("([^"]+)"\)/)?.[1] ?? name
  out.push("")
  out.push(`ALTER TABLE \`${table}\` ADD COLUMN \`slug\` VARCHAR(191) NULL;`)
  out.push(`CREATE UNIQUE INDEX \`${table}_slug_key\` ON \`${table}\`(\`slug\`);`)
}

console.log(out.join("\n"))
