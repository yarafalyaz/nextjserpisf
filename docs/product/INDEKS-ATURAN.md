# INDEKS ATURAN --- ERP ISF

**Status:** Peta, bukan klaim audit penuh. Dibuat 28 Oktober 2026 dari
repo Silengkap basis `origin/main` `327ae39258b4cce6dfd27492d02aae2cfc6f3a65`.

Dokumen ini memetakan semua ID aturan dari
[BUSINESS-RULES.md](BUSINESS-RULES.md) (81 ID) dan
[ACCEPTANCE-CRITERIA.md](ACCEPTANCE-CRITERIA.md) (44 ID) ke status
implementasi yang dapat ditunjuk di repo. Untuk tiap ID hanya diberi
satu bukti jalur paling relevan (`path:baris` relatif ke root repo)
atau tulisan `belum ditelusur`. `belum ditelusur` berarti penegak
spesifiknya tidak ditemukan dalam penelusuran terbatas ini — bukan
bukti aturan itu tidak ada, dan bukan bukti aturan itu dilanggar.

Arti status:

- **Terpasang** — penegak/strukturnya dapat ditunjuk langsung di repo.
- **Sebagian** — mekanisme pendukung ada, tetapi penegakan menyeluruh
  untuk bunyi aturan ini belum terbukti dari satu bukti di bawah.
- **Belum** — belum ada bukti penegak yang ditemukan/ditelusur.
- **OPEN-keputusan** — sumber menandai keputusan bisnisnya terbuka.
  Implementasi parsial yang mungkin ada tidak menutup keputusan ini.

Jangan membaca `Terpasang`/`Sebagian` di sini sebagai lulus
acceptance criteria. Acceptance tetap butuh test dan verifikasi
perilaku, bukan hanya keberadaan file/model.

> **Keputusan terverifikasi sudah dilipat:** tabel keputusan
> terverifikasi ada di
> [KEPUTUSAN-TERVERIFIKASI.md](KEPUTUSAN-TERVERIFIKASI.md), dengan ADR
> keputusan bisnis
> [ADR-004](ADRs/ADR-004-stack-baseline-terverifikasi.md) (stack
> baseline),
> [ADR-005](ADRs/ADR-005-valuasi-stok-landed-cost-stok-negatif.md)
> (valuasi stok, landed cost, stok negatif),
> [ADR-006](ADRs/ADR-006-model-accounting-double-entry.md) (model
> accounting double-entry), dan
> [ADR-007](ADRs/ADR-007-perilaku-dp-konversi-faktur.md) (perilaku DP
> dan konversi faktur). Status tiap baris `OPEN-keputusan` di bawah
> tidak otomatis berubah oleh dokumen-dokumen itu: baca status
> keputusan terkait di `KEPUTUSAN-TERVERIFIKASI.md`, termasuk daftar
> keputusan yang masih OPEN di sana (mis. reversal DP pasca-konversi
> tetap menjadi sisa ADR-003).


## 1. Global — `GL-BR-*`

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| GL-BR-001 | Sebagian | prisma/schema.prisma:2511 — `StockMove.status` default `draft`; isolasi draft per modul belum diaudit |
| GL-BR-002 | Sebagian | src/app/api/cron/asset-depreciation/route.ts:287 — contoh `prisma.$transaction`; atomisitas semua posting belum terbukti |
| GL-BR-003 | Belum | belum ditelusur — penegak larangan edit/hapus bebas transaksi posted tidak ditunjuk di sini |
| GL-BR-004 | Sebagian | src/lib/services/financial-idempotency.service.ts:1 — kontrak idempotency finansial persisten; cakupan scope-nya terbatas pada daftar di file yang sama |
| GL-BR-005 | Sebagian | src/lib/services/activity-log.service.ts:10 — `logActivity`; model audit `prisma/schema.prisma:5473` (`ActivityLog`) |
| GL-BR-006 | Terpasang | src/lib/auth/permissions.ts:21 — `requirePermission()` memeriksa permission di backend |
| GL-BR-007 | Sebagian | prisma/schema.prisma:2501 — `StockMove.documentNo` unik; penomoran dokumen lain memakai `src/lib/services/document-sequence.service.ts` (belum ditelusur per dokumen) |
| GL-BR-008 | Terpasang | prisma/schema.prisma:1990 — `SalesPayment.amount` `Decimal @db.Decimal(15, 2)`; pola Decimal yang sama dipakai field uang di skema |
| GL-BR-009 | Sebagian | belum ditelusur di kode — aturan proses/dokumen; perwujudannya di paket ini adalah penandaan `OPEN` di BUSINESS-RULES.md dan indeks ini |

