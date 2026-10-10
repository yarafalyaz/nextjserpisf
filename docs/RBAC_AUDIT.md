# Laporan Audit RBAC — SILENGKAP ERP

Dibuat: 2026-10-11 (dev DB `silengkap`)
Sumber data: tabel `roles`, `permissions`, `_RolePermissions`, `_UserRoles` di MySQL dev.

## Ringkasan

| Role | Total permission | modul | view | create | edit | delete |
|---|---:|---:|---:|---:|---:|---:|
| super_admin | 292 | ALL | 70 | 61 | 62 | 60 |
| admin | 292 | ALL | 70 | 61 | 62 | 60 |
| finance | 94 | 33 | 16 | 16 | 15 |
| staff | 60 | 26 | 17 | 16 | 0 |
| ga | 52 | 15 | 11 | 11 | 10 |
| kepala_bengkel | 47 | 24 | 8 | 7 | 0 |
| warehouse | 24 | 12 | 5 | 5 | 0 |
| purchasing | 21 | 11 | 5 | 5 | 0 |
| karyawan | 14 | 13 | 1 | 0 | 0 |

- **9 role**, **292 permission**, **897 mapping** role→permission.
- Permission oryat (tidak dipegang role manapun): **0**.
- Permission dipakai di kode tapi tidak ada di DB: **0** (kecuali string test `anything`/`manager`).
- Guard: **357** file route memakai `requirePermission`/`requireAnyPermission`/`requireRole`.

## Pemetaan User → Role

| Email | Role |
|---|---|
| admin@isf.co.id | super_admin |
| admin@erp.yarasoft.net | super_admin |
| admin.dewi@isf.co.id | admin |
| staff@isf.co.id | staff |
| ga@isf.co.id | ga |
| kabeng@isf.co.id | kepala_bengkel |
| karyawan@isf.co.id | karyawan |
| pembelian@isf.co.id | purchasing |
| gudang@isf.co.id | warehouse |
| keuangan@isf.co.id | finance |

## Detail Permission per Role

## `admin` — 292 permission, 84 modul

| Modul | Aksi |
|---|---|
| accounts | create, delete, edit, view |
| appreciations | create, delete, view |
| asset_brands | create, delete, edit, view |
| asset_categories | create, delete, edit, view |
| asset_transfers | create, delete, edit, view |
| assets | create, delete, edit, manage, view |
| attendance | create, edit, manage, view |
| bank_reconciliation | manage, view |
| bank_statements | view |
| banks | create, delete, edit, view |
| barcodes | create, delete, edit, view |
| bom_revisions | manage, view |
| brands | create, delete, edit, view |
| budgets | create, delete, edit, view |
| cost_centers | create, delete, edit, view |
| currencies | create, delete, edit, view |
| customers | create, delete, edit, view |
| dashboard | view |
| delivery_orders | create, delete, edit, view |
| departments | create, delete, edit, view |
| down_payments | confirm, create, delete, edit, view |
| employee_loans | view |
| employees | create, delete, edit, view |
| expense_categories | manage |
| expenses | approve, create, delete, edit, view |
| goods_receipts | create, delete, edit, verify, view |
| holidays | create, delete, edit, manage |
| inventory | edit, manage, view |
| inventory_transfers | create, delete, edit, view |
| item_categories | create, delete, edit, view |
| items | create, delete, edit, view |
| journals | create, delete, edit, post, view |
| leads | create, delete, edit, manage, view |
| leave_requests | approve, create, delete, edit, view |
| loans | approve, create, delete |
| material_issues | create, delete, edit, view |
| nonconformances | manage |
| overtime | approve, view |
| overtime_requests | approve, create, delete, edit |
| payment_methods | create, delete, edit, view |
| payment_terms | create, delete, edit, view |
| payroll | create, edit, process, update, view |
| petty_cash | create, delete, edit, view |
| positions | create, delete, edit, view |
| production | edit, view |
| production_costs | manage |
| production_orders | create, delete, edit |
| products | create, delete, edit |
| projects | create, delete, edit, manage, view |
| purchase_orders | approve, create, delete, edit, view |
| purchase_requests | approve, create, delete, edit, view |
| purchase_returns | approve, create, delete, edit, view |
| qc | view |
| qc_checklists | manage |
| qc_inspections | manage |
| quotations | approve, confirm, create, delete, edit, view |
| reports | view |
| roles | manage |
| sales_invoices | approve, create, delete, edit, post, view |
| sales_orders | approve, create, delete, edit, view |
| sales_payments | create, delete, edit, view |
| sales_returns | create, delete, edit, view |
| settings | manage |
| shipping_methods | create, delete, edit, view |
| statistical_key_figures | delete, edit, view |
| stock_adjustments | create, delete, edit, process, view |
| stock_moves | view |
| tax_groups | edit, view |
| taxes | create, delete, edit, view |
| tickets | create, delete, edit, view |
| timesheets | create, delete, view |
| units | edit, view |
| users | manage |
| vehicle_brands | create, delete, edit, view |
| vehicle_fitments | create, delete, edit, view |
| vehicle_models | create, delete, edit, view |
| vehicles | create, delete, edit, view |
| vendor_bills | approve, create, delete, edit, view |
| vendor_payments | approve, create, delete, edit, view |
| vendors | create, delete, edit, view |
| warehouses | create, delete, edit, view |
| work_orders | complete, create, delete, edit, view |
| work_schedules | create, delete, view |
| workflows | approve |

