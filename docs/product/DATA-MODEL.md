# DATA MODEL --- ERP ISF

**Status:** Model konseptual, bukan skema final/migration. Nama
tabel/kolom harus diselaraskan dengan repository dan keputusan
arsitektur. Pemetaan singkat konseptual ke model Prisma aktual ada di
bagian 13 (ditambahkan 28 Oktober 2026); bagian 1-12 tetap konseptual.

## 1. Prinsip

-   Domain memiliki ownership data yang jelas.
-   Gunakan ID stabil dan foreign keys.
-   Master data yang sudah dipakai transaksi diarsipkan, bukan dihapus
    secara destruktif.
-   Dokumen transaksi memiliki lifecycle dan referensi audit.
-   Saldo ringkasan tidak menggantikan ledger.
-   Uang memakai decimal; jangan floating point.
-   Setiap transaksi posted dapat ditelusuri ke aktor dan dokumen
    sumber.

## 2. Entitas lintas domain

-   `users`, `roles`, `permissions`, `user_roles`, `role_permissions`
-   `audit_events`
-   `approval_requests`, `approval_steps`, `approval_decisions`
-   `company_settings`
-   `attachments` / `document_files`
-   `document_sequences` (bila sequence dikelola database)

## 3. Master data

-   `items`: SKU, nama, tipe, kategori, brand, base unit, minimum stock,
    status.
-   `item_categories`
-   `brands`
-   `units_of_measure`
-   `unit_conversions` (jika konversi diizinkan)
-   `locations` / `racks`
-   `suppliers`
-   `customers`
-   `employees`
-   `payment_methods`
-   `accounts` (hanya jika chart of accounts masuk scope).

## 4. Inventory

Entitas konseptual: - `stock_balances` --- ringkasan saldo per
item/lokasi (bukan satu-satunya histori). - `stock_movements` --- header
movement dan referensi sumber. - `stock_movement_lines` --- item, lokasi
asal/tujuan, kuantitas, unit, cost reference bila diperlukan. -
`stock_ledger_entries` --- catatan pergerakan yang tidak dihapus melalui
UI normal. - `stocktake_sessions`, `stocktake_lines` -
`stock_adjustments` / approval reference. - `remnants` dan
`scrap_records` atau model alternatif yang dipilih.

Invariant: - Movement posted menghasilkan ledger entries. - Transfer
memiliki lokasi asal dan tujuan yang valid. - Adjustment posted harus
mempunyai approval sesuai policy. - Unique/idempotency guard mencegah
movement ganda. - Saldo per item/lokasi mengikuti kebijakan negative
stock.

## 5. Purchasing

-   `purchase_orders`, `purchase_order_lines`
-   `goods_receipts`, `goods_receipt_lines`
-   `supplier_bills`, `supplier_bill_lines`
-   `supplier_payments`, `supplier_payment_allocations`
-   `purchase_returns`, `purchase_return_lines`
-   Ongkir/biaya tambahan: entitas/field harus mendukung kebijakan
    landed cost yang disetujui.

Relasi umum: supplier → PO → receipt → supplier bill →
payment/allocation. Tidak semua relasi harus one-to-one; penerimaan
parsial dan pembayaran parsial harus dipertimbangkan.

## 6. Sales

-   `quotations`, `quotation_lines`
-   `customer_invoices`, `customer_invoice_lines`
-   `customer_payments`, `customer_payment_allocations`
-   `sales_returns`, `sales_return_lines`
-   `credit_notes` jika dipakai
-   Relasi konversi quotation→invoice dan referensi DP trigger harus
    eksplisit.

Invariant: - Satu quotation tidak boleh menghasilkan invoice duplikat
dari event DP yang sama. - Faktur posted yang menjual stock item
menghasilkan movement yang sesuai. - Pembayaran memiliki alokasi dan
tidak boleh mengurangi outstanding lebih dari aturan yang disetujui.

## 7. Finance/accounting

Minimum: - `cash_accounts` / `bank_accounts` jika kas/bank dikelola. -
`cash_transactions` jika diperlukan untuk arus masuk/keluar. -
`payment_allocations`. Jika double-entry dipilih: -
`chart_of_accounts` - `journal_entries`, `journal_lines` -
`fiscal_periods` - `accounting_dimensions` jika diperlukan. Jangan
mengklaim ledger akuntansi formal sebelum aturan debit/kredit, period
closing, dan posting source ditetapkan.

## 8. Projects dan work orders

-   `projects`
-   `project_budgets` / `project_budget_lines`
-   `project_cost_entries` atau read model biaya dengan referensi
    sumber.
-   `work_orders`, `work_order_assignments`
-   `work_order_material_plans`
-   `work_order_time_entries`
-   `quality_checks` jika scope.
-   Material issue/return direferensikan ke Inventory movement; hindari
    duplikasi saldo/biaya.