## 2. Inventory — `INV-BR-*`

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| INV-BR-001 | Sebagian | src/actions/sales.actions.ts:1248 — `onSalesInvoicePosted(...)` dipanggil dalam alur posting faktur; pengurangan stok per baris belum ditelusur baris per baris |
| INV-BR-002 | Sebagian | prisma/schema.prisma:3843 — `StocktakeSession` ada; alur approval adjustment-nya belum ditelusur |
| INV-BR-003 | Sebagian | prisma/schema.prisma:3870 — model `Remnant` ada |
| INV-BR-004 | Sebagian | src/lib/services/scrap-classification.ts:8 — klasifikasi scrap memakai cost FIFO terbawa baris |
| INV-BR-005 | Sebagian | prisma/schema.prisma:2513 — `StockMove.referenceType`/`referenceId` menautkan movement ke dokumen sumber |
| INV-BR-006 | Sebagian | src/lib/services/inventory-fifo.ts:91 — `consumeFifoLayers`; atomisitas menyeluruh bergantung transaksi pemanggil, belum diaudit |
| INV-BR-007 | OPEN-keputusan | Keputusan negative stock terbuka di sumber. Penegak policy final: belum ditelusur |
| INV-BR-008 | Sebagian | prisma/schema.prisma:2674 — model `InventoryTransfer` ada; atomisitas asal/tujuan belum ditelusur |
| INV-BR-009 | Sebagian | prisma/schema.prisma:2511 — status `draft` adalah status awal `StockMove`; perilaku gagal posting per modul belum diaudit |
| INV-BR-010 | Belum | belum ditelusur — jalur reversal/retur/adjustment khusus stok posted tidak ditunjuk di sini |
| INV-BR-011 | Sebagian | prisma/schema.prisma:2560 — `StockAdjustment` ada; kelengkapan alasan/approver/waktu belum ditelusur per field |
| INV-BR-012 | Belum | belum ditelusur — guard anti movement ganda khusus posting stok tidak ditunjuk di sini |
| INV-BR-013 | Belum | belum ditelusur — larangan hapus ledger oleh pengguna operasional tidak ditunjuk di sini |
| INV-BR-014 | Sebagian | prisma/schema.prisma:2763 — `MaterialIssue` ada sebagai referensi pemakaian material |
| INV-BR-015 | Sebagian | prisma/schema.prisma:3870 — `Remnant`; klasifikasi return reusable/remnant/scrap: `src/lib/services/scrap-classification.ts:8`, alur return-nya belum ditelusur |

