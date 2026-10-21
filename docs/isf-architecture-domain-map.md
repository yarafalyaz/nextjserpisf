# ISF ERP — Architecture & Domain Map

> Pemilik: Lead Architect. Basis bukti: repo di `origin/main` 7a8c1ea2, 2026-10-21.
> Dokumen pelengkap: `docs/prd.md` (potret sistem berjalan), `docs/prd-erp-fabrikasi-offroad.md`,
> `docs/module-connections.md`, `docs/erp-research-backlog.md` (ID F-*), `docs/isf-lead-feature-matrix.md`.

## 1. Stack terverifikasi (bukan asumsi)

| Lapisan | Aktual di repo | Bukti |
|---|---|---|
| App | Next.js 16.4.2 App Router, React 19.3.1, route group `(dashboard)` slug Indonesia | `package.json`; `src/app/(dashboard)/` |
| Bahasa | TypeScript 6.0.3, Zod 4.6.7 | `package.json` |
| UI | shadcn/ui (style new-york, `components.json`), Tailwind 4.3, lucide | `components.json` aliases `@/components/ui/shadcn` |
| ORM/DB | Prisma 7.10.1, datasource `mysql`, adapter `@prisma/adapter-mariadb` 7.10.1, driver `mariadb` 3.5.2 | `prisma/schema.prisma` header; `package.json`. Label runtime: MySQL 8.0.46 di produksi (keputusan owner); adapter MariaDB adalah detail driver Prisma, bukan label DB |
| Auth | NextAuth 5 beta (kredensial, JWT), gerbang `src/proxy.ts`, izin per modul/aksi | `src/lib/auth/*`, `src/proxy.ts` |
| Tes | Vitest (±550 berkas tes di `src`), Playwright `e2e/` (50 spec), CI 5 gerbang: Lint, Unit, Build, DB Integration, SonarCloud | `vitest.config.ts`, `e2e/`, `gh pr checks` |
| Skala | 154 model Prisma, ±1.531 berkas TSX, 79 migrasi | hitung repo 2026-10-21 |

Dilarang tanpa persetujuan eksplisit: NestJS, Drizzle/ORM lain, design system kedua,
framework tes baru. Pola tulis: Server Component dulu, Server Action di `src/actions/`,
logika murni di `src/lib/reports|services`, uang Decimal/sen via parser format Indonesia.

## 2. Domain boundaries

