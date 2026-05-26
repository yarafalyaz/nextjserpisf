import fs from 'fs'
import path from 'path'

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
  notifications: 'Notifications',
  profile: 'Profile',
}

const PAGE_LABELS = {
  accounts: 'Accounts',
  banks: 'Banks',
  barcodes: 'Barcodes',
  currencies: 'Currencies',
  customers: 'Customers',
  departments: 'Departments',
  employees: 'Employees',
  'item-categories': 'Item Categories',
  items: 'Items',
  positions: 'Positions',
  'price-lists': 'Price Lists',
  'tax-groups': 'Tax Groups',
  taxes: 'Taxes',
  uom: 'UoM',
  vendors: 'Vendors',
  warehouses: 'Warehouses',
  quotations: 'Quotations',
  payments: 'Payments',
  returns: 'Returns',
  invoices: 'Invoices',
  'vendor-payments': 'Vendor Payments',
  racks: 'Racks',
  'stock-moves': 'Stock Moves',
  transfers: 'Transfers',
  'production-orders': 'Production Orders',
  products: 'Products',
  'work-orders': 'Work Orders',
  leads: 'Leads',
  tickets: 'Tickets',
  'bank-reconciliation': 'Bank Reconciliation',
  'bank-statements': 'Bank Statements',
  budgets: 'Budgets',
  'cost-centers': 'Cost Centers',
  brands: 'Brands',
  categories: 'Categories',
  models: 'Models',
  'activity-log': 'Activity Log',
  approvals: 'Approvals',
  users: 'Users',
  'aging-inventory': 'Aging Inventory',
  'aging-payables': 'Aging Payables',
  'aging-receivables': 'Aging Receivables',
  'balance-sheet': 'Balance Sheet',
  'cash-flow': 'Cash Flow',
  financial: 'Financial',
  'profit-center-income': 'Profit Center Income',
  'trial-balance': 'Trial Balance',
}

