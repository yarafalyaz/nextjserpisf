/**
 * Batch migrate table wrapper components to forward serverPagination prop.
 * Robust version that correctly handles both named interfaces and inline types.
 */
import fs from "fs"
import path from "path"

const DASHBOARD = path.resolve("src/app/(dashboard)")

const TABLE_WRAPPERS = [
  "master/barang/_components/item-table.tsx",
  "master/pelanggan/_components/customer-table.tsx",
  "master/merek/_components/brand-table.tsx",
  "master/pajak/_components/tax-table.tsx",
  "master/kategori-barang/_components/item-category-table.tsx",
  "master/mata-uang/_components/currency-table.tsx",
  "master/metode-pengiriman/_components/shipping-method-table.tsx",
  "master/kelompok-pajak/_components/tax-group-table.tsx",
  "master/departemen/_components/department-table.tsx",
  "master/gudang/_components/warehouse-table.tsx",
  "master/jabatan/_components/position-table.tsx",
  "master/barcode/_components/barcode-table.tsx",
  "master/syarat-pembayaran/_components/payment-term-table.tsx",
  "penjualan/pesanan/_components/order-table.tsx",
  "penjualan/retur/_components/return-table.tsx",
  "penjualan/pembayaran/_components/payment-table.tsx",
  "penjualan/penawaran/_components/quotation-table.tsx",
  "penjualan/faktur/_components/invoice-table.tsx",
  "penjualan/surat-jalan/_components/delivery-order-table.tsx",
  "penjualan/uang-muka/_components/down-payment-table.tsx",
  "pembelian/pesanan/_components/purchase-order-table.tsx",
  "pembelian/retur/_components/purchase-return-table.tsx",
  "pembelian/pembayaran-vendor/_components/vendor-payment-table.tsx",
  "pembelian/penerimaan/_components/goods-receipt-table.tsx",
  "pembelian/tagihan/_components/vendor-bill-table.tsx",
  "pembelian/permintaan/_components/purchase-request-table.tsx",
  "proyek/_components/project-table.tsx",
  "proyek/tugas/_components/task-table.tsx",
  "aset/_components/asset-table.tsx",
  "aset/merek/_components/asset-brand-table.tsx",
  "aset/kategori/_components/asset-category-table.tsx",
  "aset/transfer/_components/asset-transfer-table.tsx",
  "produksi/production-orders/_components/production-order-table.tsx",
  "produksi/perintah-kerja/_components/work-order-table.tsx",
  "produksi/products/_components/product-table.tsx",
  "inventaris/baris-rak/_components/rack-row-table.tsx",
  "inventaris/mutasi-stok/_components/stock-move-table.tsx",
  "inventaris/transfer/_components/transfer-table.tsx",
  "inventaris/penyesuaian/_components/adjustment-table.tsx",
  "inventaris/pengeluaran-material/_components/material-issue-table.tsx",
  "inventaris/rak/_components/rack-table.tsx",
  "keuangan/pusat-biaya/_components/cost-center-table.tsx",
  "keuangan/anggaran/_components/budget-table.tsx",
  "keuangan/angka-kunci-statistik/_components/statistical-key-figure-table.tsx",
  "keuangan/kas-kecil/_components/petty-cash-table.tsx",
  "crm/leads/_components/lead-table.tsx",
  "crm/tickets/_components/ticket-table.tsx",
  "kendaraan/_components/vehicle-table.tsx",
  "kendaraan/merek/_components/vehicle-brand-table.tsx",
  "sdm/penggajian/_components/payroll-table.tsx",
  "sdm/lembur/_components/overtime-table.tsx",
]

/** Find the matching closing brace, accounting for nesting. */
function findMatchingBrace(text, openPos) {
  let depth = 0
  for (let i = openPos; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

let modified = 0
let skipped = 0

for (const rel of TABLE_WRAPPERS) {
  const file = path.join(DASHBOARD, rel)
  if (!fs.existsSync(file)) {
    console.log(`SKIP (not found): ${rel}`)
    skipped++
    continue
  }

  let content = fs.readFileSync(file, "utf-8")
  let changed = false

  // --- 1. Add ServerPagination to the DataTable import ---
  if (!content.includes("ServerPagination")) {
    const importRe = /import \{ DataTable \} from ["']@\/components\/ui\/data-table["']/
    content = content.replace(importRe, 'import { DataTable, type ServerPagination } from "@/components/ui/data-table"')
    if (content !== fs.readFileSync(file, "utf-8")) changed = true
  }

  // --- 2. Add serverPagination to props ---
  if (!content.includes("serverPagination")) {
    // Pattern A: Named interface `interface FooProps {` with a `data:` property
    const namedIfaceIdx = content.search(/interface\s+\w+Props\s*\{/)
    if (namedIfaceIdx > -1) {
      const braceStart = content.indexOf("{", namedIfaceIdx)
      const closingIdx = findMatchingBrace(content, braceStart)
      if (closingIdx > -1) {
        // Insert before the closing brace
        const beforeClosing = content.slice(0, closingIdx)
        const afterClosing = content.slice(closingIdx)
        // Determine indentation from the line containing the interface
        const lineStart = beforeClosing.lastIndexOf("\n") + 1
        const indent = (beforeClosing.slice(lineStart).match(/^(\s*)/) || ["", "  "])[1]
        content = beforeClosing + indent + "  serverPagination?: ServerPagination\n" + afterClosing
        changed = true
      }
    } else {
      // Pattern B: Inline type `({ data }: { data: Foo[] })`
      // Find the function signature line with inline type
      const funcMatch = content.match(/(\w+Table\w*|Table)\s*\(\s*\{[^}]*\}\s*:\s*\{/)
      if (funcMatch) {
        const matchStart = content.indexOf(funcMatch[0])
        // Find the inline type's opening brace
        const inlineBraceStart = content.indexOf("{", matchStart + funcMatch[0].length - 1)
        const closingIdx = findMatchingBrace(content, inlineBraceStart)
        if (closingIdx > -1) {
          const before = content.slice(0, closingIdx)
          const after = content.slice(closingIdx)
          content = before + "; serverPagination?: ServerPagination " + after
          changed = true
        }
      }
    }
  }

  // --- 3. Add serverPagination={serverPagination} to the DataTable JSX ---
  if (!content.includes("serverPropagation={serverPropagation}")) {
    const dtIdx = content.indexOf("<DataTable")
    if (dtIdx > -1) {
      // Find the first /> or > after <DataTable
      let i = dtIdx
      let braceDepth = 0
      while (i < content.length) {
        const ch = content[i]
        if (ch === '{') braceDepth++
        else if (ch === '}') braceDepth--
        else if (braceDepth === 0) {
          if (ch === '/' && content[i + 1] === '>') {
            // Self-closing /> — insert before it
            const propLine = `\n      serverPagination={serverPagination}\n    `
            content = content.slice(0, i) + propLine + content.slice(i)
            changed = true
            break
          }
          if (ch === '>') {
            // Opening tag closes — insert before >
            const propLine = `\n      serverPagination={serverPagination}\n    `
            content = content.slice(0, i) + propLine + content.slice(i)
            changed = true
            break
          }
        }
        i++
      }
    }
  }

  if (!changed) {
    console.log(`SKIP (no changes): ${rel}`)
    skipped++
    continue
  }

  fs.writeFileSync(file, content)
  modified++
  console.log(`OK: ${rel}`)
}

console.log(`\nDone: ${modified} modified, ${skipped} skipped`)