## 3. Purchasing — `PUR-BR-*`

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| PUR-BR-001 | Sebagian | src/lib/hooks/goods-receipt.hook.ts:18 — hook goods receipt membuat Stock Move IN saat verifikasi |
| PUR-BR-002 | Sebagian | src/lib/hooks/purchase-order.hook.ts:11 — `onPurchaseOrderCreated` hanya memperbarui status purchase request; ketiadaan efek stok PO tidak dibuktikan hanya dari hook ini |
| PUR-BR-003 | Sebagian | prisma/schema.prisma:2228 — `GoodsReceiptItem`; tampilan dipesan/diterima/sisa belum ditelusur |
| PUR-BR-004 | OPEN-keputusan | Keputusan over-receipt terbuka di sumber. Penegak toleransi/approval: belum ditelusur |
| PUR-BR-005 | Terpasang | prisma/schema.prisma:2309 — `VendorBill` terpisah dari `prisma/schema.prisma:2397` — `VendorPayment` |
| PUR-BR-006 | Sebagian | prisma/schema.prisma:2448 — `VendorPaymentAllocation` menautkan pembayaran ke bill dengan amount alokasi |
| PUR-BR-007 | Sebagian | prisma/schema.prisma:2448 — alokasi ada; perhitungan outstanding/status lunas belum ditelusur |
| PUR-BR-008 | OPEN-keputusan | Keputusan ongkir/landed cost terbuka di sumber. Implementasi parsial ada: `src/lib/services/landed-cost.service.ts:4` mengalokasikan ongkir PO ke HPP — itu fakta kode, bukan keputusan policy tertutup di dokumen ini |
| PUR-BR-009 | Sebagian | prisma/schema.prisma:2254 — `PurchaseReturn` ada; efek stok/finansial return belum ditelusur |
| PUR-BR-010 | Belum | belum ditelusur — larangan hapus fisik dokumen pembelian posted tidak ditunjuk di sini |
| PUR-BR-011 | Terpasang | prisma/schema.prisma:2448 — tabel alokasi `VendorPaymentAllocation` eksplisit untuk pembayaran supplier |
| PUR-BR-012 | Sebagian | prisma/schema.prisma:2309 — dokumen PO/receipt/bill/payment adalah model terpisah; laporan pembedanya belum ditelusur |

## 4. Sales — `SAL-BR-*`

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| SAL-BR-001 | Sebagian | prisma/schema.prisma:1503 — `Quotation` adalah dokumen tersendiri; ketiadaan efek stok/piutang belum dibuktikan negatif di sini |
| SAL-BR-002 | Sebagian | prisma/schema.prisma:1629 — `DownPayment.status` default `pending`; perhitungan ambang hanya dari DP terkonfirmasi belum ditelusur per baris |
| SAL-BR-003 | Sebagian | src/actions/sales.actions.ts:1248 — hook posting faktur terpanggil; seleksi baris stock-item belum ditelusur |
| SAL-BR-004 | Tertutup-terverifikasi (sisa OPEN: reversal DP pasca-konversi) | Model akunting DP ditentukan kode: konfirmasi memanggil `onDownPaymentReceived` lalu `onDownPaymentConfirmed` dalam satu transaksi (`src/actions/sales.actions.ts:980-981`); jurnal terima `POSTED` Dr kas/bank / Cr kewajiban Uang Muka Penjualan 210102 (neto PPN + Cr 210201 bila terutang) lewat `src/lib/hooks/accounting.hook.ts:2498-2519` + `src/lib/tax/down-payment-vat.ts:261-278`, fail-closed bila akun belum terkonfigurasi (`src/lib/hooks/accounting.hook.ts:2382-2387`); alokasi reklas Dr 210102 / Cr Piutang tanpa kas kedua (`src/lib/hooks/down-payment.hook.ts:756-775`). Sisa OPEN tunggal: reversal DP pasca-konversi (ADR-003) |
| SAL-BR-005 | Sebagian | src/lib/hooks/down-payment.hook.ts:639-646 — ambang = persen kategori pelanggan tersnapshot per quotation (`Quotation.invoiceThresholdPercent` dari `CustomerCategory.downPaymentPercent`, ditulis di src/actions/sales.actions.ts:261); 50% hanya fallback fail-closed bawaan bila snapshot tak sah (src/lib/sales/invoice-threshold.ts:17,38-49). Cara baca: jangan baca 50% sebagai ambang tetap |
| SAL-BR-006 | Sebagian | src/lib/hooks/down-payment.hook.ts:45 — `onDownPaymentConfirmed` adalah titik konfirmasi DP; syarat posted untuk ambang belum ditelusur per baris |
| SAL-BR-007 | Sebagian | src/lib/sales/invoice-threshold.ts:1 — catatan desain ambang DP→invoice dan penjaga di hook; idempotensi konversi belum dibuktikan test di indeks ini |
| SAL-BR-008 | Sebagian | prisma/schema.prisma:1623 — `DownPayment.quotationId` menautkan DP ke quotation; referensi invoice hasil ke pembayaran pemicu belum ditelusur |
| SAL-BR-009 | Belum | belum ditelusur — proses koreksi terkontrol khusus faktur posted tidak ditunjuk di sini |
| SAL-BR-010 | Sebagian | prisma/schema.prisma:1986 — `SalesPayment.salesInvoiceId` menautkan pembayaran langsung ke faktur; tidak ada model alokasi penjualan terpisah |
| SAL-BR-011 | Sebagian | prisma/schema.prisma:1981 — `SalesPayment` ada; perhitungan outstanding/status lunas belum ditelusur |
| SAL-BR-012 | Sebagian | prisma/schema.prisma:2021 — `SalesReturn` ada; pelestarian histori faktur asal belum ditelusur |
| SAL-BR-013 | Belum | belum ditelusur — pengecualian stok untuk jasa/non-stock per baris faktur tidak ditunjuk di sini |
| SAL-BR-014 | Belum | belum ditelusur — guard anti pengurangan stok ganda penjualan vs material proyek tidak ditunjuk di sini |
| SAL-BR-015 | Sebagian | Basis tertutup-terverifikasi: ambang dari `grandTotal` quotation, faktur penuh lahir DRAFT (src/lib/hooks/down-payment.hook.ts:639-669; src/lib/sales/invoice-threshold.ts:51-54). Sisa OPEN bukan basis: reversal DP sesudah konversi (ADR-003) |

