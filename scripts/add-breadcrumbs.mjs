import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../src/app/(dashboard)')

const MODULE_LABELS = {
  master: 'Master Data',
  sales: 'Sales',
  purchase: 'Purchase',
  inventory: 'Inventory',
  manufacturing: 'Manufacturing',
  hrm: 'HRM',
  finance: 'Finance',
  crm: 'CRM',
  assets: 'Assets',
  vehicles: 'Vehicles',
  projects: 'Projects',
  reports: 'Reports',
  settings: 'Settings',
}

const PAGE_LABELS = {
  departments: 'Departemen',
  positions: 'Jabatan',
  banks: 'Bank',
  taxes: 'Pajak',
  currencies: 'Mata Uang',
  'item-categories': 'Kategori Item',
  customers: 'Customer',
  vendors: 'Vendor',
  items: 'Item',
  warehouses: 'Gudang',
  employees: 'Karyawan',
  quotations: 'Quotation',
  orders: 'Sales Order',
  invoices: 'Invoice',
  payments: 'Pembayaran',
  'delivery-orders': 'Delivery Order',
  'down-payments': 'Down Payment',
  returns: 'Retur',
  requests: 'Purchase Request',
  'goods-receipts': 'Penerimaan Barang',
  bills: 'Vendor Bill',
  'vendor-payments': 'Pembayaran Vendor',
  adjustments: 'Stock Adjustment',
  transfers: 'Transfer',
  'material-issues': 'Material Issue',
  racks: 'Rak',
  'stock-moves': 'Stock Move',
  products: 'Produk',
  'work-orders': 'Work Order',
  'production-orders': 'Production Order',
  leave: 'Cuti',
  overtime: 'Lembur',
  timesheets: 'Timesheet',
  loans: 'Pinjaman',
  'work-schedules': 'Jadwal Kerja',
  holidays: 'Hari Libur',
  attendance: 'Absensi',
  payroll: 'Payroll',
  journals: 'Jurnal',
  expenses: 'Biaya',
  'petty-cash': 'Kas Kecil',
  budgets: 'Anggaran',
  'cost-centers': 'Cost Center',
  'statistical-key-figures': 'SKF',
  leads: 'Lead',
  tickets: 'Tiket',
  categories: 'Kategori',
  brands: 'Brand',
  projects: 'Proyek',
  accounts: 'Akun',
  'price-lists': 'Daftar Harga',
  'tax-groups': 'Grup Pajak',
  uom: 'Satuan',
  barcodes: 'Barcode',
  models: 'Model',
  'bank-reconciliation': 'Rekonsiliasi Bank',
  'bank-statements': 'Mutasi Bank',
  notifications: 'Notifikasi',
  profile: 'Profil',
  users: 'Pengguna',
  approvals: 'Persetujuan',
  'activity-log': 'Log Aktivitas',
  // Reports
  'aging-inventory': 'Aging Inventory',
  'aging-payables': 'Aging Payables',
  'aging-receivables': 'Aging Receivables',
  'balance-sheet': 'Neraca',
  'cash-flow': 'Arus Kas',
  financial: 'Laporan Keuangan',
  'profit-center-income': 'Laba Pusat Biaya',
  'trial-balance': 'Neraca Saldo',
}

// Context-specific order labels for purchase module
const PURCHASE_PAGE_LABELS = {
  orders: 'Purchase Order',
  returns: 'Retur Pembelian',
}

// Context-specific for assets module
const ASSETS_PAGE_LABELS = {
  transfers: 'Transfer Aset',
}

function findAllPages(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('_')) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      findAllPages(fullPath, results)
    } else if (entry.name === 'page.tsx') {
      results.push(fullPath)
    }
  }
  return results
}

function getRelativePath(filePath) {
  return path.relative(ROOT, filePath)
}

function parsePath(relPath) {
  // e.g. "master/departments/[id]/edit/page.tsx"
  const parts = relPath.replace('/page.tsx', '').split('/')
  return parts
}

function getPageType(parts) {
  const last = parts[parts.length - 1]
  if (last === 'create') return 'create'
  if (last === 'edit') return 'edit'
  if (last.startsWith('[')) return 'detail'
  return 'list'
}

function getPageLabel(slug, moduleName) {
  if (moduleName === 'purchase' && PURCHASE_PAGE_LABELS[slug]) {
    return PURCHASE_PAGE_LABELS[slug]
  }
  if (moduleName === 'assets' && ASSETS_PAGE_LABELS[slug]) {
    return ASSETS_PAGE_LABELS[slug]
  }
  return PAGE_LABELS[slug] || slug
}