## 9. HR/payroll

-   `employees`
-   `leave_requests`, `leave_balances` jika kebijakan saldo cuti
    digunakan.
-   `overtime_entries` / `timesheets`
-   `employee_loans`, `loan_repayments`
-   `payroll_periods`, `payroll_runs`, `payroll_lines`,
    `payroll_components` Rumus payroll dan struktur komponen belum final
    sampai kebijakan disetujui.

## 10. Kolom audit/lifecycle yang dipertimbangkan

Untuk dokumen transaksi: - `id`, `document_number`, `status` -
`created_at`, `created_by`, `updated_at`, `updated_by` - `approved_at`,
`approved_by` jika berlaku - `posted_at`, `posted_by` jika berlaku -
`cancelled_at`, `cancelled_by`, `cancellation_reason` jika berlaku -
`source_type`, `source_id` atau relasi eksplisit - `idempotency_key`
bila relevan Jangan menambah kolom seragam secara membabi buta;
sesuaikan dengan model dan standar repository.

## 11. Relasi inti

-   Item 1---N stock movements/ledger entries.
-   Location 1---N stock balances/movement lines.
-   Supplier 1---N purchase orders/bills/payments.
-   PO 1---N receipt lines; receipt parsial diperbolehkan bila policy
    disetujui.
-   Customer 1---N quotations/invoices/payments.
-   Quotation 0---N invoice sesuai kebijakan; aturan DP harus mencegah
    duplikasi.
-   Project 1---N work orders/cost references.
-   Work order 1---N material issues/time entries.
-   Employee 1---N payroll lines/leave/overtime/loan records.

## 12. Wajib sebelum schema final

1.  Audit schema/migrations yang sudah ada.
2.  Tentukan ORM/database yang aktif.
3.  Tutup keputusan valuasi stok dan accounting.
4.  Definisikan lifecycle per dokumen.
5.  Definisikan unique constraints, foreign keys, indexes, dan locking.
6.  Buat ERD final dan review lintas domain.
7.  Uji migrasi upgrade, rollback/forward-fix, dan data integrity.

## 13. Pemetaan konseptual ke aktual (terverifikasi 28 Oktober 2026)

Catatan pemetaan singkat. Bukan penulisan ulang model. Bukti adalah
baris `model ...` di `prisma/schema.prisma` repo Silengkap (basis
`origin/main` `327ae39258`). Nama tabel fisik mengikuti `@@map` di
skema bila ada; di bawah ini yang dicantumkan adalah nama model Prisma.