## 5. Finance — `FIN-BR-*`

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| FIN-BR-001 | Sebagian | prisma/schema.prisma:2309 — hutang bertumpu pada `VendorBill`; validasi sumber bill belum ditelusur |
| FIN-BR-002 | Sebagian | prisma/schema.prisma:1721 — piutang bertumpu pada `SalesInvoice`; syarat posted belum ditelusur |
| FIN-BR-003 | Terpasang | prisma/schema.prisma:2309 — `VendorBill` berbeda entitas dari `prisma/schema.prisma:2397` — `VendorPayment` |
| FIN-BR-004 | Sebagian | prisma/schema.prisma:2448 — alokasi multi-bill eksplisit di pembelian; penjualan menaut langsung lewat `prisma/schema.prisma:1986`, jadi pola alokasi tidak simetris |
| FIN-BR-005 | Sebagian | prisma/schema.prisma:2448 — dasar perhitungan outstanding ada; rumusnya belum ditelusur |
| FIN-BR-006 | Belum | belum ditelusur — status lunas dan toleransi pembulatan tidak ditunjuk di sini |
| FIN-BR-007 | Sebagian | prisma/schema.prisma:1981 — `SalesPayment` ada; isolasi pembayaran draft/gagal belum ditelusur |
| FIN-BR-008 | Belum | belum ditelusur — reversal pembayaran dengan histori asal tidak ditunjuk di sini |
| FIN-BR-009 | Belum | belum ditelusur — laporan aging hutang/piutang tidak ditunjuk di sini (aging WIP di laporan lain bukan bukti aging AP/AR) |
| FIN-BR-010 | OPEN-keputusan | Keputusan scope double-entry terbuka di sumber. Fakta repo: jurnal double-entry ada — `prisma/schema.prisma:4221` (`Journal`) dan `prisma/schema.prisma:4254` (`JournalEntry`). Keberadaan jurnal bukan penutupan keputusan scope/laporan formal |

