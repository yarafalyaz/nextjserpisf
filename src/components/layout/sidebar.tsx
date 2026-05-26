"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSidebarStore } from "@/lib/stores"
import { X } from "lucide-react"
import {
  LayoutDashboard, ClipboardList, Users, Factory, Package, Building2,
  UserCircle, BookOpen, DollarSign, FileText, Wallet, ShoppingCart,
  Receipt, CreditCard, RotateCcw, ShoppingBag, FileCheck, PackageCheck,
  Undo2, BarChart3, Scale, ArrowLeftRight, Wrench, Settings2, Hammer,
  Clock, Palmtree, Timer, Banknote, Landmark, BookOpenCheck, Coins,
  CircleDollarSign, Handshake, Target, Ticket, HardDrive, TrendingUp,
  Cog, ChevronRight, Truck, FileSpreadsheet, Car, FolderKanban,
  CalendarDays, Briefcase, PiggyBank, ScanBarcode, Grid3X3, Tag,
  Globe, ListOrdered, Layers, BadgeDollarSign
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  children?: NavItem[]
}

const navigation: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  {
    label: "Master Data",
    href: "/master",
    icon: ClipboardList,
    children: [
      { label: "Customers", href: "/master/customers", icon: Users },
      { label: "Vendors", href: "/master/vendors", icon: Factory },
      { label: "Items", href: "/master/items", icon: Package },
      { label: "Item Categories", href: "/master/item-categories", icon: Tag },
      { label: "Brands", href: "/master/brands", icon: Layers },
      { label: "Warehouses", href: "/master/warehouses", icon: Building2 },
      { label: "Employees", href: "/master/employees", icon: UserCircle },
      { label: "Departments", href: "/master/departments", icon: Layers },
      { label: "Positions", href: "/master/positions", icon: Briefcase },
      { label: "Accounts (COA)", href: "/master/accounts", icon: BookOpen },
      { label: "Banks", href: "/master/banks", icon: Landmark },
      { label: "Taxes", href: "/master/taxes", icon: BadgeDollarSign },
      { label: "Tax Groups", href: "/master/tax-groups", icon: ListOrdered },
      { label: "Currencies", href: "/master/currencies", icon: Globe },
      { label: "Price Lists", href: "/master/price-lists", icon: FileSpreadsheet },
      { label: "Barcodes", href: "/master/barcodes", icon: ScanBarcode },
      { label: "Payment Terms", href: "/master/payment-terms", icon: CalendarDays },
      { label: "UoM", href: "/master/uom", icon: Scale },
    ],
  },
  {
    label: "Sales",
    href: "/sales",
    icon: DollarSign,
    children: [
      { label: "Quotations", href: "/sales/quotations", icon: FileText },
      { label: "Down Payments", href: "/sales/down-payments", icon: Wallet },
      { label: "Sales Orders", href: "/sales/orders", icon: ShoppingCart },
      { label: "Delivery Orders", href: "/sales/delivery-orders", icon: Truck },
      { label: "Invoices", href: "/sales/invoices", icon: Receipt },
      { label: "Payments", href: "/sales/payments", icon: CreditCard },
      { label: "Returns", href: "/sales/returns", icon: RotateCcw },
    ],
  },
  {
    label: "Purchase",
    href: "/purchase",
    icon: ShoppingBag,
    children: [
      { label: "Requests", href: "/purchase/requests", icon: ClipboardList },
      { label: "Orders", href: "/purchase/orders", icon: FileCheck },
      { label: "Goods Receipts", href: "/purchase/goods-receipts", icon: PackageCheck },
      { label: "Vendor Bills", href: "/purchase/bills", icon: FileSpreadsheet },
      { label: "Vendor Payments", href: "/purchase/vendor-payments", icon: Banknote },
      { label: "Returns", href: "/purchase/returns", icon: Undo2 },
    ],
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: Package,
    children: [
      { label: "Stock Moves", href: "/inventory/stock-moves", icon: BarChart3 },
      { label: "Adjustments", href: "/inventory/adjustments", icon: Scale },
      { label: "Transfers", href: "/inventory/transfers", icon: ArrowLeftRight },
      { label: "Material Issues", href: "/inventory/material-issues", icon: Wrench },
      { label: "Racks", href: "/inventory/racks", icon: Grid3X3 },
    ],
  },
  {
    label: "Manufacturing",
    href: "/manufacturing",
    icon: Settings2,
    children: [
      { label: "Products (BOM)", href: "/manufacturing/products", icon: Package },
      { label: "Work Orders", href: "/manufacturing/work-orders", icon: Wrench },
      { label: "Production Orders", href: "/manufacturing/production-orders", icon: Hammer },
    ],
  },
  {
    label: "HRM",
    href: "/hrm",
    icon: Users,
    children: [
      { label: "Attendance", href: "/hrm/attendance", icon: Clock },
      { label: "Leave", href: "/hrm/leave", icon: Palmtree },
      { label: "Overtime", href: "/hrm/overtime", icon: Timer },
      { label: "Payroll", href: "/hrm/payroll", icon: Banknote },
      { label: "Work Schedules", href: "/hrm/work-schedules", icon: CalendarDays },
      { label: "Timesheets", href: "/hrm/timesheets", icon: Clock },
      { label: "Loans", href: "/hrm/loans", icon: PiggyBank },
      { label: "Holidays", href: "/hrm/holidays", icon: Palmtree },
    ],
  },
  {
    label: "Finance",
    href: "/finance",
    icon: Landmark,
    children: [
      { label: "Journals", href: "/finance/journals", icon: BookOpenCheck },
      { label: "Expenses", href: "/finance/expenses", icon: CircleDollarSign },
      { label: "Petty Cash", href: "/finance/petty-cash", icon: Coins },
      { label: "Budgets", href: "/finance/budgets", icon: PiggyBank },
      { label: "Cost Centers", href: "/finance/cost-centers", icon: Target },
      { label: "Bank Statements", href: "/finance/bank-statements", icon: FileSpreadsheet },
      { label: "Bank Recon", href: "/finance/bank-reconciliation", icon: Landmark },
      { label: "Statistical KF", href: "/finance/statistical-key-figures", icon: BarChart3 },
    ],
  },
  {
    label: "CRM",
    href: "/crm",
    icon: Handshake,
    children: [
      { label: "Leads", href: "/crm/leads", icon: Target },
      { label: "Tickets", href: "/crm/tickets", icon: Ticket },
    ],
  },
  {
    label: "Vehicles",
    href: "/vehicles",
    icon: Car,
    children: [
      { label: "Vehicles", href: "/vehicles", icon: Car },
      { label: "Brands", href: "/vehicles/brands", icon: Tag },
      { label: "Models", href: "/vehicles/models", icon: Layers },
    ],
  },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  {
    label: "Assets",
    href: "/assets",
    icon: HardDrive,
    children: [
      { label: "All Assets", href: "/assets", icon: HardDrive },
      { label: "Categories", href: "/assets/categories", icon: Tag },
      { label: "Brands", href: "/assets/brands", icon: Layers },
      { label: "Transfers", href: "/assets/transfers", icon: ArrowLeftRight },
    ],
  },
  {
    label: "Reports",
    href: "/reports",
    icon: TrendingUp,
    children: [
      { label: "Financial", href: "/reports/financial", icon: FileSpreadsheet },
      { label: "Trial Balance", href: "/reports/trial-balance", icon: Scale },
      { label: "Balance Sheet", href: "/reports/balance-sheet", icon: BookOpen },
      { label: "Cash Flow", href: "/reports/cash-flow", icon: Coins },
      { label: "Aging Receivables", href: "/reports/aging-receivables", icon: Clock },
      { label: "Aging Payables", href: "/reports/aging-payables", icon: Clock },
      { label: "Aging Inventory", href: "/reports/aging-inventory", icon: Package },
      { label: "Profit Center", href: "/reports/profit-center-income", icon: TrendingUp },
    ],
  },
  { label: "Settings", href: "/settings", icon: Cog },
]