const files = [
  'src/app/(dashboard)/assets/[id]/page.tsx',
  'src/app/(dashboard)/assets/brands/[id]/page.tsx',
  'src/app/(dashboard)/assets/brands/create/page.tsx',
  'src/app/(dashboard)/assets/brands/page.tsx',
  'src/app/(dashboard)/assets/categories/[id]/page.tsx',
  'src/app/(dashboard)/assets/categories/create/page.tsx',
  'src/app/(dashboard)/assets/categories/page.tsx',
  'src/app/(dashboard)/assets/page.tsx',
  'src/app/(dashboard)/assets/transfers/[id]/page.tsx',
  'src/app/(dashboard)/assets/transfers/create/page.tsx',
  'src/app/(dashboard)/assets/transfers/page.tsx',
  'src/app/(dashboard)/crm/leads/[id]/edit/page.tsx',
  'src/app/(dashboard)/crm/leads/[id]/page.tsx',
  'src/app/(dashboard)/crm/leads/create/page.tsx',
  'src/app/(dashboard)/crm/leads/page.tsx',
  'src/app/(dashboard)/crm/tickets/[id]/page.tsx',
  'src/app/(dashboard)/crm/tickets/create/page.tsx',
  'src/app/(dashboard)/crm/tickets/page.tsx',
  'src/app/(dashboard)/finance/bank-reconciliation/page.tsx',
  'src/app/(dashboard)/finance/bank-statements/page.tsx',
  'src/app/(dashboard)/finance/budgets/[id]/page.tsx',
  'src/app/(dashboard)/finance/budgets/create/page.tsx',
  'src/app/(dashboard)/finance/budgets/page.tsx',
  'src/app/(dashboard)/finance/cost-centers/[id]/page.tsx',
  'src/app/(dashboard)/finance/cost-centers/create/page.tsx',
  'src/app/(dashboard)/inventory/racks/[id]/page.tsx',
  'src/app/(dashboard)/inventory/racks/create/page.tsx',
  'src/app/(dashboard)/inventory/racks/page.tsx',
  'src/app/(dashboard)/inventory/stock-moves/page.tsx',
  'src/app/(dashboard)/inventory/transfers/[id]/page.tsx',
  'src/app/(dashboard)/inventory/transfers/create/page.tsx',
  'src/app/(dashboard)/inventory/transfers/page.tsx',
  'src/app/(dashboard)/manufacturing/production-orders/[id]/page.tsx',
  'src/app/(dashboard)/manufacturing/production-orders/create/page.tsx',
  'src/app/(dashboard)/manufacturing/production-orders/page.tsx',
  'src/app/(dashboard)/manufacturing/products/[id]/page.tsx',
  'src/app/(dashboard)/manufacturing/products/create/page.tsx',
  'src/app/(dashboard)/manufacturing/products/page.tsx',
  'src/app/(dashboard)/manufacturing/work-orders/[id]/page.tsx',
  'src/app/(dashboard)/manufacturing/work-orders/create/page.tsx',
  'src/app/(dashboard)/manufacturing/work-orders/page.tsx',
  'src/app/(dashboard)/master/accounts/create/page.tsx',
  'src/app/(dashboard)/master/accounts/page.tsx',
  'src/app/(dashboard)/master/banks/[id]/edit/page.tsx',
  'src/app/(dashboard)/master/banks/[id]/page.tsx',
  'src/app/(dashboard)/master/banks/create/page.tsx',
  'src/app/(dashboard)/master/barcodes/create/page.tsx',
  'src/app/(dashboard)/master/barcodes/page.tsx',
  'src/app/(dashboard)/master/currencies/[id]/edit/page.tsx',
  'src/app/(dashboard)/master/currencies/[id]/page.tsx',
  'src/app/(dashboard)/master/currencies/create/page.tsx',
  'src/app/(dashboard)/master/customers/[id]/edit/page.tsx',
  'src/app/(dashboard)/master/customers/[id]/page.tsx',
  'src/app/(dashboard)/master/customers/create/page.tsx',
  'src/app/(dashboard)/master/departments/[id]/edit/page.tsx',
  'src/app/(dashboard)/master/departments/[id]/page.tsx',
  'src/app/(dashboard)/master/departments/create/page.tsx',
  'src/app/(dashboard)/master/employees/[id]/page.tsx',
  'src/app/(dashboard)/master/employees/create/page.tsx',
  'src/app/(dashboard)/master/item-categories/[id]/edit/page.tsx',
  'src/app/(dashboard)/master/item-categories/[id]/page.tsx',
  'src/app/(dashboard)/master/item-categories/create/page.tsx',
  'src/app/(dashboard)/master/items/[id]/edit/page.tsx',
  'src/app/(dashboard)/master/items/[id]/page.tsx',
  'src/app/(dashboard)/master/items/create/page.tsx',
  'src/app/(dashboard)/master/positions/[id]/edit/page.tsx',
  'src/app/(dashboard)/master/positions/[id]/page.tsx',
  'src/app/(dashboard)/master/positions/create/page.tsx',
  'src/app/(dashboard)/master/price-lists/create/page.tsx',
  'src/app/(dashboard)/master/price-lists/page.tsx',
  'src/app/(dashboard)/master/tax-groups/create/page.tsx',
  'src/app/(dashboard)/master/tax-groups/page.tsx',
  'src/app/(dashboard)/master/taxes/[id]/edit/page.tsx',
  'src/app/(dashboard)/master/taxes/[id]/page.tsx',
  'src/app/(dashboard)/master/taxes/create/page.tsx',
  'src/app/(dashboard)/master/uom/page.tsx',
  'src/app/(dashboard)/master/vendors/[id]/edit/page.tsx',
  'src/app/(dashboard)/master/vendors/[id]/page.tsx',
  'src/app/(dashboard)/master/vendors/create/page.tsx',
  'src/app/(dashboard)/master/warehouses/[id]/edit/page.tsx',
  'src/app/(dashboard)/master/warehouses/[id]/page.tsx',
  'src/app/(dashboard)/master/warehouses/create/page.tsx',
  'src/app/(dashboard)/notifications/page.tsx',
  'src/app/(dashboard)/page.tsx',
  'src/app/(dashboard)/profile/page.tsx',
  'src/app/(dashboard)/purchase/returns/[id]/page.tsx',
  'src/app/(dashboard)/purchase/returns/create/page.tsx',
  'src/app/(dashboard)/purchase/returns/page.tsx',
  'src/app/(dashboard)/purchase/vendor-payments/[id]/page.tsx',
  'src/app/(dashboard)/purchase/vendor-payments/create/page.tsx',
  'src/app/(dashboard)/purchase/vendor-payments/page.tsx',
  'src/app/(dashboard)/reports/aging-inventory/page.tsx',
  'src/app/(dashboard)/reports/aging-payables/page.tsx',
  'src/app/(dashboard)/reports/aging-receivables/page.tsx',
  'src/app/(dashboard)/reports/balance-sheet/page.tsx',
  'src/app/(dashboard)/reports/cash-flow/page.tsx',
  'src/app/(dashboard)/reports/financial/page.tsx',
  'src/app/(dashboard)/reports/page.tsx',
  'src/app/(dashboard)/reports/profit-center-income/page.tsx',
  'src/app/(dashboard)/reports/trial-balance/page.tsx',
  'src/app/(dashboard)/sales/payments/[id]/page.tsx',
  'src/app/(dashboard)/sales/payments/create/page.tsx',
  'src/app/(dashboard)/sales/payments/page.tsx',
  'src/app/(dashboard)/sales/quotations/[id]/page.tsx',
  'src/app/(dashboard)/sales/quotations/create/page.tsx',
  'src/app/(dashboard)/sales/quotations/page.tsx',
  'src/app/(dashboard)/sales/returns/[id]/page.tsx',
  'src/app/(dashboard)/sales/returns/create/page.tsx',
  'src/app/(dashboard)/sales/returns/page.tsx',
  'src/app/(dashboard)/settings/activity-log/page.tsx',
  'src/app/(dashboard)/settings/approvals/page.tsx',
  'src/app/(dashboard)/settings/page.tsx',
  'src/app/(dashboard)/settings/users/page.tsx',
  'src/app/(dashboard)/vehicles/models/[id]/page.tsx',
  'src/app/(dashboard)/vehicles/models/create/page.tsx',
  'src/app/(dashboard)/vehicles/models/page.tsx',
]

