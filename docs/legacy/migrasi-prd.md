# PRD: Migrasi YaraERP ke Next.js App Router

## 1. Ringkasan Eksekutif

Migrasi sistem ERP dari arsitektur **Laravel Filament (Backend) + React Vite (Frontend)** ke **Next.js 15 App Router** sebagai fullstack monolith. Tujuannya adalah menyatukan backend dan frontend dalam satu codebase Next.js dengan tetap mempertahankan seluruh logika bisnis, observer pattern, service layer, dan integrasi database yang sudah berjalan.

---

## 2. Latar Belakang & Motivasi

### Arsitektur Saat Ini
- **Backend**: Laravel 11 + Filament v3 (Admin Panel) + Sanctum Auth
- **Frontend**: React 19 + Vite 8 + HeroUI + TailwindCSS 4 + React Query + React Router DOM
- **Database**: MySQL (75 migration files, 119 models)
- **Pattern**: Observer-driven side effects, Service Layer, API Resource Controllers

### Masalah dengan Arsitektur Saat Ini
1. Dua codebase terpisah (Laravel + React) menambah kompleksitas deployment
2. API layer redundan — frontend hanya consume REST API dari Laravel
3. Filament admin panel jarang dipakai karena frontend React sudah lengkap
4. Double maintenance: perubahan schema harus update di Laravel Model + React types
5. Cold start lambat karena PHP-FPM + Nginx + Vite dev server terpisah

### Keuntungan Migrasi ke Next.js
1. **Single codebase** — frontend + backend dalam satu project
2. **Server Components** — reduce client bundle, faster initial load
3. **Server Actions** — replace REST API dengan type-safe mutations
4. **Prisma ORM** — type-safe database access, auto-generated types
5. **Edge-ready** — bisa deploy ke Vercel/Cloudflare
6. **Unified DX** — satu bahasa (TypeScript), satu build tool

---

## 3. Scope Sistem

### 3.1 Modul yang Harus Direplikasi

| # | Modul | Deskripsi | Kompleksitas |
|---|-------|-----------|--------------|
| 1 | **Auth & RBAC** | Login, Passkey, Role-Permission (Spatie) | Medium |
| 2 | **Dashboard** | KPI Cards, Charts, Recent Activities | Low |
| 3 | **Master Data** | Customer, Vendor, Item, Warehouse, Employee, Account, dll | Medium |
| 4 | **Sales** | Quotation → DP → SO → Invoice → Payment + Project + WO | High |
| 5 | **Purchase** | PR → PO → Goods Receipt → Vendor Bill → Payment | High |
| 6 | **Inventory** | Stock Move (FIFO), Transfer, Adjustment, Material Issue | Critical |
| 7 | **Manufacturing** | Work Order, Production Order, BOM | Medium |
| 8 | **HRM** | Attendance, Leave, Overtime, Payroll, Loan, Timesheet | High |
| 9 | **Finance/Accounting** | Journal, Expense, Petty Cash, Bank Reconciliation, Budget | Critical |
| 10 | **CRM** | Lead, Ticket, Pipeline | Low |
| 11 | **Asset Management** | Asset CRUD, Depreciation, Transfer, Disposal | Medium |
| 12 | **Reports** | Balance Sheet, Cash Flow, Trial Balance, Aging, P&L | Medium |
| 13 | **System Settings** | Company config, Document prefixes, Account mapping | Low |
| 14 | **Approval Workflow** | Multi-step approval engine | Medium |
| 15 | **Notifications** | In-app notification system | Low |

### 3.2 Logika Bisnis Kritis (Observer → Server-Side Hooks)

#### Accounting Observer (24KB — paling kompleks)
Membuat Journal Entry otomatis saat:
- Sales Invoice → status `posted` → Dr. Receivable, Cr. Revenue + Tax
- Sales Payment → created → Dr. Cash/Bank, Cr. Receivable
- Purchase Order → status `received` → Dr. Inventory + Tax, Cr. Payable
- Stock Adjustment → status `processed` → Dr/Cr Inventory vs Adjustment
- Work Order → status `done` → Dr. WIP, Cr. Inventory
- Expense → status `approved` → Dr. Expense Account, Cr. Paid From Account
- Petty Cash → created → Dr/Cr based on type (IN/OUT)
- Sales Return → status `completed` → Dr. Sales Return, Cr. Receivable
- Purchase Return → status `returned` → Dr. Payable, Cr. Inventory
- Material Issue → status `completed` → Dr. Material Expense, Cr. Inventory

#### Down Payment Observer (10KB)
Saat DP status → `confirmed`:
1. Create Work Order + Items
2. Create Project + Initialize Stages
3. Create Sales Order + Items
4. Create Sales Invoice + Items
5. Update Quotation status → `converted`
- Idempotent check (tidak duplicate)
- Stock availability warning

#### Inventory Observers
- **GoodsReceiptObserver**: Auto-number, PO status update, Stock Move IN on verify
- **StockAdjustmentObserver**: Create Stock Move IN/OUT per item difference
- **WorkOrderObserver**: Stock Move OUT per item saat WO done
- **MaterialIssueObserver**: Stock Move OUT per item saat completed
- **InventoryTransferObserver**: OUT from source (processed), IN to destination (received)
- **SalesReturnObserver**: Stock Move IN saat completed
- **PurchaseReturnObserver**: Stock Move OUT saat returned