export function Sidebar() {
  const pathname = usePathname()
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const { isOpen, close } = useSidebarStore()

  // Set active menu on mount (client only)
  useEffect(() => {
    const segments = pathname.split("/").filter(Boolean)
    if (segments.length > 0) {
      setExpandedItems(["/" + segments[0]])
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = (href: string) => {
    setExpandedItems((prev) =>
      prev.includes(href) ? [] : [href]
    )
  }

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

  const handleNavClick = () => {
    // Close sidebar on mobile after navigation
    if (window.innerWidth <= 1024) {
      close()
    }
  }

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div className="sidebar-overlay" onClick={close} />
      )}

      <aside className={`sidebar ${isOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <h1 className="sidebar-logo">YaraERP</h1>
          <button className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium border border-transparent transition-all sidebar-close- lg:hidden" onClick={close}>
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {navigation.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.href} className="nav-group">
                {item.children ? (
                  <>
                    <button
                      onClick={() => toggleExpand(item.href)}
                      className={`nav-item nav-item-parent ${isActive(item.href) ? "active" : ""}`}
                    >
                      <Icon size={18} className="nav-icon" />
                      <span className="nav-label">{item.label}</span>
                      <ChevronRight size={14} className={`nav-arrow ${expandedItems.includes(item.href) ? "expanded" : ""}`} />
                    </button>
                    {expandedItems.includes(item.href) && (
                      <div className="nav-children">
                        {item.children.map((child) => {
                          const ChildIcon = child.icon
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={handleNavClick}
                              className={`nav-item nav-item-child ${isActive(child.href) ? "active" : ""}`}
                            >
                              <ChildIcon size={15} className="nav-icon" />
                              <span className="nav-label">{child.label}</span>
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <Link
                    href={item.href}
                    onClick={handleNavClick}
                    className={`nav-item ${isActive(item.href) ? "active" : ""}`}
                  >
                    <Icon size={18} className="nav-icon" />
                    <span className="nav-label">{item.label}</span>
                  </Link>
                )}
              </div>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