| Entitas konseptual (dokumen ini) | Model Prisma aktual | Bukti |
| --- | --- | --- |
| `items` | `Item` | `prisma/schema.prisma:773` |
| `item_categories`, `brands`, `units_of_measure`, `unit_conversions` | `ItemCategory`, `Brand`, `UnitOfMeasure`, `UomConversion` | `prisma/schema.prisma:725`, `prisma/schema.prisma:709`, `prisma/schema.prisma:5756`, `prisma/schema.prisma:5741` |
| `locations` / `racks` | `Warehouse`, `Rack`, `RackRow` | `prisma/schema.prisma:866`, `prisma/schema.prisma:929`, `prisma/schema.prisma:947` |
| `suppliers`, `customers`, `employees` | `Vendor`, `Customer`, `Employee` | `prisma/schema.prisma:576`, `prisma/schema.prisma:400`, `prisma/schema.prisma:1008` |
| `stock_balances` | Tidak ada model saldo terpisah dengan nama itu; saldo diturunkan dari movement/layer (verifikasi query saldo sebelum mengklaim padanan pasti) | belum ditelusur |
| `stock_movements` / `stock_movement_lines` / `stock_ledger_entries` | `StockMove` (satu baris per item/pergerakan; `referenceType`/`referenceId` ke dokumen sumber), lapisan FIFO di `InventoryLayer` | `prisma/schema.prisma:2498`, `prisma/schema.prisma:2513`, `prisma/schema.prisma:2536` |
| `stocktake_sessions`, `stocktake_lines` | `StocktakeSession`, `StocktakeLine` | `prisma/schema.prisma:3843`, `prisma/schema.prisma:3903` |
| `stock_adjustments` | `StockAdjustment`, `StockAdjustmentItem` | `prisma/schema.prisma:2560`, `prisma/schema.prisma:2599` |
| `remnants`, `scrap_records` | `Remnant`; scrap ditangani lewat klasifikasi layanan, bukan model `ScrapRecord` terpisah yang terverifikasi di sini | `prisma/schema.prisma:3870`; layanan `src/lib/services/scrap-classification.ts` |
| `purchase_orders`, `purchase_order_lines` | `PurchaseOrder`, `PurchaseOrderItem` | `prisma/schema.prisma:2130`, `prisma/schema.prisma:2177` |
| `goods_receipts`, `goods_receipt_lines` | `GoodsReceipt`, `GoodsReceiptItem` | `prisma/schema.prisma:2193`, `prisma/schema.prisma:2228` |
| `supplier_bills`, `supplier_bill_lines` | `VendorBill`, `VendorBillItem` | `prisma/schema.prisma:2309`, `prisma/schema.prisma:2370` |
| `supplier_payments` | `VendorPayment` | `prisma/schema.prisma:2397` |
| `supplier_payment_allocations` (alokasi pembayaran) | `VendorPaymentAllocation` | `prisma/schema.prisma:2448` |
| `purchase_returns` | `PurchaseReturn`, `PurchaseReturnItem` | `prisma/schema.prisma:2254`, `prisma/schema.prisma:2284` |
| `quotations`, `quotation_lines` | `Quotation`, `QuotationItem` (plus `QuotationSection`, `QuotationHistory`) | `prisma/schema.prisma:1503`, `prisma/schema.prisma:1572` |
| DP / uang muka penjualan | `DownPayment` | `prisma/schema.prisma:1619` |
| `customer_invoices`, `customer_invoice_lines` | `SalesInvoice`, `SalesInvoiceItem` | `prisma/schema.prisma:1721`, `prisma/schema.prisma:1864` |
| `customer_payments` | `SalesPayment` — terikat langsung ke `salesInvoiceId`; tidak ada model `SalesPaymentAllocation` terpisah | `prisma/schema.prisma:1981`, `prisma/schema.prisma:1986` |
| Alokasi pembayaran (umum) | Sisi pembelian: `VendorPaymentAllocation`; sisi penjualan: relasi langsung `SalesPayment.salesInvoiceId`. Jangan mengasumsikan tabel alokasi simetris | `prisma/schema.prisma:2448`, `prisma/schema.prisma:1986` |
| `sales_returns` | `SalesReturn`, `SalesReturnItem` | `prisma/schema.prisma:2021`, `prisma/schema.prisma:2058` |
| `accounts` (chart of accounts) | `Account` | `prisma/schema.prisma:1120` |
| `journal_entries`, `journal_lines` | `Journal`, `JournalEntry` (double-entry ada di skema; lihat `FIN-BR-010` di `INDEKS-ATURAN.md`) | `prisma/schema.prisma:4221`, `prisma/schema.prisma:4254` |
| `projects` | `Project` (plus `ProjectItem`, `ProjectStage`) | `prisma/schema.prisma:5174` |
| `work_orders` | `WorkOrder`, `WorkOrderItem`, `WorkOrderOperation` | `prisma/schema.prisma:3251` |
| Material issue proyek/work order | `MaterialIssue`, `MaterialIssueItem`; permintaan material `MaterialRequest` | `prisma/schema.prisma:2763`, `prisma/schema.prisma:2628` |
| `payroll_periods`/`payroll_runs`/`payroll_lines` | `Payroll`, `PayrollComponent`, `PayrollComponentLine` (periode eksplisit di baris payroll; jangan mengklaim model run terpisah) | `prisma/schema.prisma:3958`, `prisma/schema.prisma:4013`, `prisma/schema.prisma:4066` |
| `employee_loans` | `EmployeeLoan` | `prisma/schema.prisma:4166` |
| `leave_requests`, `overtime_entries` | `LeaveRequest`, `OvertimeRequest` | `prisma/schema.prisma:3546`, `prisma/schema.prisma:3809` |
| `users`, `roles`, `permissions` | `User`, `Role`, `Permission` (plus `Module`, `ModuleAction`) | `prisma/schema.prisma:9`, `prisma/schema.prisma:30`, `prisma/schema.prisma:92` |
| `audit_events` | `ActivityLog` | `prisma/schema.prisma:5473` |
| `approval_requests` dsb. | `Approval`, `ApprovalWorkflow`, `ApprovalWorkflowStep`, `ApprovalHistory` | `prisma/schema.prisma:5347`, `prisma/schema.prisma:5308` |
| `document_sequences` | `DocumentSequence` | `prisma/schema.prisma:352` |

Selisih penting dari model konseptual:

- Ledger stok konseptual (`stock_ledger_entries`) di repo terwujud
  terutama sebagai `StockMove` + `InventoryLayer` (FIFO), bukan tiga
  tabel header/line/ledger terpisah.
- Alokasi pembayaran tidak simetris: pembelian punya tabel alokasi
  eksplisit, penjualan menautkan pembayaran langsung ke faktur.
  Aturan alokasi multi-dokumen penjualan perlu verifikasi kode, bukan
  asumsi skema.
- Production/manufacturing punya model sendiri di repo (`Product`,
  `ProductionOrder`, dst.) yang tidak dirinci di dokumen konseptual
  ini; jangan memetakannya ke `WorkOrder` tanpa verifikasi.