function getBreadcrumbItems(filePath) {
  // Extract path segments after (dashboard)/
  const match = filePath.match(/\(dashboard\)\/(.+)\/page\.tsx$/)
  if (!match) {
    // This is the root dashboard page
    return [{ label: 'Dashboard' }]
  }

  const segments = match[1].split('/')
  const items = [{ label: 'Dashboard', href: '/' }]

  // Determine module
  const moduleName = segments[0]
  const moduleLabel = MODULE_LABELS[moduleName] || moduleName.charAt(0).toUpperCase() + moduleName.slice(1)

  if (segments.length === 1) {
    // Module root page like /assets/page.tsx
    items.push({ label: moduleLabel })
    return items
  }

  // Add module with href
  items.push({ label: moduleLabel, href: `/${moduleName}` })

  // Determine sub-resource
  const subResource = segments[1]
  const subLabel = PAGE_LABELS[subResource] || subResource.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  if (segments.length === 2) {
    // Sub-resource list page like /master/accounts/page.tsx
    items.push({ label: subLabel })
    return items
  }

  // Has more segments
  const thirdSegment = segments[2]

  if (thirdSegment === 'create') {
    // Create page like /master/accounts/create/page.tsx
    items.push({ label: subLabel, href: `/${moduleName}/${subResource}` })
    items.push({ label: 'Create' })
    return items
  }

  if (thirdSegment === '[id]') {
    // Detail or edit page
    items.push({ label: subLabel, href: `/${moduleName}/${subResource}` })

    if (segments.length === 3) {
      // Detail page like /master/banks/[id]/page.tsx
      items.push({ label: 'Detail' })
      return items
    }

    if (segments[3] === 'edit') {
      // Edit page like /master/banks/[id]/edit/page.tsx
      items.push({ label: 'Edit' })
      return items
    }

    // Nested sub-resource under [id]
    const nestedResource = segments[3]
    const nestedLabel = PAGE_LABELS[nestedResource] || nestedResource.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    items.push({ label: nestedLabel })
    return items
  }

  // Nested sub-resource like /assets/brands/page.tsx, /assets/brands/[id]/page.tsx, /assets/brands/create/page.tsx
  const nestedResource = thirdSegment
  const nestedLabel = PAGE_LABELS[nestedResource] || nestedResource.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  // For nested resources under a module (not under [id])
  // e.g. /assets/brands/page.tsx -> Assets > Brands
  // But wait, subResource here would be 'brands' for /assets/brands/page.tsx
  // Let me re-check... segments = ['assets', 'brands', 'page.tsx'] - no, page.tsx is stripped
  // For /assets/brands/page.tsx: segments = ['assets', 'brands'] -> length 2, handled above
  // For /assets/brands/[id]/page.tsx: segments = ['assets', 'brands', '[id]'] -> length 3
  // For /assets/brands/create/page.tsx: segments = ['assets', 'brands', 'create'] -> length 3

  // Actually this case handles things like /assets/brands/create or /assets/brands/[id]
  // where subResource = 'brands', thirdSegment = 'create' or '[id]'
  // These are already handled above. Let me reconsider...

  // This shouldn't be reached given the file list, but just in case:
  items.push({ label: nestedLabel })
  return items
}