## 6. Projects & Work Orders — `PROJ-BR-*`, `WO-BR-*`

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| PROJ-BR-001 | Sebagian | prisma/schema.prisma:2763 — `MaterialIssue` ada; kewajiban referensi project/work order per issue belum ditelusur per field |
| PROJ-BR-002 | Sebagian | prisma/schema.prisma:2763 — issue dimodelkan tersendiri dari `StockMove` (`prisma/schema.prisma:2498`); larangan direct update saldo oleh modul proyek belum ditelusur |
| PROJ-BR-003 | Sebagian | prisma/schema.prisma:3870 — `Remnant` untuk sisa terklasifikasi; verifikasi return proyek belum ditelusur |
| PROJ-BR-004 | Belum | belum ditelusur — pemisahan tampilan estimasi vs biaya aktual proyek tidak ditunjuk di sini |
| PROJ-BR-005 | Sebagian | prisma/schema.prisma:5174 — `Project` ada; ketertelusuran biaya aktual ke transaksi sumber belum ditelusur |
| PROJ-BR-006 | Sebagian | prisma/schema.prisma:5927 — `JobChangeOrder` ada untuk perubahan scope; approval/historinya belum ditelusur |
| PROJ-BR-007 | Belum | belum ditelusur — penutupan proyek dan pelestarian histori tidak ditunjuk di sini |
| PROJ-BR-008 | OPEN-keputusan | Keputusan margin/overhead/tenaga kerja/pengakuan biaya terbuka di sumber |
| WO-BR-001 | Sebagian | prisma/schema.prisma:3309 — `WorkOrderItem` ada sebagai baris work order; ketiadaan efek stok material rencana belum dibuktikan negatif di sini |
| WO-BR-002 | Sebagian | prisma/schema.prisma:2763 — `MaterialIssue` adalah jalur issue aktual; posting pengurangan stoknya belum ditelusur |
| WO-BR-003 | Sebagian | prisma/schema.prisma:3809 — `OvertimeRequest` ada; rantai approval jam kerja ke costing/payroll belum ditelusur |
| WO-BR-004 | Belum | belum ditelusur — guard anti issue ganda tidak ditunjuk di sini |

## 7. HR & Payroll — `HR-BR-*`

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| HR-BR-001 | Sebagian | prisma/schema.prisma:3958 — `Payroll` ada; pengikatan periode eksplisit per baris belum ditelusur |
| HR-BR-002 | Sebagian | prisma/schema.prisma:3958 — `Payroll` ada; pemisahan draft vs pembayaran final belum ditelusur |
| HR-BR-003 | OPEN-keputusan | Keputusan formula lembur/tarif/pembulatan terbuka di sumber. Layanan statutori ada (`src/lib/services/payroll-statutory.service.ts`), tetapi baris penegak formula tidak ditunjuk di indeks ini |
| HR-BR-004 | Sebagian | prisma/schema.prisma:4166 — `EmployeeLoan` ada; batas potongan terhadap saldo/policy belum ditelusur |
| HR-BR-005 | Belum | belum ditelusur — koreksi payroll posted yang dapat diaudit tidak ditunjuk di sini |
| HR-BR-006 | Sebagian | src/app/api/payroll/late-penalty/route.ts:18 — route data payroll dibatasi ke pengguna berwenang; cakupan semua akses payroll belum diaudit |
| HR-BR-007 | Sebagian | prisma/schema.prisma:3546 — `LeaveRequest` ada; kelengkapan pemohon/approver/periode/status belum ditelusur per field |
| HR-BR-008 | Sebagian | prisma/schema.prisma:4066 — `PayrollComponentLine` merinci komponen payroll; ketertelusuran ke sumber perhitungan belum ditelusur |

## 8. Acceptance — Global `AC-GL-*`

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| AC-GL-001 | Sebagian | prisma/schema.prisma:2511 — status `draft` pada `StockMove`; test penerimaan draft-isolation tidak ditunjuk di sini |
| AC-GL-002 | Sebagian | src/app/api/cron/asset-depreciation/route.ts:287 — contoh transaksi atomik; bukti rollback semua posting belum ditelusur |
| AC-GL-003 | Sebagian | src/lib/services/financial-idempotency.service.ts:1 — kontrak retry finansial; cakupan di luar scope finansial terdaftar belum terbukti |
| AC-GL-004 | Terpasang | src/lib/auth/permissions.ts:21 — `requirePermission()` di backend |
| AC-GL-005 | Belum | belum ditelusur — koreksi terkontrol transaksi posted beserta auditnya tidak ditunjuk di sini |
| AC-GL-006 | Terpasang | prisma/schema.prisma:1990 — field uang `Decimal @db.Decimal(15, 2)` |