## `super_admin` — 292 permission, 84 modul

| Modul | Aksi |
|---|---|
| accounts | create, delete, edit, view |
| appreciations | create, delete, view |
| asset_brands | create, delete, edit, view |
| asset_categories | create, delete, edit, view |
| asset_transfers | create, delete, edit, view |
| assets | create, delete, edit, manage, view |
| attendance | create, edit, manage, view |
| bank_reconciliation | manage, view |
| bank_statements | view |
| banks | create, delete, edit, view |
| barcodes | create, delete, edit, view |
| bom_revisions | manage, view |
| brands | create, delete, edit, view |
| budgets | create, delete, edit, view |
| cost_centers | create, delete, edit, view |
| currencies | create, delete, edit, view |
| customers | create, delete, edit, view |
| dashboard | view |
| delivery_orders | create, delete, edit, view |
| departments | create, delete, edit, view |
| down_payments | confirm, create, delete, edit, view |
| employee_loans | view |
| employees | create, delete, edit, view |
| expense_categories | manage |
| expenses | approve, create, delete, edit, view |
| goods_receipts | create, delete, edit, verify, view |
| holidays | create, delete, edit, manage |
| inventory | edit, manage, view |
| inventory_transfers | create, delete, edit, view |
| item_categories | create, delete, edit, view |
| items | create, delete, edit, view |
| journals | create, delete, edit, post, view |
| leads | create, delete, edit, manage, view |
| leave_requests | approve, create, delete, edit, view |
| loans | approve, create, delete |
| material_issues | create, delete, edit, view |
| nonconformances | manage |
| overtime | approve, view |
| overtime_requests | approve, create, delete, edit |
| payment_methods | create, delete, edit, view |
| payment_terms | create, delete, edit, view |
| payroll | create, edit, process, update, view |
| petty_cash | create, delete, edit, view |
| positions | create, delete, edit, view |
| production | edit, view |
| production_costs | manage |
| production_orders | create, delete, edit |
| products | create, delete, edit |
| projects | create, delete, edit, manage, view |
| purchase_orders | approve, create, delete, edit, view |
| purchase_requests | approve, create, delete, edit, view |
| purchase_returns | approve, create, delete, edit, view |
| qc | view |
| qc_checklists | manage |
| qc_inspections | manage |
| quotations | approve, confirm, create, delete, edit, view |
| reports | view |
| roles | manage |
| sales_invoices | approve, create, delete, edit, post, view |
| sales_orders | approve, create, delete, edit, view |
| sales_payments | create, delete, edit, view |
| sales_returns | create, delete, edit, view |
| settings | manage |
| shipping_methods | create, delete, edit, view |
| statistical_key_figures | delete, edit, view |
| stock_adjustments | create, delete, edit, process, view |
| stock_moves | view |
| tax_groups | edit, view |
| taxes | create, delete, edit, view |
| tickets | create, delete, edit, view |
| timesheets | create, delete, view |
| units | edit, view |
| users | manage |
| vehicle_brands | create, delete, edit, view |
| vehicle_fitments | create, delete, edit, view |
| vehicle_models | create, delete, edit, view |
| vehicles | create, delete, edit, view |
| vendor_bills | approve, create, delete, edit, view |
| vendor_payments | approve, create, delete, edit, view |
| vendors | create, delete, edit, view |
| warehouses | create, delete, edit, view |
| work_orders | complete, create, delete, edit, view |
| work_schedules | create, delete, view |
| workflows | approve |

## `finance` — 94 permission, 34 modul

