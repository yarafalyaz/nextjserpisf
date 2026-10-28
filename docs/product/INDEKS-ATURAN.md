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
| GL-BR-003 | Sebagian | src/actions/sales.actions.ts:3972 — `deleteSalesReturn` hapus fisik hanya-draf + `FOR UPDATE` dalam tx (GL003-P8, #1353); update draft-only; void/counter jalur posted milik P3/P5/P6 (t_4fdc4709 running) |
| GL-BR-004 | Sebagian | src/lib/services/financial-idempotency.service.ts:1 — kontrak idempotency finansial persisten; cakupan scope-nya terbatas pada daftar di file yang sama |
| GL-BR-005 | Sebagian | src/lib/services/activity-log.service.ts:10 — `logActivity`; model audit `prisma/schema.prisma:5473` (`ActivityLog`) |
| GL-BR-006 | Terpasang | src/lib/auth/permissions.ts:21 — `requirePermission()` memeriksa permission di backend |
| GL-BR-007 | Sebagian | prisma/schema.prisma:2501 — `StockMove.documentNo` unik; penomoran dokumen lain memakai `src/lib/services/document-sequence.service.ts` (belum ditelusur per dokumen) |
| GL-BR-008 | Terpasang | prisma/schema.prisma:1990 — `SalesPayment.amount` `Decimal @db.Decimal(15, 2)`; pola Decimal yang sama dipakai field uang di skema |
| GL-BR-009 | Sebagian | `src/app/(dashboard)/pengaturan/ubah/_components/settings-edit-form.tsx` — auto-map 39 kunci aturan kini punya input + setter; penjaga regresi `settings-edit-form-akun-yatim.test.tsx` (setiap kunci `ACCOUNT_MAPPING_FIELDS` wajib punya input, plus falsifikasi setter auto-map). Temuan audit 28 Okt 2026: 5 kunci (`customerDownPaymentAccountId`, `warrantyExpenseAccountId`, `warrantyProvisionAccountId`, `supplierClaimReceivableAccountId`, `reimbursementLiabilityAccountId`) dibuang tanpa jejak karena tidak ada input/setter di form — bertentangan dengan aturan ini; jalur simpan kelima kunci dibuka backend (`src/actions/settings.actions.ts`, `src/lib/validations/settings.schemas.ts` — PR Backend #1263) sehingga mapping yang dipilih/auto-map ikut tersimpan |

## 2. Inventory — `INV-BR-*`

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| INV-BR-001 | Sebagian | src/actions/sales.actions.ts:1248 — `onSalesInvoicePosted(...)` dipanggil dalam alur posting faktur; pengurangan stok per baris belum ditelusur baris per baris |
| INV-BR-002 | Sebagian | prisma/schema.prisma:3843 — `StocktakeSession` ada; alur approval adjustment-nya belum ditelusur |
| INV-BR-003 | Sebagian | prisma/schema.prisma:3870 — model `Remnant` ada |
| INV-BR-004 | Sebagian | src/lib/services/scrap-classification.ts:55-77 — klasifikasi scrap memakai cost aktual baris (fifo-lapisan atau average, vonis F-2026-10-28-148-V) |
| INV-BR-005 | Sebagian | prisma/schema.prisma:2513 — `StockMove.referenceType`/`referenceId` menautkan movement ke dokumen sumber |
| INV-BR-006 | Sebagian | src/lib/services/inventory-fifo.ts:91,168,219,263,284-285 — cabang fifo/average via resolver tunggal, bawaan = fifo (vonis F-2026-10-28-148-V) |
| INV-BR-007 | Sebagian | Keputusan bisnis OPEN di sumber (BUSINESS-RULES.md): garpu "pengecualian disetujui eksplisit" belum diputus — tidak ada saklar override/approval stok negatif di kode (grep allowShortfall:true=0 produksi, grep schema/settings negatif-override=0). Fakta penegakan berjalan: guard terpusat `src/lib/services/inventory-fifo.ts:109,185-197` (allowShortfall default false, throw Stok tidak mencukupi); semua jalur keluar memakai default/false: penjualan `src/lib/hooks/accounting.hook.ts:665,758-767,827`, retur pembelian `src/lib/hooks/purchase-return.hook.ts:147,185-188`, material issue `src/lib/hooks/material-issue.hook.ts:158`, transfer `src/lib/hooks/inventory-transfer.hook.ts:111`, produksi `src/actions/manufacturing.actions.ts:990`, penyesuaian `src/lib/hooks/stock-adjustment.hook.ts:127`; period-close hanya lapor warn `src/lib/settings/period-close.ts:131-135`; regresi `src/lib/services/__tests__/inventory-fifo.test.ts:273-301`. Lihat vonis Business F-2026-10-28-115-V (backlog) + ADR-005 §3 |
| INV-BR-008 | Sebagian | prisma/schema.prisma:2674 — model `InventoryTransfer` ada; atomisitas asal/tujuan belum ditelusur |
| INV-BR-009 | Sebagian | prisma/schema.prisma:2511 — status `draft` adalah status awal `StockMove`; perilaku gagal posting per modul belum diaudit |
| INV-BR-010 | Terpasang | Koreksi stok posted hanya lewat 3 jalur terdokumentasi, semua bergate status/izin SEBELUM efek saldo+ledger dan atomik satu tx (gagal = rollback penuh): (1) Adjustment — `processStockAdjustment` (inventory.actions.ts:364-372,394-514): wajib `draft` + `assertApproved("StockAdjustment")` (approval-workflow.service.ts:58; tanpa workflow terkonfigurasi = no-op mundur-kompatibel, pending/rejected = tolak) -> klaim atomik `draft->processing` -> hook `stock-adjustment.hook.ts:39-50` (guard movement existing + status processed/cancelled no-op, kunci baris FOR UPDATE) membuat StockMove `posted` + jurnal `stockJournalService.onStockAdjustment` + status `processed`; gagal tx -> klaim dipulihkan ke `draft` (inventory.actions.limbo.test.ts). (2) Retur pembelian — `processPurchaseReturn` (purchase.actions.ts:1993-2041): izin `approve_purchase_returns` + wajib `draft`, hook stok OUT FIFO (purchase-return.hook.ts:90-112: movement existing/returned no-op) + jurnal GL `accounting.hook onPurchaseReturnProcessed` dalam SATU `$transaction`. (3) Retur penjualan — `completeSalesReturn` (sales.actions.ts:2091-2155): izin `approve_sales_returns` + SoD (penyelesai != pembuat) + wajib `draft`, hook stok IN (sales-return.hook.ts:72-86: movement existing/completed/cancelled no-op) + jurnal GL dalam SATU `$transaction`. Adjustment/retur posted TIDAK bisa diedit/dihapus: update/delete guard `draft`-only (inventory.actions.ts:1852-1875,1969-1995; purchase.actions.ts:3083-3100,3322-3345; sales.actions.ts:3333-3355,3785-3800). Reversal jurnal murni GL (tanpa gerakan stok) = `reverseJournal` finance.actions.ts:2146 (klaim POSTED->REVERSING satu tx). Audit: `logActivity` process/complete/delete di tiap action + StockMove/Journal ber-`referenceType/referenceId` + `createdBy`. Regresi P0 skenario 6-7: `stock-posted-correction-gate.test.ts` (4 test: adjustment cancelled no-op, adjustment approved -> move posted+jurnal+processed, purchase return returned no-op, sales return cancelled no-op) + `stock-move-double-posting.test.ts` + `stock-adjustment-baseline.test.ts`. TIDAK ADA jalur reversal StockMove langsung / cancel dokumen posted / edit-hapus dokumen posted — koreksi posted wajib dokumen koreksi baru (retur/adjustment) atau reversal jurnal. |
| INV-BR-011 | Sebagian | prisma/schema.prisma:2560 — `StockAdjustment` ada; kelengkapan alasan/approver/waktu belum ditelusur per field |
| INV-BR-012 | Terpasang | Semua jalur posting StockMove punya guard `(referenceType, referenceId)` -> no-op di dalam transaksi: goods-receipt.hook.ts:42-48, sales-return.hook.ts:72-78, inventory-transfer.hook.ts:62-69 (OUT) + :490 (IN; terima parsial per kejadian dilindungi `InventoryTransferReceipt.idempotencyKey` unik), stock-adjustment.hook.ts:39-45, material-issue.hook.ts:83-91, purchase-return.hook.ts:90-96, accounting.hook.ts:440-450 (`onSalesInvoicePosted`: OUT `status:posted`). Enam hook dokumen mengunci baris dokumen `FOR UPDATE` sebelum cek (goods_receipts/sales_returns/inventory_transfers/stock_adjustments/material_issues/purchase_returns); faktur penjualan dilindungi klaim atomik `updateMany status in [draft, approved]` di sales.actions.ts sebelum hook. Regresi perilaku: `stock-move-double-posting.test.ts` (4 jalur yang belum teruji: material-issue/purchase-return/sales-return/stock-adjustment) + goods-receipt-over-receipt.test.ts + inventory-transfer-aggregation.test.ts + accounting-hook.test.ts. Pengecualian sah: `issueMaterial`/`completeProductionOrder` di manufacturing.actions.ts = kejadian parsial berulang per perintah produksi (bukan posting ulang dokumen yang sama), dilindungi kunci baris order + status/qty. Tidak ada unique DB di `(referenceType, referenceId)` StockMove karena satu dokumen sah membuat banyak movement (per item/impact/kejadian parsial). |
| INV-BR-013 | Terpasang | src/actions/purchase.actions.ts:2321 — `deleteGoodsReceipt` menolak GR non-draft (GR terverifikasi memposting `StockMove` posted di src/lib/hooks/goods-receipt.hook.ts:424); `deletePurchaseOrder` menolak PO non-draft (:2108) dan PO ber-GR non-draft (:2120), sehingga ledger posted tidak terhapus fisik; jalur koreksinya retur pembelian. Pola sama: `deleteStockAdjustment`/`deleteInventoryTransfer`/`deleteMaterialIssue` hanya draft. Dikunci test `INV-BR-013 larangan hapus ledger posted` dan `PUR-BR-010 larangan hapus fisik dokumen pembelian posted` di src/actions/__tests__/purchase.actions.test.ts |
| INV-BR-014 | Sebagian | prisma/schema.prisma:2763 — `MaterialIssue` ada sebagai referensi pemakaian material |
| INV-BR-015 | Sebagian | prisma/schema.prisma:3870 — `Remnant`; klasifikasi return reusable/remnant/scrap: `src/lib/services/scrap-classification.ts:8`, alur return-nya belum ditelusur |

## 3. Purchasing — `PUR-BR-*`

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| PUR-BR-001 | Sebagian | src/lib/hooks/goods-receipt.hook.ts:18 — hook goods receipt membuat Stock Move IN saat verifikasi |
| PUR-BR-002 | Sebagian | src/lib/hooks/purchase-order.hook.ts:11 — `onPurchaseOrderCreated` hanya memperbarui status purchase request; ketiadaan efek stok PO tidak dibuktikan hanya dari hook ini |
| PUR-BR-003 | Sebagian | prisma/schema.prisma:2228 — `GoodsReceiptItem`; tampilan dipesan/diterima/sisa belum ditelusur |
| PUR-BR-004 | Sebagian | Penegakan qty tertutup-terverifikasi: guard keras `src/lib/hooks/goods-receipt.hook.ts:206-236` (kumulatif satuan dasar per item, `received > ordered` → throw, hard cap tanpa toleransi, kunci PO `FOR UPDATE`); draft boleh lebih, penegakan hanya di verify (`src/actions/purchase.actions.ts:1101`); PO dikunci sesudah terima berjalan (edit draft-only `:2690`, cancel tolak partial/received `:1005`, hapus GR verified tertahan tagihan `:2290`); regresi 24/24 + received-qty absolut. Vonis Accountant F-2026-10-28-116-V (backlog): garpu "kecuali kebijakan/approval" TERTUTUP DENGAN NILAI TOLAK; toleransi nilai 3-way (max Rp1000/1%) sah untuk nilai, bukan qty. Sisa = alur revisi PO approved (workflow, bukan toleransi) |
| PUR-BR-005 | Terpasang | prisma/schema.prisma:2309 — `VendorBill` terpisah dari `prisma/schema.prisma:2397` — `VendorPayment` |
| PUR-BR-006 | Sebagian | prisma/schema.prisma:2448 — `VendorPaymentAllocation` menautkan pembayaran ke bill dengan amount alokasi |
| PUR-BR-007 | Sebagian | prisma/schema.prisma:2448 — alokasi ada; perhitungan outstanding/status lunas belum ditelusur |
| PUR-BR-008 | Sebagian | Kebijakan kapitalisasi TERTUTUP-terverifikasi oleh vonis Accountant F-2026-10-28-125-V (backlog): landed cost (ongkir/handling/bea/asuransi pengangkutan) = biaya perolehan persediaan, wajib didebit ke akun persediaan bertipe aset — bukan akun beban; biaya admin bank = beban periode (tidak masuk unit cost/FIFO layer); alokasi berbasis nilai beli neto baris, bobot hanya baris barang, pembulatan 2dp dengan drift ke baris terbesar. Cacat terbukti hari ini: `src/lib/utils/account-automap.ts:186-187` memetakan `purchaseShippingAccountId`→`600014` (EXPS) dan `purchaseAdminFeeAccountId`→`720002` (OEXP) sehingga `stock-journal.service.ts:174-221` mendebit akun beban untuk biaya yang sudah masuk layer (`goods-receipt.hook.ts:391,434`), admin ikut dikapitalisasi, dan baris jasa menyerap bobot lalu porsinya hilang (`:300-311` vs `:395-397`). Sisa = bentuk fisik akun split + true-up residu pool (lane Backend), bukan keputusan policy |
| PUR-BR-009 | Sebagian | prisma/schema.prisma:2254 — `PurchaseReturn` ada; efek stok/finansial return belum ditelusur |
| PUR-BR-010 | Terpasang | src/actions/purchase.actions.ts:2108 — `deletePurchaseOrder` hanya mengizinkan PO draft (guard status + guard GR: PO ber-GR non-draft ditolak :2120) sehingga PO posted yang belum/tidak ber-GR tidak lagi terhapus fisik; jalur koreksinya `cancelPurchaseOrder`. `deleteGoodsReceipt` :2320 menolak GR non-draft (GR terverifikasi memposting `StockMove` posted di src/lib/hooks/goods-receipt.hook.ts). Sudah terpasang lebih dulu di main: `deleteVendorBill` :2577 dan `deleteVendorPayment` :2623 menolak non-draft dari baca ulang SESUDAH kunci baris di dalam transaksi, `deletePurchaseReturn` :3380 menolak retur non-draft. Regresi: describe `PUR-BR-010 larangan hapus fisik dokumen pembelian posted` (9 test, 5 jalur) di src/actions/__tests__/purchase.actions.test.ts. |
| PUR-BR-011 | Terpasang | prisma/schema.prisma:2448 — tabel alokasi `VendorPaymentAllocation` eksplisit untuk pembayaran supplier |
| PUR-BR-012 | Sebagian | prisma/schema.prisma:2309 — dokumen PO/receipt/bill/payment adalah model terpisah; laporan pembedanya belum ditelusur |

## 4. Sales — `SAL-BR-*`

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| SAL-BR-001 | Sebagian | prisma/schema.prisma:1503 — `Quotation` adalah dokumen tersendiri; ketiadaan efek stok/piutang belum dibuktikan negatif di sini |
| SAL-BR-002 | Sebagian | prisma/schema.prisma:1629 — `DownPayment.status` default `pending`; perhitungan ambang hanya dari DP terkonfirmasi belum ditelusur per baris |
| SAL-BR-003 | Sebagian | src/actions/sales.actions.ts:1248 — hook posting faktur terpanggil; seleksi baris stock-item belum ditelusur |
| SAL-BR-004 | Tertutup-terverifikasi (sisa OPEN: reversal DP pasca-konversi) | Model akunting DP ditentukan kode: konfirmasi memanggil `onDownPaymentReceived` lalu `onDownPaymentConfirmed` dalam satu transaksi (`src/actions/sales.actions.ts:980-981`); jurnal terima `POSTED` Dr kas/bank / Cr kewajiban Uang Muka Penjualan 210102 (neto PPN + Cr 210201 bila terutang) lewat `src/lib/hooks/accounting.hook.ts:2498-2519` + `src/lib/tax/down-payment-vat.ts:261-278`, fail-closed bila akun belum terkonfigurasi (`src/lib/hooks/accounting.hook.ts:2382-2387`); alokasi reklas Dr 210102 / Cr Piutang tanpa kas kedua (`src/lib/hooks/down-payment.hook.ts:756-775`). Sisa OPEN tunggal: reversal DP pasca-konversi (ADR-003). Audit 28 Okt 2026: akun `customerDownPaymentAccountId` (210102) sebelumnya hanya terbaca hook tanpa field UI; kini dapat diisi/di-auto-map di form Pengaturan -> Akuntansi seksi Penjualan (`settings-edit-form.tsx`), dites `settings-edit-form-akun-yatim.test.tsx` |
| SAL-BR-005 | Sebagian | src/lib/hooks/down-payment.hook.ts:639-646 — ambang = persen kategori pelanggan tersnapshot per quotation (`Quotation.invoiceThresholdPercent` dari `CustomerCategory.downPaymentPercent`, ditulis di src/actions/sales.actions.ts:261); 50% hanya fallback fail-closed bawaan bila snapshot tak sah (src/lib/sales/invoice-threshold.ts:17,38-49). Cara baca: jangan baca 50% sebagai ambang tetap |
| SAL-BR-006 | Sebagian | src/lib/hooks/down-payment.hook.ts:45 — `onDownPaymentConfirmed` adalah titik konfirmasi DP; syarat posted untuk ambang belum ditelusur per baris |
| SAL-BR-007 | Sebagian | src/lib/sales/invoice-threshold.ts:1 — catatan desain ambang DP→invoice dan penjaga di hook; idempotensi konversi belum dibuktikan test di indeks ini |
| SAL-BR-008 | Sebagian | prisma/schema.prisma:1623 — `DownPayment.quotationId` menautkan DP ke quotation; referensi invoice hasil ke pembayaran pemicu belum ditelusur |
| SAL-BR-009 | Belum | belum ditelusur — proses koreksi terkontrol khusus faktur posted tidak ditunjuk di sini |
| SAL-BR-010 | Sebagian | prisma/schema.prisma:1986 — `SalesPayment.salesInvoiceId` menautkan pembayaran langsung ke faktur; tidak ada model alokasi penjualan terpisah |
| SAL-BR-011 | Sebagian | prisma/schema.prisma:1981 — `SalesPayment` ada; perhitungan outstanding/status lunas belum ditelusur |
| SAL-BR-012 | Sebagian | prisma/schema.prisma:2021 — `SalesReturn` ada; pelestarian histori faktur asal belum ditelusur |
| SAL-BR-013 | Sebagian | Penjaganya `Item.isProduct`, bukan `isService`: baris ber-item non-produk dilewati di src/lib/hooks/accounting.hook.ts:790 dan guard ketersediaan stok melewatinya (src/lib/hooks/accounting.hook.ts:673-773); baris tanpa `itemId` gugur lebih dulu (src/lib/hooks/accounting.hook.ts:624). Sisa OPEN: retur jasa/non-stok tetap melahirkan StockMove IN + qty_on_hand naik (src/lib/hooks/sales-return.hook.ts:151,169), kombinasi isService+isProduct belum ditolak server (src/actions/master.actions.ts:575 hanya menjaga scrap), dan pemisahan akun/PPN/PPh jasa menunggu vonis Accountant F-2026-10-28-137-V (merged di main). Spec F-2026-10-28-134-S di ekor docs/erp-research-backlog.md |
| SAL-BR-014 | Terpasang | Guard tepat-satu-kali terpusat `src/lib/services/stock-out-once.service.ts` (`assertSalesInvoiceStockOutOnce`/`assertMaterialIssueStockOutOnce`/`findStockOutConflicts`): pohon quotation sama (faktur via quotationId/SO/project-contract; MI via WO/project-contract) + item sama + StockMove OUT posted jalur lawan > 0 = throw fail-closed sebelum stok bergerak. Dipanggil `onSalesInvoicePosted` (`src/lib/hooks/accounting.hook.ts`) dan `onMaterialIssueCompleted` (`src/lib/hooks/material-issue.hook.ts`) di dalam tx masing-masing; move `reversed` tidak dihitung (pengeluaran pengganti sah). SERIALISASI BERSAMA (syarat lepas QA DITAHAN): kedua jalur mengunci baris `quotations` pohon (`FOR UPDATE`, `ORDER BY id`, `lockStockOutQuotationsTx`) SEBELUM guard, lalu guard membaca move lawan sebagai locking read `FOR UPDATE` (`postedOutByItem`) — current read, bukan snapshot REPEATABLE READ. Skenario asal: quotation sama melahirkan WO+MI dan faktur konversi DP atas item fisik sama. Tes: `src/lib/services/__tests__/stock-out-once.service.test.ts` (urutan kunci→guard) + `src/lib/hooks/__tests__/material-issue-stock-out-once.test.ts` + regresi konkuren DB nyata `src/lib/services/__tests__/inventory-integration.test.ts` (dua posting beda dokumen pohon sama stok cukup → tepat satu pengeluaran; dua konsumen rebut unit terakhir → satu ditolak "Stok tidak mencukupi") |
| SAL-BR-015 | Sebagian | Basis tertutup-terverifikasi: ambang dari `grandTotal` quotation, faktur penuh lahir DRAFT (src/lib/hooks/down-payment.hook.ts:639-669; src/lib/sales/invoice-threshold.ts:51-54). Sisa OPEN bukan basis: reversal DP sesudah konversi (ADR-003) |

## 5. Finance — `FIN-BR-*`

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| FIN-BR-001 | Sebagian | prisma/schema.prisma:2309 — hutang bertumpu pada `VendorBill`; validasi sumber bill belum ditelusur |
| FIN-BR-002 | Sebagian | prisma/schema.prisma:1721 — piutang bertumpu pada `SalesInvoice`; syarat posted belum ditelusur |
| FIN-BR-003 | Terpasang | prisma/schema.prisma:2309 — `VendorBill` berbeda entitas dari `prisma/schema.prisma:2397` — `VendorPayment` |
| FIN-BR-004 | Sebagian | prisma/schema.prisma:2448 — alokasi multi-bill eksplisit di pembelian; penjualan menaut langsung lewat `prisma/schema.prisma:1986`, jadi pola alokasi tidak simetris |
| FIN-BR-005 | Sebagian | prisma/schema.prisma:2448 — dasar perhitungan outstanding ada; rumusnya belum ditelusur |
| FIN-BR-006 | Terpasang | src/lib/finance/settlement-status.ts — `SETTLEMENT_TOLERANCE_IDR = 1` (Rp1 pembulatan rupiah-penuh; hitung sen safeRound selalu eksak sesudah dibulatkan) dipakai `derivePaymentStatus`/`isSettled` di hook pembayaran penjualan, konfirmasi pembayaran vendor, retur (accounting hook), edit faktur, dan DP; lunas hanya dari outstanding alokasi/pembayaran valid (FIN-BR-007: alokasi hanya dari pembayaran `completed`, SalesPayment hanya lahir dari transaksi terkonfirmasi). Modul tidak menyentuh hitung uang/aging. Status lunas TAMPILAN tukar faktur (`src/lib/finance/invoice-exchange.ts`) kini memakai `isSettled` modul ini — ambang setengah sen lokal dihapus 2026-10-28 supaya satu faktur tidak lagi "Lunas" di layar faktur tetapi "Sebagian" di daftar/laporan tukar faktur. Cakupan yang SAMA diperluas ke seluruh laporan piutang: `COLLECTION_SETTLED_EPSILON` (0,005) dihapus dan antrean penagihan, statement pelanggan, terkirim-belum-ditagih, serta antrean tukar faktur lewat batas memakai `isOutstandingSettled()` (toleransi Rp1) — sisa <= Rp1 = lunas di SEMUA permukaan. Menggeser populasi hanya untuk sisa pembulatan Rp0,01–1,00; sisa > Rp1 tetap tampil sebagai piutang. |
| FIN-BR-007 | Sebagian | prisma/schema.prisma:1981 — `SalesPayment` ada; isolasi pembayaran draft/gagal belum ditelusur |
| FIN-BR-008 | Belum | belum ditelusur — reversal pembayaran dengan histori asal tidak ditunjuk di sini |
| FIN-BR-009 | Terpasang | FIN-BR-009-S2: sisa AP layar hutang-jatuh-tempo = NETO via `payableOutstanding` yang sama dengan loader PDF (`src/lib/reports/aging-amounts.ts`; halaman mengoper `withholdingAmount`, `src/app/(dashboard)/laporan/hutang-jatuh-tempo/page.tsx`; tes falsifikasi vendor bill ber-PPh di `src/components/reports/__tests__/aging-report-view.test.ts`). S4 keterbacaan (PR #1230): header ringkasan layar "Dokumen" (kolom hitung dokumen, bukan nominal; ekspor PDF tetap header "No. Dokumen" dan count di slot itu); cap waktu cetak sudah generik via `report-letterhead.tsx` footer cetak dan `src/app/api/pdf/route.ts` `printFooter`. |
| FIN-BR-010 | OPEN-keputusan | Keputusan scope double-entry terbuka di sumber. Fakta repo: jurnal double-entry ada — `prisma/schema.prisma:4221` (`Journal`) dan `prisma/schema.prisma:4254` (`JournalEntry`). Keberadaan jurnal bukan penutupan keputusan scope/laporan formal |
| FIN-BR-009 | Terpasang | FIN-BR-009-S2: sisa AP layar hutang-jatuh-tempo = NETO via `payableOutstanding` yang sama dengan loader PDF (`src/lib/reports/aging-amounts.ts`; halaman mengoper `withholdingAmount`, `src/app/(dashboard)/laporan/hutang-jatuh-tempo/page.tsx`; tes falsifikasi vendor bill ber-PPh di `src/components/reports/__tests__/aging-report-view.test.ts`) |
| FIN-BR-010 | Tertutup-terverifikasi | Scope double-entry tertutup oleh ADR-006 + vonis Accountant kartu t_9e202412 (28 Okt 2026, butir 1: TERTUTUP-terverifikasi; sisa hanya administratif dokumen ini). Bukti: `JournalService.createJournal` menolak jurnal tak balance/negatif/nol/debit+kredit sekaligus, status lahir `POSTED`, isolasi Serializable (`src/lib/services/journal.service.ts:57-71,73-84,100-140`); reversal jurnal lawan bertanggal asal + asal `REVERSED`, non-POSTED/lawan ganda ditolak (`src/lib/services/journal.service.ts:147-235`); `Journal`/`JournalEntry` Decimal(15,2), `journalNumber @unique`, `activeReferenceKey` unik (`prisma/schema.prisma:4221-4272`); period lock `assertPeriodOpen` dibaca `FOR UPDATE` dalam transaksi (`src/lib/services/period-lock.service.ts:20-47`); laporan formal (neraca, laba-rugi, neraca saldo, arus kas) hidup dari GL sama. Sejalan KEPUTUSAN-TERVERIFIKASI.md butir 6 (TERTUTUP-oleh-implementasi) |

## 6. Projects & Work Orders — `PROJ-BR-*`, `WO-BR-*`

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| PROJ-BR-001 | Sebagian | prisma/schema.prisma:2763 — `MaterialIssue` ada; kewajiban referensi project/work order per issue belum ditelusur per field |
| PROJ-BR-002 | Sebagian | prisma/schema.prisma:2763 — issue dimodelkan tersendiri dari `StockMove` (`prisma/schema.prisma:2498`); larangan direct update saldo oleh modul proyek belum ditelusur |
| PROJ-BR-003 | Sebagian | prisma/schema.prisma:3870 — `Remnant` untuk sisa terklasifikasi; verifikasi return proyek belum ditelusur |
| PROJ-BR-004 | Sebagian | src/components/reports/project-budget-card.tsx — RAB vs Realisasi terpisah label per proyek (estimasi `ProjectItem` ≠ aktual builder L/R); label tab rencana diperjelas + jejak id transaksi sumber di `project-pl-detail-card.tsx`; realisasi per tahap/kategori masih "Belum terukur" (sumber biaya tanpa kolom tahap) |
| PROJ-BR-005 | Sebagian | prisma/schema.prisma:5174 — `Project` ada; ketertelusuran biaya aktual ke transaksi sumber belum ditelusur |
| PROJ-BR-006 | Sebagian | prisma/schema.prisma:5927 — `JobChangeOrder` ada untuk perubahan scope; approval/historinya belum ditelusur |
| PROJ-BR-007 | Belum | belum ditelusur — penutupan proyek dan pelestarian histori tidak ditunjuk di sini |
| PROJ-BR-008 | OPEN-keputusan | Keputusan margin/overhead/tenaga kerja/pengakuan biaya terbuka di sumber |
| WO-BR-001 | Sebagian | prisma/schema.prisma:3309 — `WorkOrderItem` ada sebagai baris work order; ketiadaan efek stok material rencana belum dibuktikan negatif di sini |
| WO-BR-002 | Sebagian | prisma/schema.prisma:2763 — `MaterialIssue` adalah jalur issue aktual; posting pengurangan stoknya belum ditelusur |
| WO-BR-003 | Sebagian | prisma/schema.prisma:3809 — `OvertimeRequest` ada; rantai approval jam kerja ke costing/payroll belum ditelusur |
| WO-BR-004 | Sebagian | src/actions/manufacturing.actions.ts:1897-1905 — `createMaterialIssueFromWorkOrder` menolak MI kedua per WO (cek di dalam transaksi + kunci baris WO); UI detail WO menyembunyikan kedua tombol buat baru selama MI aktif (draf/diproses) ada dan menampilkan status aktifnya — `src/app/(dashboard)/produksi/perintah-kerja/[slug]/page.tsx`, `_components/work-order-actions.tsx`. Sisa: `createMaterialIssue` (form Inventaris) belum punya guard anti-ganda server setara (backend) |

## 7. HR & Payroll — `HR-BR-*`

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| HR-BR-001 | Sebagian | prisma/schema.prisma:3958 — `Payroll` ada; pengikatan periode eksplisit per baris belum ditelusur |
| HR-BR-002 | Sebagian | prisma/schema.prisma:3958 — `Payroll` ada; pemisahan draft vs pembayaran final belum ditelusur |
| HR-BR-003 | Sebagian | Formula/tarif/pembulatan TERTUTUP (vonis F-2026-10-25-014-V A1 + F-2026-10-25-022-V Putusan 3): upah sejam = upah sebulan/173, hari kerja 1,5x jam pertama lalu 2x, hari istirahat pola 5 hari 2x/3x/4x dan pola 6 hari 2x/3x/4x, pembulatan rupiah penuh hanya di ujung. Penegak: `src/lib/services/overtime-pay.service.ts:17-60` + batas 4 jam/hari & 18 jam/minggu `:96-138` dipakai create (`src/actions/hrm.actions.ts:1049`) dan update (`:4686`); dasar pokok + Σ tunjangan tetap aktif pada tanggal lembur + snapshot beku `src/actions/hrm.actions.ts:1152-1219`; masuk bruto slip `:1349,1385` (pratinjau) dan `:1874,2013` (tulis massal); regresi `src/lib/services/__tests__/overtime-pay.service.test.ts:11-57`. Parameter statutori tahun berjalan TERTUTUP oleh vonis F-2026-10-28-126-V: 10 key berperiode (tabel isi siap-seed), plafon JP Rp11.086.300 sejak 1 Mar 2026 (Rp10.547.400 Mar 2025-Feb 2026, Rp10.042.300 Mar 2024-Feb 2025), tarif 1%/2%/1% sebagai pecahan, PTKP 54jt/4,5jt/4,5jt, biaya jabatan 5% maks 6jt/tahun. FAKTA: `payroll_statutory_rules` kosong di seed (`grep prisma/seed.ts` = 0) sehingga gate `fromFallback` (`src/actions/hrm.actions.ts:794,1948,3057`) menolak semua hitung/approve payroll — menunggu baris ditanam. Sisa = master UMK/lantai upah + cabang 75% |
| HR-BR-004 | Sebagian | Batas potongan **TERPASANG**: cicilan dicap sisa utang `src/lib/reports/payroll-weekly.ts:173-178`, Σ pinjaman `active` `:180-196` (fail-closed campuran `:198-205`), cap permintaan klien `:207-215` + `src/actions/hrm.actions.ts:1299-1319`, plafon Pasal 63 ≤ 50% upah ditolak keras saat susun/ubah/bulk/bayar `src/actions/hrm.actions.ts:735-754,1419,2477-2487,3166-3181`; sisa hanya berubah lewat dokumen (`:3198-3231`, `:4804-4856`). Sisa OPEN: anggaran cicilan vs upah bersih, sisa pinjaman saat PHK, pelunasan di luar payroll — spec F-2026-10-28-131-S BR-LOAN-03/07/08 (basis baris `origin/main` c51f17f3e) |
| HR-BR-005 | Belum | TERVERIFIKASI-KODE: NOL jalur koreksi slip `paid` di main (`d6cf442ba` + `363826a5` sudah di main: gerbang terminal paid di `approveStep` E-HRCR-5 + saringan jurnal aktif `onPayrollPaid` E-HRCR-6); jalur koreksi teraudit = spec F-2026-10-28-133-S + vonis 135-V (jawaban §5.1, reversal penuh + slip koreksi) — status tetap Belum sampai implementasi merged + QA |
| HR-BR-006 | Sebagian | Baca: src/app/api/payroll/late-penalty/route.ts:18. Tulis (F-2026-10-28-128-S, AC-HRS-1..6): lima jalur tulis payroll menegakkan `getHrScope` + `assertHrEmployeeAccess` — processPayroll, populasi generateBulkPayroll, updatePayroll (baris lama DAN baru), approvePayroll, markPayrollPaid (src/actions/hrm.actions.ts); halaman/form payroll lain belum diaudit |
| HR-BR-007 | Sebagian | prisma/schema.prisma:3546 — `LeaveRequest` ada; kelengkapan pemohon/approver/periode/status belum ditelusur per field |
| HR-BR-008 | Sebagian | prisma/schema.prisma:4066 — `PayrollComponentLine` merinci komponen payroll; ketertelusuran ke sumber perhitungan belum ditelusur |

## 8. Acceptance — Global `AC-GL-*`

| ID | Status | Bukti paling relevan / catatan |
| --- | --- | --- |
| AC-GL-001 | Sebagian | prisma/schema.prisma:2511 — status `draft` pada `StockMove`; test penerimaan draft-isolation tidak ditunjuk di sini |
| AC-GL-002 | Sebagian | src/app/api/cron/asset-depreciation/route.ts:287 — contoh transaksi atomik; bukti rollback semua posting belum ditelusur |
| AC-GL-003 | Sebagian | src/lib/services/financial-idempotency.service.ts:1 — kontrak retry finansial; cakupan di luar scope finansial terdaftar belum terbukti |
| AC-GL-004 | Terpasang | src/lib/auth/permissions.ts:21 — `requirePermission()` di backend |
| AC-GL-005 | Sebagian | src/actions/sales.actions.ts:3972 — `deleteSalesReturn` tolak hapus non-draf + `FOR UPDATE` dalam tx + `logActivity delete` (GL003-P8, #1353); koreksi penuh posted (void/counter) milik P3/P5/P6 (t_4fdc4709 running) |
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
| AC-INV-007 | Sebagian | Mengikuti INV-BR-007: garpu override/approval belum diputus (tidak ada saklar di kode). Fakta penegakan: guard terpusat inventory-fifo.ts:109,185-197 + 6 jalur keluar default/false + period-close warn-only. Vonis Business F-2026-10-28-115-V (backlog). Konkurensi: baca-kunci FOR UPDATE inventory-fifo.ts:118-126 |
| AC-INV-008 | Sebagian | prisma/schema.prisma:3870 — `Remnant`; pembeda scrap: `src/lib/services/scrap-classification.ts:8` |
| AC-INV-009 | Sebagian | prisma/schema.prisma:2513 — `StockMove.referenceType`/`referenceId` ke dokumen sumber; UI bertaut: laporan kartu stok + detail mutasi + daftar mutasi (PR kartu t_3bef3072) + laporan mutasi stok; sisa: tipe di luar daftar putih `referenceHref` (mis. WorkOrder, SalesInvoiceCOGS) tampil label polos |

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
| AC-PROJ-003 | Sebagian | Frontend t_9b516ac7: `ProjectBudgetCard` (judul Estimasi vs Aktual Proyek, ringkasan Total Estimasi/Total Aktual/Selisih Estimasi−Aktual, tabel per tahap kolom Estimasi (RAB)/Aktual (Terealisasi), aktual per tahap Belum terukur + alasan kolom tahap absen) + `ProjectPlDetailCard` sisi aktual (judul Aktual Proyek, baris Pendapatan/Biaya Aktual, catatan margin job bukan laba akuntansi); sisa: kolom tahap sumber biaya belum ada di schema (Backend) |
| AC-PROJ-004 | Sebagian | prisma/schema.prisma:5174 — `Project` ada; ketertelusuran biaya ke sumber belum ditelusur |
| AC-WO-001 | Sebagian | prisma/schema.prisma:3309 — `WorkOrderItem`; ketiadaan efek stok rencana belum dibuktikan negatif di sini |
| AC-WO-002 | Sebagian | prisma/schema.prisma:2763 — `MaterialIssue` mencatat issue aktual; UI detail WO mencegah arah ke issue ganda (tombol buat baru disembunyikan selama MI aktif ada, status aktif tertampil) — `src/app/(dashboard)/produksi/perintah-kerja/[slug]/page.tsx`. Sisa: pencatatan ganda inventory+project dan guard jalur form Inventaris belum ditelusur (backend) |
| AC-WO-003 | Sebagian | prisma/schema.prisma:3809 — `OvertimeRequest`; approval policy jam kerja belum ditelusur |
| AC-FIN-001 | Sebagian | prisma/schema.prisma:2448 — ketertelusuran hutang lewat alokasi; sisi piutang tertaut lewat `prisma/schema.prisma:1986` |
| AC-FIN-002 | Belum | belum ditelusur — reversal beralasan dengan histori asal tidak ditunjuk di sini |
| AC-HR-001 | Sebagian | prisma/schema.prisma:4066 — `PayrollComponentLine` merinci komponen payroll |
| AC-HR-002 | Sebagian | Spec Business F-2026-10-28-117-S (backlog): inventarisasi 11 guard TERVERIFIKASI-KODE — unik slip `uq_payroll_employee_range` (`prisma/schema.prisma:3998`), guard irisan `payroll-frequency.ts:86-100` di bawah kunci baris `FOR UPDATE` (`hrm.actions.ts:2783-2823,2537-2573`), klaim kondisional approve/bayar (`hrm.actions.ts:3063-3069,3128-3199`), cek jurnal ganda hook (`accounting.hook.ts:2907-2916,3049-3057`), unik jurnal aktif `journals_active_reference_unique` (`schema.prisma:4245`); falsifikasi E117-1..9 di spec; sisa OPEN: vonis Accountant re-post sesudah reversal |
| AC-HR-003 | Sebagian | Penegakan batas potongan **TERPASANG** empat lapis: cap per sisa utang `src/lib/reports/payroll-weekly.ts:173-178`, Σ pinjaman aktif `:180-196`, cap permintaan klien `:207-215`, plafon Pasal 63 50% upah `src/actions/hrm.actions.ts:735-754` (bayar `:3166`); amortisasi tertua-dulu beranggaran slip `:3198-3231`; sisa tidak dapat diedit lewat form `:4804-4805,4838-4839,4856`. Acceptance QA E-LOAN-1..8 di spec F-2026-10-28-131-S §7; OPEN: BR-LOAN-03/07/08 (basis baris `origin/main` c51f17f3e) |
| AC-HR-004 | Sebagian | src/app/api/payroll/late-penalty/route.ts:18 — pembatasan akses data turunan payroll; cakupan semua payroll belum diaudit |
| AC-REP-001 | Belum | belum ditelusur — kesesuaian total report dengan definisi query sumber tidak ditunjuk per laporan di sini |
| AC-REP-002 | Sebagian | .github/workflows/ci.yml:25 — CI berjalan `TZ=Asia/Jakarta`; konsistensi timezone semua filter report belum ditelusur |
| AC-REP-003 | Sebagian | Audit Frontend t_af1af475: PDF server registry (70 kunci) lengkap kop+periode+Dicetak-oleh di src/lib/pdf/documents/statement.ts dan layar ReportLetterhead; jalur klien diseragamkan di src/components/reports/export-buttons.tsx (formatPrintedAtWib Asia/Jakarta berlabel WIB di footer PDF + blok kop CSV buildCsvHeaderLines: perusahaan/periode/dicetak) dites export-buttons.test.ts; kolom hitung ambigu dilabeli entitas (Penawaran di quotation-outcome-card.tsx + quotation-outcome-export.ts, Layer Stok di laporan/umur-stok). Sisa: preparedBy belum ada di PDF klien (endpoint setelan tak memuat pengguna), halaman tanpa ReportLetterhead tak menyumbang periode ke ekspor klien. RATCHET 2026-10-28 (PR Frontend AC-REP-003): nol format tanggal/angka ad-hoc di seluruh src/app/(dashboard)/laporan/** — 69 panggilan toLocaleDateString/toLocaleString dikonversi ke formatDate/formatNumber/formatCurrency/formatPeriod (zona WIB dipaku, nominal bersimbol Rp), dijaga src/app/(dashboard)/laporan/__tests__/report-format-consistency.test.ts |
| AC-REP-004 | Sebagian | src/lib/auth/permissions.ts:21 — permission backend tersedia; permission khusus export per laporan belum ditelusur |

## 13. Peta kolom mapping akun `SystemSetting` → ID aturan

Bagian ini melengkapi tabel di atas, bukan menggantikannya: tabel di atas
memetakan ID aturan → bukti, bagian ini memetakan **kolom penyimpanan** →
ID aturan/spec yang menuntut kolom itu terisi. Kelima kolom dibaca jalur uang
secara fail-closed — kosong berarti posting/jurnal ditolak, bukan angka
default — sehingga isinya bukan preferensi tampilan.

Sampai audit 28 Oktober 2026 kelima kolom hanya terisi sekali saat instalasi
(`src/lib/setup/install.ts:135-140` `resolveAllAccountMappings`) dan tidak ada
jalur tulis sesudahnya. Sejak `src/actions/settings.actions.ts` mendaftarkan
kelimanya sebagai `intNull(...)` dan `src/lib/validations/settings.schemas.ts`
mendaftarkannya di skema, kolom dapat diisi/diubah dari form Pengaturan →
Akuntansi tanpa instalasi ulang; dikunci
`src/actions/__tests__/settings.actions.test.ts` (payload + baca-balik
penyimpanan). Kolom yang tidak dikirim form tidak ikut ditulis.

| Kolom `SystemSetting` | ID aturan / spec | Bukti paling relevan |
| --- | --- | --- |
| `customerDownPaymentAccountId` | SAL-BR-004 (+ ADR-007) | `docs/product/BUSINESS-RULES.md:88-104` — kredit Uang Muka Penjualan 210102; fail-closed `src/lib/hooks/accounting.hook.ts:2382-2387,2491-2496`; alokasi reklas `src/lib/hooks/down-payment.hook.ts:219-240,756-775` |
| `warrantyExpenseAccountId` | vonis F-2026-10-21-021 (tahap 3: provisi + jurnal garansi) | `src/lib/services/warranty-journal.service.ts:341` — posting biaya garansi ditolak bila kosong |
| `warrantyProvisionAccountId` | vonis F-2026-10-21-021, dilanjutkan F-2026-10-22-041 (kode 210205 milik provisi garansi, bukan liabilitas PPh 4(2) sewa) | `src/lib/reports/deferred-tax-nonaset-data.ts:46-48` |
| `supplierClaimReceivableAccountId` | vonis F-2026-10-21-021, dilanjutkan F-2026-10-24-130-V (klaim vendor part cacat garansi) | `src/lib/services/warranty-journal.service.ts:418` — jurnal klaim supplier ditolak bila kosong |
| `reimbursementLiabilityAccountId` | vonis F-2026-10-25-018-V (wajib COA 210209) + F-2026-10-27-083-V | `src/lib/hooks/accounting.hook.ts:1275-1307` — resolver fail-closed (kosong/akun hilang/terhapus/nonaktif/kode ≠ 210209 = throw) |

## Penutup

Indeks ini sengaja berhenti pada satu bukti per ID. Pendalaman
berikutnya per ID — membaca penegak penuh, test yang membuktikannya,
dan status acceptance — adalah pekerjaan audit terpisah dan tidak
boleh disimpulkan dari tabel ini. Bila baris di atas bertentangan
dengan kode terbaru, kode dan test yang berjalan menang; perbarui
indeks ini pada PR yang sama.