## 9. Acceptance — Inventory `AC-INV-*`

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| AC-INV-001 | Sebagian | src/lib/hooks/goods-receipt.hook.ts:18 — movement dibuat saat receipt terverifikasi, bukan saat draft; test draft-receipt tidak ditunjuk di sini |
| AC-INV-002 | Sebagian | prisma/schema.prisma:2498 — `StockMove` adalah catatan movement; jaminan tepat-satu-kali belum dibuktikan di indeks ini |
| AC-INV-003 | Sebagian | src/actions/sales.actions.ts:1248 — hook posting faktur terpanggil; pengurangan tepat satu kali belum dibuktikan di indeks ini |
| AC-INV-004 | Sebagian | prisma/schema.prisma:2674 — `InventoryTransfer` ada; atomisitas transfer belum ditelusur |
| AC-INV-005 | Sebagian | prisma/schema.prisma:2560 — `StockAdjustment` ada; gate approval sebelum efek saldo belum ditelusur |
| AC-INV-006 | Sebagian | prisma/schema.prisma:2560 — `StockAdjustment` ada; pencatatan alasan/approver/aktor/ledger belum ditelusur per field |
| AC-INV-007 | OPEN-keputusan | Mengikuti INV-BR-007: policy negative stock dan konkurensinya belum diputuskan di sumber |
| AC-INV-008 | Sebagian | prisma/schema.prisma:3870 — `Remnant`; pembeda scrap: `src/lib/services/scrap-classification.ts:8` |
| AC-INV-009 | Sebagian | prisma/schema.prisma:2513 — `StockMove.referenceType`/`referenceId` ke dokumen sumber |

## 10. Acceptance — Purchasing `AC-PUR-*`

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| AC-PUR-001 | Sebagian | src/lib/hooks/purchase-order.hook.ts:11 — hook PO tidak membuat movement; bukti negatif menyeluruh belum ditelusur |
| AC-PUR-002 | Sebagian | prisma/schema.prisma:2228 — `GoodsReceiptItem`; tampilan parsial belum ditelusur |
| AC-PUR-003 | Terpasang | prisma/schema.prisma:2309 — `VendorBill` terpisah dari `prisma/schema.prisma:2397` — `VendorPayment` |
| AC-PUR-004 | Sebagian | prisma/schema.prisma:2448 — alokasi pembayaran parsial dimodelkan eksplisit |
| AC-PUR-005 | Sebagian | src/lib/services/financial-idempotency.service.ts:1 — mekanisme anti duplikasi finansial; penerapannya ke supplier payment belum ditelusur |
| AC-PUR-006 | Sebagian | prisma/schema.prisma:2130 — rantai model PO (`PurchaseOrder`) ke receipt/bill/payment adalah model terpisah; laporan ketertelusurannya belum ditelusur |

## 11. Acceptance — Sales `AC-SAL-*`

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| AC-SAL-001 | Sebagian | prisma/schema.prisma:1503 — `Quotation` dokumen tersendiri; bukti tidak berpengaruh ke saldo posted belum ditelusur negatif |
| AC-SAL-002 | Sebagian | src/lib/hooks/down-payment.hook.ts:639-646 — hanya DP `CONFIRMED` dihitung terhadap ambang persen kategori pelanggan tersnapshot pada quotation (bawaan aman 50% bila snapshot tak sah); DP draft/gagal tidak dihitung |
| AC-SAL-003 | Sebagian | src/lib/hooks/down-payment.hook.ts:639-669 — DP posted mencapai ambang snapshot kategori pelanggan per quotation (50% hanya fallback fail-closed) memicu satu faktur penuh DRAFT; reversal DP pasca-konversi tetap OPEN di ADR-003, jadi belum dapat diklaim lulus penuh |
| AC-SAL-004 | Sebagian | src/actions/sales.actions.ts:1248 — hook posting faktur; pembatasan hanya baris stock belum ditelusur |
| AC-SAL-005 | Sebagian | prisma/schema.prisma:1986 — pembayaran tertaut ke faktur; kebenaran outstanding parsial/penuh belum ditelusur |
| AC-SAL-006 | Sebagian | prisma/schema.prisma:2021 — `SalesReturn` ada; pelestarian histori invoice asal belum ditelusur |