function buildBreadcrumbItems(parts) {
  const moduleName = parts[0]
  const moduleLabel = MODULE_LABELS[moduleName]
  
  if (!moduleLabel) return null // skip pages like dashboard root, profile, notifications
  
  const pageType = getPageType(parts)
  
  // Determine the page slug
  let pageSlug
  if (pageType === 'list') {
    pageSlug = parts[parts.length - 1]
  } else if (pageType === 'create') {
    pageSlug = parts[parts.length - 2]
  } else if (pageType === 'detail') {
    // [id] is last, page slug is before it
    pageSlug = parts[parts.length - 2]
  } else if (pageType === 'edit') {
    // edit is last, [id] before it, page slug before that
    pageSlug = parts[parts.length - 3]
  }
  
  // Handle nested pages (e.g., assets/brands, vehicles/brands, vehicles/models)
  // Check if the page is a sub-resource of the module
  let isSubResource = false
  let parentSlug = null
  if (parts.length >= 3 && moduleName !== 'master') {
    // e.g. assets/brands/page.tsx or assets/brands/create/page.tsx
    // The module itself might have a list page (assets/page.tsx)
    // and sub-resources like assets/brands, assets/categories, assets/transfers
    if (pageType === 'list' && parts.length === 2) {
      // Direct sub-resource list: e.g. assets/brands
      pageSlug = parts[1]
    }
  }
  
  const pageLabel = getPageLabel(pageSlug, moduleName)
  
  // Build the href for the list page
  let listHref
  if (pageType === 'list') {
    listHref = `/${parts.join('/')}`
  } else if (pageType === 'create') {
    listHref = `/${parts.slice(0, -1).join('/')}`
  } else if (pageType === 'detail') {
    listHref = `/${parts.slice(0, -1).join('/')}`
  } else if (pageType === 'edit') {
    listHref = `/${parts.slice(0, -2).join('/')}`
  }

  // For module href, use the first page in the module
  const moduleHref = `/${moduleName}`

  const items = [
    { label: 'Dashboard', href: '/' },
    { label: moduleLabel, href: moduleHref },
  ]

  if (pageType === 'list') {
    items.push({ label: pageLabel })
  } else if (pageType === 'create') {
    items.push({ label: pageLabel, href: listHref })
    items.push({ label: 'Tambah' })
  } else if (pageType === 'detail') {
    items.push({ label: pageLabel, href: listHref })
    items.push({ label: 'Detail' })
  } else if (pageType === 'edit') {
    items.push({ label: pageLabel, href: listHref })
    items.push({ label: 'Edit' })
  }

  return items
}

function formatBreadcrumbItems(items) {
  const parts = items.map(item => {
    if (item.href) {
      return `{ label: "${item.label}", href: "${item.href}" }`
    }
    return `{ label: "${item.label}" }`
  })
  return `[${parts.join(', ')}]`
}

function addBreadcrumbsToFile(filePath, items) {
  let content = fs.readFileSync(filePath, 'utf-8')
  
  // Skip if already has breadcrumbs
  if (content.includes('AppBreadcrumbs')) {
    console.log(`SKIP (already has): ${filePath}`)
    return
  }
  
  // Skip if no page-container div
  if (!content.includes('page-container')) {
    console.log(`SKIP (no page-container): ${filePath}`)
    return
  }

  const importStatement = `import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"`
  const breadcrumbJsx = `<AppBreadcrumbs items={${formatBreadcrumbItems(items)}} />`

  // Add import - find the right place
  // Check if it's a "use client" file
  const isClient = content.includes('"use client"') || content.includes("'use client'")
  
  // Find the last import statement
  const importRegex = /^import .+$/gm
  let lastImportMatch
  let match
  while ((match = importRegex.exec(content)) !== null) {
    lastImportMatch = match
  }
  
  if (lastImportMatch) {
    const insertPos = lastImportMatch.index + lastImportMatch[0].length
    content = content.slice(0, insertPos) + '\n' + importStatement + content.slice(insertPos)
  } else {
    // No imports found, add after "use client" or at top
    if (isClient) {
      const clientIdx = content.indexOf('"use client"') !== -1 
        ? content.indexOf('"use client"') + '"use client"'.length
        : content.indexOf("'use client'") + "'use client'".length
      content = content.slice(0, clientIdx) + '\n\n' + importStatement + content.slice(clientIdx)
    } else {
      content = importStatement + '\n\n' + content
    }
  }

  // Add breadcrumb JSX after <div className="page-container">
  const containerPattern = /<div className="page-container">/
  const containerMatch = content.match(containerPattern)
  if (containerMatch) {
    const insertIdx = content.indexOf(containerMatch[0]) + containerMatch[0].length
    // Check what comes after - add newline and proper indentation
    const afterContainer = content.slice(insertIdx)
    const indentMatch = afterContainer.match(/^\n(\s*)/)
    const indent = indentMatch ? indentMatch[1] : '      '
    content = content.slice(0, insertIdx) + '\n' + indent + breadcrumbJsx + content.slice(insertIdx)
  }

  fs.writeFileSync(filePath, content)
  console.log(`DONE: ${filePath}`)
}

// Special handling for pages that are module-level (e.g., projects/page.tsx, vehicles/page.tsx, assets/page.tsx)
function isModuleLevelListPage(parts) {
  return parts.length === 2 && parts[1] === 'page.tsx'
}

// Main
const allPages = findAllPages(ROOT)
let processed = 0
let skipped = 0

for (const filePath of allPages) {
  const relPath = getRelativePath(filePath)
  const parts = parsePath(relPath)
  
  // Skip the dashboard root page
  if (relPath === 'page.tsx') {
    console.log(`SKIP (dashboard root): ${filePath}`)
    skipped++
    continue
  }
  
  // Skip pages without a recognized module
  const moduleName = parts[0]
  if (!MODULE_LABELS[moduleName]) {
    console.log(`SKIP (unknown module ${moduleName}): ${filePath}`)
    skipped++
    continue
  }
  
  // For module-level pages (e.g., projects/page.tsx, vehicles/page.tsx, assets/page.tsx)
  // These are list pages for the module itself
  let items
  if (parts.length === 1) {
    // This is a module-level list page like projects/page.tsx -> parts = ['projects']
    // Actually with parsePath removing page.tsx, projects/page.tsx -> ['projects']
    const moduleLabel = MODULE_LABELS[moduleName]
    const pageLabel = PAGE_LABELS[moduleName] || moduleLabel
    items = [
      { label: 'Dashboard', href: '/' },
      { label: moduleLabel },
    ]
  } else {
    items = buildBreadcrumbItems(parts)
  }
  
  if (!items) {
    console.log(`SKIP (no items): ${filePath}`)
    skipped++
    continue
  }
  
  addBreadcrumbsToFile(filePath, items)
  processed++
}

console.log(`\nDone! Processed: ${processed}, Skipped: ${skipped}`)