function formatBreadcrumbItems(items) {
  return items.map(item => {
    if (item.href) {
      return `  { label: "${item.label}", href: "${item.href}" }`
    }
    return `  { label: "${item.label}" }`
  }).join(',\n')
}

function addBreadcrumbs(filePath) {
  const fullPath = path.resolve(filePath)
  let content = fs.readFileSync(fullPath, 'utf-8')

  // Skip if already has breadcrumbs
  if (content.includes('AppBreadcrumbs')) {
    console.log(`SKIP (already has): ${filePath}`)
    return
  }

  const items = getBreadcrumbItems(filePath)
  const breadcrumbsJsx = `<AppBreadcrumbs items={[\n${formatBreadcrumbItems(items)},\n]} />`

  // Add import
  const importLine = `import { AppBreadcrumbs } from "@/components/ui/breadcrumbs"`

  // Check if there's already an import from @/components
  if (content.includes('import ')) {
    // Add after the last import line
    const lines = content.split('\n')
    let lastImportIndex = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ') || lines[i].match(/^import\s*{/)) {
        lastImportIndex = i
      }
      // Also handle lines that are continuations of imports
      if (lastImportIndex >= 0 && i > lastImportIndex && !lines[i].startsWith('import') && !lines[i].trim().startsWith('//') && lines[i].trim() !== '' && !lines[i].match(/^\s*}/)) {
        break
      }
    }

    // Find the actual last import (could be multi-line)
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith('import ') || lines[i].match(/^import\s*\{/)) {
        lastImportIndex = i
        // Check if it's a multi-line import
        while (i < lines.length - 1 && !lines[i].includes(' from ')) {
          i++
          lastImportIndex = i
        }
        break
      }
    }

    lines.splice(lastImportIndex + 1, 0, importLine)
    content = lines.join('\n')
  } else {
    content = importLine + '\n' + content
  }

  // Add breadcrumbs component before page-header or as first child of the container
  // Look for patterns: <div className="page-container"> or <div className="dashboard">
  const pageHeaderRegex = /(<div className="page-header">)/
  const pageContainerRegex = /(<div className="page-container">)\s*\n/
  const dashboardRegex = /(<div className="dashboard">)\s*\n/

  if (pageHeaderRegex.test(content)) {
    // Add before page-header
    content = content.replace(pageHeaderRegex, `${breadcrumbsJsx}\n      $1`)
  } else if (pageContainerRegex.test(content)) {
    // Add as first child of page-container
    content = content.replace(pageContainerRegex, `$1\n      ${breadcrumbsJsx}\n`)
  } else if (dashboardRegex.test(content)) {
    // Add as first child of dashboard div
    content = content.replace(dashboardRegex, `$1\n      ${breadcrumbsJsx}\n`)
  } else {
    // Try to find the first return ( and add after the opening div
    const returnDivRegex = /(return\s*\(\s*\n\s*<div[^>]*>)\s*\n/
    if (returnDivRegex.test(content)) {
      content = content.replace(returnDivRegex, `$1\n      ${breadcrumbsJsx}\n`)
    } else {
      console.log(`WARN: Could not find insertion point in ${filePath}`)
      return
    }
  }

  fs.writeFileSync(fullPath, content)
  console.log(`DONE: ${filePath}`)
}

let success = 0
let skipped = 0
let failed = 0

for (const file of files) {
  try {
    addBreadcrumbs(file)
    success++
  } catch (err) {
    console.error(`ERROR: ${file} - ${err.message}`)
    failed++
  }
}

console.log(`\nSummary: ${success} done, ${skipped} skipped, ${failed} failed`)