## 12. Acceptance — Projects, Work Orders, Finance, HR, Reporting

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| AC-PROJ-001 | Sebagian | prisma/schema.prisma:2763 — `MaterialIssue` ada; kewajiban referensi project/work order belum ditelusur |
| AC-PROJ-002 | Sebagian | prisma/schema.prisma:2763 — issue lewat model inventory tersendiri; larangan direct update belum ditelusur |
| AC-PROJ-003 | Belum | belum ditelusur — tampilan terpisah estimasi vs aktual tidak ditunjuk di sini |
| AC-PROJ-004 | Sebagian | prisma/schema.prisma:5174 — `Project` ada; ketertelusuran biaya ke sumber belum ditelusur |
| AC-WO-001 | Sebagian | prisma/schema.prisma:3309 — `WorkOrderItem`; ketiadaan efek stok rencana belum dibuktikan negatif di sini |
| AC-WO-002 | Sebagian | prisma/schema.prisma:2763 — `MaterialIssue` mencatat issue aktual; pencatatan ganda inventory+project belum ditelusur |
| AC-WO-003 | Sebagian | prisma/schema.prisma:3809 — `OvertimeRequest`; approval policy jam kerja belum ditelusur |
| AC-FIN-001 | Sebagian | prisma/schema.prisma:2448 — ketertelusuran hutang lewat alokasi; sisi piutang tertaut lewat `prisma/schema.prisma:1986` |
| AC-FIN-002 | Belum | belum ditelusur — reversal beralasan dengan histori asal tidak ditunjuk di sini |
| AC-HR-001 | Sebagian | prisma/schema.prisma:4066 — `PayrollComponentLine` merinci komponen payroll |
| AC-HR-002 | Belum | belum ditelusur — guard anti posting payroll ganda tidak ditunjuk di sini |
| AC-HR-003 | Sebagian | prisma/schema.prisma:4166 — `EmployeeLoan`; penegakan batas potongan belum ditelusur |
| AC-HR-004 | Sebagian | src/app/api/payroll/late-penalty/route.ts:18 — pembatasan akses data turunan payroll; cakupan semua payroll belum diaudit |
| AC-REP-001 | Belum | belum ditelusur — kesesuaian total report dengan definisi query sumber tidak ditunjuk per laporan di sini |
| AC-REP-002 | Sebagian | .github/workflows/ci.yml:25 — CI berjalan `TZ=Asia/Jakarta`; konsistensi timezone semua filter report belum ditelusur |
| AC-REP-003 | Sebagian | src/components/reports/export-buttons.tsx:83 — export memakai `jspdf`; kelengkapan judul/periode/waktu WIB/identitas perusahaan belum ditelusur |
| AC-REP-004 | Sebagian | src/lib/auth/permissions.ts:21 — permission backend tersedia; permission khusus export per laporan belum ditelusur |

## Penutup

Indeks ini sengaja berhenti pada satu bukti per ID. Pendalaman
berikutnya per ID — membaca penegak penuh, test yang membuktikannya,
dan status acceptance — adalah pekerjaan audit terpisah dan tidak
boleh disimpulkan dari tabel ini. Bila baris di atas bertentangan
dengan kode terbaru, kode dan test yang berjalan menang; perbarui
indeks ini pada PR yang sama.