| Domain | Model inti (schema) | Pemilik bot | Batas tulis |
|---|---|---|---|
| Master & identitas | User/Role/Permission, Customer, Vendor, Item, Warehouse/Rack, Employee, Department | Backend (data), Business (aturan) | Schema/migrasi hanya lewat Backend + vonis Lead |
| Penjualan & proyek jual | Quotation(+Section/Item/History), DownPayment, SalesOrder, SalesInvoice, SalesPayment, CustomerCredit, Project | Business | Nilai kontrak tunggal = `Quotation.grandTotal` berjalan (vonis F-103); jangan sumber nilai kedua |
| Pembelian & payable | PurchaseRequest, PurchaseOrder, GoodsReceipt, VendorBill, VendorPayment(+Allocation), PurchaseAdvance | Backend | Landed cost menempel ke layer FIFO penerimaan |
| Persediaan | StockMove, InventoryLayer (FIFO), StockAdjustment, InventoryTransfer, MaterialIssue, ItemBatch/Serial, Remnant, Stocktake | Backend | Semua keluar stok wajib lewat guard layer (kedaluwarsa F-011 selesai #279); reservasi mengikat belum ada (F-012 lapis peringatan) |
| Produksi & bengkel | Product/BomRevision, ProductionOrder(+Material/Cost/Genealogy), WorkOrder(+Item), QcChecklist/Inspection, Nonconformance | Backend | Biaya job tidak diubah oleh perubahan harga tagih (vonis F-103); WorkCenter/operasi belum ada (gap P0) |
| Keuangan & akuntansi | Account, Journal/JournalEntry, Bank*, Expense, PettyCash, Cheque, RecurringTransaction, FinancialIdempotencyKey | Finance-Tax | Jurnal posted tak diedit diam-diam; koreksi via reversal; posting idempoten |
| Pajak | Tax, TaxGroup, WithholdingTaxType, TaxPayment; nomor di SalesInvoice/VendorBill | Finance-Tax (vonis), Backend (bangun) | Model TaxInvoice/Bupot inti F-001..006 divonis, implementasi berjalan; tarif/kode tidak ditebak — register bersumber DJP |
| SDM & payroll | Employee, Payroll(+StatutoryRule), EmployeeLoan, Timesheet, Attendance, Leave/Overtime, WorkSchedule/Holiday | Business | Data gaji sensitif: otorisasi server ketat; rekap borongan informatif ≠ dasar bayar (F-97a) |
| Kendaraan | VehicleBrand/Model/Variant, Vehicle, CustomerVehicle, fitment rule | Backend + Business | Odometer belum ada → prasyarat garansi F-021 |
| CRM & layanan | Lead(+Activity), CrmTicket(+Comment) | Business | Tiket generik bukan klaim garansi |
| Aset | Asset(+Category/Group/Brand/History/Transfer) | Finance-Tax | — |
| Platform | SystemSetting, DocumentSequence, Notification, ActivityLog, TransactionAttachment, ApprovalWorkflow | Lead (standar), QA (audit) | Lampiran generik wajib dipakai ulang, bukan tabel lampiran baru per modul |

## 3. Dependency map (alur nilai)

```
Master (Item/Warehouse/Customer/Employee/Account)
  └─> Penawaran (Quotation.grandTotal = sumber nilai kontrak tunggal)
        ├─> DP/Termin ─> SalesOrder ─> WorkOrder/ProductionOrder
        │                     │              ├─> MaterialIssue ─> InventoryLayer FIFO (HPP)
        │                     │              ├─> ProductionCost (labor via Timesheet)
        │                     │              └─> QC/Nonconformance ─> serah terima
        ├─> Invoice progres/selisih/kredit revisi-turun ─> SalesPayment/CustomerCredit
        └─> Jurnal (accounting hook) ─> Buku Besar ─> Laporan
Pembelian: PR ─> PO ─> GoodsReceipt (landed cost → layer) ─> VendorBill ─> VendorPayment ─> Jurnal
Pajak (F-001..006): SalesInvoice/VendorBill ─> TaxInvoice/Bupot ─> SPT masa ─> TaxPayment (NTPN)
Garansi (F-021, belum ada): serah terima WO ─> WarrantyCoverage (serial+odometer) ─> Claim ─> WO perbaikan
Jadwal (F-019/020, belum ada): WorkOrder ─> Operation(WorkCenter, teknisi, jam) ─> beban vs kapasitas
```

Aturan rantai: stok hanya bergerak lewat dokumen stok; uang hanya lewat jurnal dari
dokumen sumber; laporan membaca read-model (`src/lib/reports/*`), tidak menghitung ulang
di komponen UI.

## 4. Backlog prioritas (ringkas; rincian di erp-research-backlog.md)

| Urutan | ID | Isi | Owner | Status 2026-10-21 |
|---|---|---|---|---|
| 1 | F-2026-10-21-001..006 | Inti pajak: TaxInvoice keluar/masuk, Bupot, retur-pajak, setor masa, varians | Finance-Tax vonis final; Backend bangun | Implementasi berjalan di branch pajak backend (belum merge) |
| 2 | F-2026-10-21-021/022 | Garansi pasang + klaim supplier | Backend (model), Business (alur), QA (eligibility) | Belum ada; mulai odometer+terms |
| 3 | F-2026-10-21-019/020 + P0-2(e) | Timesheet–WO, operasi/routing, WorkCenter & kapasitas | Backend + Frontend | Belum ada |
| 4 | F-2026-10-21-017 | Penegakan batas kredit pelanggan | Business + Backend | Disimpan, tak ditegakkan |
| 5 | F-2026-10-21-009/008 | Tutup job + scrap terstruktur | Backend + Finance-Tax | Absen/parsial |
| 6 | F-2026-10-21-012/013/014/015 | Reservasi mengikat, min stok per gudang+lead time, permintaan antar gudang, penerimaan transfer parsial | Backend | Lapis aman 012/013 selesai (#280/#281); inti menunggu |
| 7 | F-2026-10-20-103/104 inti | Model JobChangeOrder + ganti revisi BOM berjalan | Backend sesudah PUTUSAN urutan | Lapis aman selesai (#275/#282); inti ditunda-teknis sadar |
| 8 | F-2026-10-21-016/018 | Komisi penjualan; harga bertingkat kuantitas | Business | Absen; bangun hanya bila aturan komisi disahkan |

Selesai sesi ini (tergabung main): F-011 (#279), F-012 lapis aman (#280), F-013 lapis aman
(#281), F-017 lapis paparan (#283), F-105 kartu (#276), F-97a halaman (#277), F-103 kartu (#282).

## 5. Task ownership enam bot

Profil Hermes terverifikasi ada di mesin ini (`hermes profile list`, 2026-10-21):
`lead-architect-erp-research-git-pr` (Lead, profil ini), `frontend-ui-ux-next-js`,
`backend-prisma-inventory-workshop`, `accounting-finance-tax`,
`sales-crm-hr-payroll-business-workflow`, `qa-security-reporting-release-auditor`.
Paket prompt portabel enam peran juga tergabung di repo: `ops/hermes-isf/` (PR #278)
dengan nama profil `isf-*` untuk instalasi baru — jangan buat profil duplikat di mesin ini.

| Bot (profil aktif) | Milik file/domain | Dilarang |
|---|---|---|
| Lead (profil ini) | docs riset/PRD/matrix, board, review+merge PR gate 5/5 | Edit schema, edit file yang diklaim bot lain |
| Frontend `frontend-ui-ux-next-js` | `src/app/**` halaman, `src/components/**`, nav/registry laporan | Hitung ulang angka laporan di UI; tulis status dokumen |
| Backend `backend-prisma-inventory-workshop` | `prisma/*`, `src/actions/*`, `src/lib/services/*`, `src/lib/reports/*-data.ts` | Ubah aturan jurnal tanpa vonis Finance-Tax |
| Finance-Tax `accounting-finance-tax` | Vonis jurnal/pajak, `src/lib/tax/*`, validasi finance | Klaim kepatuhan pajak tanpa sumber DJP |
| Business `sales-crm-hr-payroll-business-workflow` | Alur jual/CRM/SDM, requirement status-transition | Mengarang aturan bisnis (DP %, komisi) tanpa pengesahan |
| QA `qa-security-reporting-release-auditor` | Tes, audit keamanan/rekonsiliasi, verifikasi acceptance | Merge/deploy; edit diam-diam milik bot lain |

Koordinasi: `docs/autonomous-board.md` (KLAIM sebelum edit, HANDOFF bertarget,
satu pelaku merge). File sama tidak diedit dua bot bersamaan.

## 6. Risiko & keputusan terbuka

| # | Risiko/keputusan | Dampak | Mitigasi/penanggung |
|---|---|---|---|
| R1 | Tarif/kode pajak berubah (Coretax) | SPT salah | Register pajak bersumber+tanggal efektif; konfigurasi, bukan hardcode (Finance-Tax) |
| R2 | Eligibility garansi salah | Tagih pelanggan yang harusnya ter-cover | termsSnapshot saat pasang, keputusan manual ber-approval (F-021) |
| R3 | Jadwal bengkel tanpa data operasi | Janji selesai ditebak | Bangun operasi/routing sebelum APS (F-019/020) |
| R4 | Konsinyasi & multi-cabang meniru vendor | Biaya bangun tanpa kebutuhan | Ditunda sadar sampai kanal nyata ada (keputusan Lead) |
| R5 | Branch pajak backend lama tak merge | Konflik schema membesar | Lead review mingguan branch `hermes/leadbackend-tax-f001-006` — tree kotor dilindungi, tidak disentuh bot lain |
| R6 | `docs/prd.md` menyebut rencana migrasi Laravel | Salah baca sebagai instruksi ganti stack | Stack wajib tetap Next.js/Prisma/MySQL; PRD itu potret, bukan mandat migrasi (catatan §1 prd.md sendiri) |

Tidak ada klaim siap produksi dari dokumen ini: kesiapan rilis diputus QA per rilis
dengan bukti tes, bukan dari kelengkapan daftar fitur.