| Modul | Aksi |
|---|---|
| accounts | create, delete, edit, view |
| bank_reconciliation | manage, view |
| bank_statements | view |
| budgets | create, delete, edit, view |
| cost_centers | create, delete, edit, view |
| customers | view |
| dashboard | view |
| departments | view |
| down_payments | confirm, create, delete, edit, view |
| employee_loans | view |
| employees | view |
| expenses | approve, create, delete, edit, view |
| items | view |
| journals | create, delete, edit, post, view |
| loans | create, delete |
| payment_methods | create, delete, edit, view |
| payment_terms | create, delete, edit, view |
| payroll | create, edit, process, update, view |
| petty_cash | create, delete, edit, view |
| positions | view |
| projects | view |
| purchase_orders | approve, view |
| purchase_requests | approve, view |
| quotations | approve, view |
| reports | view |
| sales_invoices | approve, create, delete, edit, post, view |
| sales_orders | approve, view |
| sales_payments | create, delete, edit, view |
| tax_groups | edit, view |
| taxes | create, delete, edit, view |
| vendor_bills | approve, create, delete, edit, view |
| vendor_payments | approve, create, delete, edit, view |
| vendors | view |
| warehouses | view |

## `staff` — 60 permission, 26 modul

| Modul | Aksi |
|---|---|
| attendance | create, view |
| barcodes | create, edit, view |
| brands | create, edit, view |
| currencies | view |
| customers | create, edit, view |
| dashboard | view |
| delivery_orders | create, edit, view |
| employees | view |
| goods_receipts | create, edit, view |
| item_categories | create, edit, view |
| items | create, edit, view |
| payment_terms | view |
| projects | create, edit, view |
| purchase_orders | create, edit, view |
| purchase_requests | create, edit, view |
| quotations | confirm, create, edit, view |
| sales_invoices | create, edit, view |
| sales_orders | create, edit, view |
| sales_payments | create, edit, view |
| sales_returns | create, edit, view |
| vehicle_brands | view |
| vehicle_fitments | view |
| vehicle_models | view |
| vehicles | view |
| vendors | create, edit, view |
| warehouses | view |

## `ga` — 52 permission, 16 modul

| Modul | Aksi |
|---|---|
| asset_brands | create, delete, edit, view |
| asset_categories | create, delete, edit, view |
| asset_transfers | create, delete, edit, view |
| assets | create, delete, edit, manage, view |
| attendance | create, edit, manage, view |
| dashboard | view |
| departments | view |
| employees | view |
| holidays | create, delete, edit, manage |
| leave_requests | approve, create, delete, edit, view |
| positions | view |
| projects | create, delete, edit, manage, view |
| vehicle_brands | create, delete, edit, view |
| vehicle_fitments | create, delete, edit, view |
| vehicle_models | view |
| vehicles | create, delete, edit, view |

## `kepala_bengkel` — 47 permission, 31 modul

| Modul | Aksi |
|---|---|
| attendance | create, edit, view |
| bom_revisions | manage, view |
| brands | view |
| customers | view |
| dashboard | view |
| employees | view |
| item_categories | view |
| items | view |
| leave_requests | approve, create, edit, view |
| material_issues | view |
| nonconformances | manage |
| overtime | view |
| overtime_requests | approve, create, edit |
| production | view |
| production_costs | manage |
| production_orders | create, edit |
| products | create, edit |
| projects | view |
| purchase_requests | create, edit, view |
| qc | view |
| qc_checklists | manage |
| qc_inspections | manage |
| timesheets | create, view |
| units | view |
| vehicle_brands | view |
| vehicle_fitments | view |
| vehicle_models | view |
| vehicles | view |
| vendors | view |
| warehouses | view |
| work_orders | complete, create, edit, view |

## `warehouse` — 24 permission, 12 modul

| Modul | Aksi |
|---|---|
| dashboard | view |
| delivery_orders | create, edit, view |
| goods_receipts | create, edit, verify, view |
| inventory_transfers | create, edit, view |
| item_categories | view |
| items | view |
| material_issues | create, edit, view |
| purchase_orders | view |
| sales_orders | view |
| stock_adjustments | create, edit, process, view |
| units | view |
| warehouses | view |

## `purchasing` — 21 permission, 11 modul

| Modul | Aksi |
|---|---|
| brands | view |
| dashboard | view |
| goods_receipts | view |
| item_categories | view |
| items | view |
| purchase_orders | create, edit, view |
| purchase_requests | create, edit, view |
| purchase_returns | create, edit, view |
| units | view |
| vendor_bills | create, edit, view |
| vendors | create, edit, view |

## `karyawan` — 14 permission, 13 modul

| Modul | Aksi |
|---|---|
| attendance | view |
| dashboard | view |
| employee_loans | view |
| item_categories | view |
| items | view |
| leave_requests | create, view |
| overtime | view |
| payroll | view |
| projects | view |
| timesheets | view |
| units | view |
| work_orders | view |
| work_schedules | view |
