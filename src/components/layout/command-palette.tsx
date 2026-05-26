"use client"

import { Command } from "cmdk"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  Home, Users, Factory, Package, Building2, UserCircle, BookOpen,
  FileText, ShoppingCart, Receipt, CreditCard, Wallet, RotateCcw,
  ClipboardList, FileCheck, PackageCheck, Undo2,
  BarChart3, Scale, ArrowLeftRight, PackageX,
  Wrench, Settings2,
  Clock, Palmtree, Timer, Banknote,
  BookOpenCheck, DollarSign, Coins, Landmark,
  Target, Ticket, Monitor,
  TrendingUp, PieChart,
  Cog, Shield, ScrollText, CheckCircle2, Bell,
  Plus, Search, Truck, FileSpreadsheet, Car, FolderKanban,
  CalendarDays, Briefcase, PiggyBank, ScanBarcode, Grid3X3, Tag,
  Globe, ListOrdered, Layers, BadgeDollarSign, Hammer
} from "lucide-react"

const menuItems = [
  { label: "Dashboard", href: "/", icon: Home, group: "Navigasi" },
  // Master Data
  { label: "Customers", href: "/master/customers", icon: Users, group: "Master Data" },
  { label: "Vendors", href: "/master/vendors", icon: Factory, group: "Master Data" },
  { label: "Items", href: "/master/items", icon: Package, group: "Master Data" },
  { label: "Item Categories", href: "/master/item-categories", icon: Tag, group: "Master Data" },
  { label: "Warehouses", href: "/master/warehouses", icon: Building2, group: "Master Data" },
  { label: "Employees", href: "/master/employees", icon: UserCircle, group: "Master Data" },
  { label: "Departments", href: "/master/departments", icon: Layers, group: "Master Data" },
  { label: "Positions", href: "/master/positions", icon: Briefcase, group: "Master Data" },
  { label: "Chart of Accounts", href: "/master/accounts", icon: BookOpen, group: "Master Data" },
  { label: "Banks", href: "/master/banks", icon: Landmark, group: "Master Data" },
  { label: "Taxes", href: "/master/taxes", icon: BadgeDollarSign, group: "Master Data" },
  { label: "Tax Groups", href: "/master/tax-groups", icon: ListOrdered, group: "Master Data" },
  { label: "Currencies", href: "/master/currencies", icon: Globe, group: "Master Data" },
  { label: "Price Lists", href: "/master/price-lists", icon: FileSpreadsheet, group: "Master Data" },
  { label: "Barcodes", href: "/master/barcodes", icon: ScanBarcode, group: "Master Data" },
  { label: "Unit of Measures", href: "/master/uom", icon: Scale, group: "Master Data" },
  // Sales
  { label: "Quotations", href: "/sales/quotations", icon: FileText, group: "Sales" },
  { label: "Sales Orders", href: "/sales/orders", icon: ShoppingCart, group: "Sales" },
  { label: "Delivery Orders", href: "/sales/delivery-orders", icon: Truck, group: "Sales" },
  { label: "Invoices", href: "/sales/invoices", icon: Receipt, group: "Sales" },
  { label: "Payments", href: "/sales/payments", icon: CreditCard, group: "Sales" },
  { label: "Down Payments", href: "/sales/down-payments", icon: Wallet, group: "Sales" },
  { label: "Sales Returns", href: "/sales/returns", icon: RotateCcw, group: "Sales" },
  // Purchase
  { label: "Purchase Requests", href: "/purchase/requests", icon: ClipboardList, group: "Purchase" },
  { label: "Purchase Orders", href: "/purchase/orders", icon: FileCheck, group: "Purchase" },
  { label: "Goods Receipts", href: "/purchase/goods-receipts", icon: PackageCheck, group: "Purchase" },
  { label: "Vendor Bills", href: "/purchase/bills", icon: FileSpreadsheet, group: "Purchase" },
  { label: "Vendor Payments", href: "/purchase/vendor-payments", icon: Banknote, group: "Purchase" },
  { label: "Purchase Returns", href: "/purchase/returns", icon: Undo2, group: "Purchase" },
  // Inventory
  { label: "Stock Moves", href: "/inventory/stock-moves", icon: BarChart3, group: "Inventory" },
  { label: "Stock Adjustments", href: "/inventory/adjustments", icon: Scale, group: "Inventory" },
  { label: "Inventory Transfers", href: "/inventory/transfers", icon: ArrowLeftRight, group: "Inventory" },
  { label: "Material Issues", href: "/inventory/material-issues", icon: PackageX, group: "Inventory" },
  { label: "Racks", href: "/inventory/racks", icon: Grid3X3, group: "Inventory" },
  // Manufacturing
  { label: "Products (BOM)", href: "/manufacturing/products", icon: Package, group: "Manufacturing" },
  { label: "Work Orders", href: "/manufacturing/work-orders", icon: Wrench, group: "Manufacturing" },
  { label: "Production Orders", href: "/manufacturing/production-orders", icon: Hammer, group: "Manufacturing" },
  // HRM
  { label: "Attendance", href: "/hrm/attendance", icon: Clock, group: "HRM" },
  { label: "Leave Requests", href: "/hrm/leave", icon: Palmtree, group: "HRM" },
  { label: "Overtime", href: "/hrm/overtime", icon: Timer, group: "HRM" },
  { label: "Payroll", href: "/hrm/payroll", icon: Banknote, group: "HRM" },
  { label: "Work Schedules", href: "/hrm/work-schedules", icon: CalendarDays, group: "HRM" },
  { label: "Timesheets", href: "/hrm/timesheets", icon: Clock, group: "HRM" },
  { label: "Employee Loans", href: "/hrm/loans", icon: PiggyBank, group: "HRM" },
  { label: "Holidays", href: "/hrm/holidays", icon: Palmtree, group: "HRM" },
  // Finance
  { label: "Journals", href: "/finance/journals", icon: BookOpenCheck, group: "Finance" },
  { label: "Expenses", href: "/finance/expenses", icon: DollarSign, group: "Finance" },
  { label: "Petty Cash", href: "/finance/petty-cash", icon: Coins, group: "Finance" },
  { label: "Budgets", href: "/finance/budgets", icon: PiggyBank, group: "Finance" },
  { label: "Cost Centers", href: "/finance/cost-centers", icon: Target, group: "Finance" },
  { label: "Bank Statements", href: "/finance/bank-statements", icon: FileSpreadsheet, group: "Finance" },
  { label: "Bank Reconciliation", href: "/finance/bank-reconciliation", icon: Landmark, group: "Finance" },
  { label: "Statistical Key Figures", href: "/finance/statistical-key-figures", icon: BarChart3, group: "Finance" },
  // CRM
  { label: "Leads", href: "/crm/leads", icon: Target, group: "CRM" },
  { label: "Tickets", href: "/crm/tickets", icon: Ticket, group: "CRM" },
  // Vehicles
  { label: "Vehicles", href: "/vehicles", icon: Car, group: "Vehicles" },
  { label: "Vehicle Brands", href: "/vehicles/brands", icon: Tag, group: "Vehicles" },
  { label: "Vehicle Models", href: "/vehicles/models", icon: Layers, group: "Vehicles" },
  // Projects
  { label: "Projects", href: "/projects", icon: FolderKanban, group: "Projects" },
  // Assets
  { label: "All Assets", href: "/assets", icon: Monitor, group: "Assets" },
  { label: "Asset Categories", href: "/assets/categories", icon: Tag, group: "Assets" },
  { label: "Asset Brands", href: "/assets/brands", icon: Layers, group: "Assets" },
  { label: "Asset Transfers", href: "/assets/transfers", icon: ArrowLeftRight, group: "Assets" },
  // Reports
  { label: "Financial Reports", href: "/reports/financial", icon: PieChart, group: "Reports" },
  { label: "Trial Balance", href: "/reports/trial-balance", icon: Scale, group: "Reports" },
  { label: "Balance Sheet", href: "/reports/balance-sheet", icon: BookOpen, group: "Reports" },
  { label: "Cash Flow", href: "/reports/cash-flow", icon: Coins, group: "Reports" },
  { label: "Aging Receivables", href: "/reports/aging-receivables", icon: Clock, group: "Reports" },
  { label: "Aging Payables", href: "/reports/aging-payables", icon: Clock, group: "Reports" },
  { label: "Aging Inventory", href: "/reports/aging-inventory", icon: Package, group: "Reports" },
  { label: "Profit Center Income", href: "/reports/profit-center-income", icon: TrendingUp, group: "Reports" },
  // System
  { label: "Settings", href: "/settings", icon: Cog, group: "System" },
  { label: "Users & Roles", href: "/settings/users", icon: Shield, group: "System" },
  { label: "Activity Log", href: "/settings/activity-log", icon: ScrollText, group: "System" },
  { label: "Approvals", href: "/settings/approvals", icon: CheckCircle2, group: "System" },
  { label: "Notifications", href: "/notifications", icon: Bell, group: "System" },
  // Quick Actions
  { label: "Buat Customer Baru", href: "/master/customers/create", icon: Plus, group: "Quick Actions" },
  { label: "Buat Quotation", href: "/sales/quotations/create", icon: Plus, group: "Quick Actions" },
  { label: "Buat Purchase Order", href: "/purchase/orders/create", icon: Plus, group: "Quick Actions" },
  { label: "Buat Invoice Payment", href: "/sales/payments/create", icon: Plus, group: "Quick Actions" },
  { label: "Buat Expense", href: "/finance/expenses/create", icon: Plus, group: "Quick Actions" },
  { label: "Buat Journal Entry", href: "/finance/journals/create", icon: Plus, group: "Quick Actions" },
  { label: "Buat Delivery Order", href: "/sales/delivery-orders/create", icon: Plus, group: "Quick Actions" },
  { label: "Buat Project", href: "/projects/create", icon: Plus, group: "Quick Actions" },
  { label: "Buat Vendor Bill", href: "/purchase/bills/create", icon: Plus, group: "Quick Actions" },
]

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  function handleSelect(href: string) {
    setOpen(false)
    router.push(href)
  }

  if (!open) return null

  return (
    <div className="cmdk-overlay" onClick={() => setOpen(false)}>
      <div className="cmdk-container" onClick={(e) => e.stopPropagation()}>
        <Command className="cmdk-root" loop>
          <div className="cmdk-input-wrapper">
            <Search size={18} className="cmdk-search-icon" />
            <Command.Input
              className="cmdk-input"
              placeholder="Cari menu, halaman, atau aksi..."
              autoFocus
            />
          </div>
          <Command.List className="cmdk-list">
            <Command.Empty className="cmdk-empty">
              Tidak ditemukan. Coba kata kunci lain.
            </Command.Empty>

            {["Quick Actions", "Navigasi", "Master Data", "Sales", "Purchase", "Inventory", "Manufacturing", "HRM", "Finance", "CRM", "Vehicles", "Projects", "Assets", "Reports", "System"].map((group) => {
              const items = menuItems.filter((i) => i.group === group)
              if (items.length === 0) return null
              return (
                <Command.Group key={group} heading={group} className="cmdk-group">
                  {items.map((item) => {
                    const Icon = item.icon
                    return (
                      <Command.Item
                        key={item.href}
                        value={`${item.label} ${item.group}`}
                        onSelect={() => handleSelect(item.href)}
                        className="cmdk-item"
                      >
                        <Icon size={16} className="cmdk-item-icon" />
                        <span className="cmdk-item-label">{item.label}</span>
                      </Command.Item>
                    )
                  })}
                </Command.Group>
              )
            })}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