#### Payment & Status Observers
- **SalesPaymentObserver**: Recalculate invoice paid_amount & status (posted/partial/paid)
- **PurchaseOrderObserver**: Update PR status on PO create, cascade delete GRs
- **QuotationObserver**: Lightweight status tracking

### 3.3 Service Layer

| Service | Fungsi |
|---------|--------|
| **InventoryService** | FIFO costing, Stock Move posting, Layer management, Reverse move, Project material issue |
| **JournalService** | Double-entry validation (debit = credit), Create journal + lines |
| **DocumentSequenceService** | Atomic document number generation (INSERT ON DUPLICATE KEY UPDATE) |
| **NotificationService** | Send notifications to admins/users (low stock, PO baru, invoice due, dll) |
| **QuotationSyncService** | Sync items dari Quotation ke SO & Invoice yang belum selesai |

---

## 4. Database Schema Overview

### 4.1 Jumlah Tabel: ~80+ tabel

### 4.2 Modul Grouping

**Sales (12 tabel)**
- quotations, quotation_sections, quotation_items, quotation_histories
- sales_orders, sales_order_items
- sales_invoices, sales_invoice_items
- sales_payments, sales_returns, sales_return_items
- down_payments

**Purchase (10 tabel)**
- purchase_requests, purchase_request_items
- purchase_orders, purchase_order_items
- goods_receipts, goods_receipt_items
- purchase_returns, purchase_return_items
- vendor_bills, vendor_bill_items, vendor_payments, vendor_payment_allocations

**Inventory (12 tabel)**
- items, item_categories, item_batches, item_serials
- warehouses, racks, rack_rows
- stock_moves, inventory_layers
- stock_adjustments, stock_adjustment_items
- inventory_transfers, inventory_transfer_items
- material_issues, material_issue_items

**Manufacturing (4 tabel)**
- products, product_materials
- production_orders, production_order_materials
- work_orders, work_order_items

**HRM (10 tabel)**
- employees, departments, positions
- attendances, leave_requests, overtime_requests
- payrolls, work_schedules
- employee_loans, appreciations, tasks, timesheets

**Accounting (10 tabel)**
- accounts, journals, journal_entries
- expenses, petty_cash, budgets
- cost_centers, profit_centers, statistical_key_figures, skf_values
- bank_statements, bank_statement_lines
- bank_reconciliations, bank_reconciliation_items

**CRM (4 tabel)**
- leads, lead_activities
- crm_tickets, crm_ticket_comments

**Assets (7 tabel)**
- assets, asset_categories, asset_groups
- asset_brands, asset_brand_models
- asset_histories, asset_transfers

**System (8 tabel)**
- users, roles, permissions, model_has_roles, model_has_permissions, role_has_permissions
- system_settings, document_sequences
- approval_workflows, approval_workflow_steps, approvals, approval_histories
- notifications

**Vehicles (5 tabel)**
- vehicles, vehicle_brands, vehicle_models, vehicle_variants
- customer_vehicles

**Projects (4 tabel)**
- projects, project_items, project_stages
- project_stage_progress, project_logs

---

## 5. Non-Functional Requirements

| Aspek | Requirement |
|-------|-------------|
| **Performance** | First Contentful Paint < 1.5s, Time to Interactive < 3s |
| **Concurrency** | Atomic stock operations (row-level locking via Prisma transactions) |
| **Data Integrity** | Double-entry accounting MUST balance (debit = credit) |
| **Auth** | JWT/Session + Passkey WebAuthn support |
| **Audit Trail** | Activity log untuk semua CRUD operations |
| **Multi-currency** | Support IDR + foreign currencies with exchange rates |
| **Document Numbering** | Concurrency-safe sequential numbering |
| **File Upload** | Company logo, proof images, signatures |
| **Responsive** | Mobile-first design (existing HeroUI components) |

---

## 6. Tech Stack Target

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15 (App Router) |
| **Language** | TypeScript 5.x |
| **ORM** | Prisma 6 (MySQL) |
| **Auth** | NextAuth.js v5 (Credentials + Passkey) |
| **State** | Zustand + React Query (TanStack Query) |
| **UI** | HeroUI + TailwindCSS 4 + Framer Motion |
| **Forms** | React Hook Form + Zod validation |
| **Tables** | TanStack Table |
| **Charts** | Recharts / Chart.js |
| **File Storage** | Local / S3-compatible |
| **Deployment** | Docker / VPS (self-hosted) |
| **Testing** | Vitest + Playwright |

---

## 7. Batasan & Asumsi

1. Database MySQL tetap dipakai (tidak migrasi ke PostgreSQL)
2. Data existing akan di-migrate via SQL dump (schema compatible)
3. Filament admin panel TIDAK direplikasi — semua via Next.js UI
4. Passkey auth tetap dipertahankan
5. Multi-tenant TIDAK diperlukan (single company)
6. Real-time features (WebSocket) bukan prioritas awal
7. PDF generation (invoice, quotation) akan pakai library JS (react-pdf atau puppeteer)

---

## 8. Success Criteria

1. ✅ Semua 15 modul berfungsi identik dengan sistem Laravel
2. ✅ Semua observer logic ter-replikasi sebagai server-side hooks/middleware
3. ✅ FIFO inventory costing menghasilkan angka yang sama
4. ✅ Double-entry journal selalu balance
5. ✅ Document numbering atomic dan sequential
6. ✅ Existing data bisa di-import tanpa loss
7. ✅ Performance equal atau lebih baik dari sistem lama
8. ✅ Zero downtime migration strategy
