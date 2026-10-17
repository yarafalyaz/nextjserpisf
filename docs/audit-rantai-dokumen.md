# Audit Rantai Dokumen — Silengkap / YaraERP

Tujuan audit ini satu: **tidak boleh ada mata rantai dokumen yang putus** — dari
penawaran sampai jurnal dan stok (Penawaran → Pesanan → Surat Jalan → Faktur →
Retur → Pembayaran → Jurnal/stok, dan sisi beli: Permintaan → PO → Penerimaan →
Tagihan → Pembayaran → Retur).

Metode: dua gelombang audit **read-only** (peta foreign key di `prisma/schema.prisma`
+ aksi konversi antar dokumen) yang menghasilkan daftar celah dengan bukti
`berkas:baris`, lalu perbaikan bertes, lalu verifikasi orkestrator: gate lokal
(`tsc` 0 error, `eslint` 0 error, `vitest --maxWorkers=4` seluruh berkas) dan CI
7/7 termasuk seluruh shard E2E. Klaim di bawah yang berbunyi "terverifikasi" sudah
diperiksa ulang oleh orkestrator pada kode, bukan hanya dilaporkan subagent.

- **Ujung rantai commit:** `27c28fa7` (lihat riwayat di bagian per rantai)
- **Penjaga terkait:** `src/__tests__/link-wiring.test.ts`,
  `src/__tests__/action-wiring.test.ts`, `src/__tests__/chain-ui-wiring.test.ts`,
  `src/__tests__/stock-out-single-path.test.ts`

---

## 1. Penjualan — commit `bcd7eca4`, `89bfd30b`, `27c28fa7`

| Celah | Bukti celah | Perbaikan |
| --- | --- | --- |
| Surat jalan tanpa baris barang; `DeliveryOrderItem.salesOrderItemId` tidak pernah terisi, sehingga laporan Pemenuhan Pesanan selalu 0 terkirim | `createDeliveryOrder` menulis dokumen tanpa `items`; form tanpa editor baris | Form punya editor baris yang terisi dari SISA (qty pesanan − sudah dikirim), aksi menulis `items` + `salesOrderItemId`, memvalidasi baris milik pesanan itu/berbarang katalog/qty > 0, dan menggabungkan baris ganda |
| Status surat jalan tidak pernah maju walau laporan hanya menghitung `shipped`/`delivered` | Tidak ada aksi maupun tombol transisi | Aksi `shipDeliveryOrder` + `deliverDeliveryOrder` (klaim atomik, menolak surat jalan tanpa baris, menstempel `confirmedAt`/`deliveredAt`) dan tombolnya di halaman detail |
| Gerbang status hanya di UI — pemanggilan aksi langsung tetap bisa membuat surat jalan untuk pesanan yang belum boleh dikirim | Halaman `tambah` memeriksa status, aksi tidak | `DELIVERABLE_ORDER_STATUSES` dipakai halaman tambah, halaman ubah, DAN aksi; kosakatanya disatukan dengan `FULFILLABLE_ORDER_STATUSES` lewat uji paritas |
| Dua tautan "buat dari" mati: perintah kerja → faktur (`?quotationId=`), pesanan → uang muka (`?salesOrderId=`) | Dikirim UI, tidak dibaca halaman tujuan | Faktur menerjemahkan penawaran → pesanannya (dan menerima `?salesOrderId=` langsung); uang muka menerjemahkan pesanan → penawarannya. Daftar-beku `LINKS_PENDING` kini **kosong** |
| Halaman detail pesanan tidak punya jalan membuat surat jalan (kartunya bahkan hilang saat belum ada surat jalan) | Kartu dikurung `deliveryOrders.length > 0` | Kartu selalu tampil + keadaan kosong + tombol "+ Surat Jalan" (hanya untuk status yang boleh dikirim, memakai daftar status yang sama dengan aksinya) — `27c28fa7` |
| Halaman faktur tidak pernah menampilkan retur yang menunjuknya | `salesReturns` tidak diambil | Tab "Retur" + tombol "+ Buat Retur" (`?invoiceId=` sudah dibaca halaman retur) — `27c28fa7` |
| Satu penawaran bisa menghasilkan banyak pesanan penjualan lewat jalur UI nyata | `createSalesOrder` tanpa cek konversi; `convertQuotationToOrder` (yang punya kuncinya) hanya dipanggil tes | `createSalesOrder` mengunci penawaran (`FOR UPDATE`) lalu menolak bila sudah punya pesanan; halaman penawaran menampilkan tautan ke pesanan yang ada, bukan tombol konversi |

## 2. Pembelian — commit `09b116ee`

| Celah | Bukti celah | Perbaikan |
| --- | --- | --- |
| **Bug keras**: penerimaan campuran (barang + jasa) selalu rollback | Dua jurnal untuk satu GR memakai `referenceType` yang sama sehingga melanggar indeks unik `journals(referenceType, referenceId)` | Penanda jurnal jasa dipisah (`GoodsReceiptService`); pembalikan menyapu kedua penanda; halaman penerimaan menampilkan keduanya. Dibuktikan juga di MySQL dev (penanda lama errno 1062, penanda baru lolos) |
| "Diterima" dan laporan PO Outstanding selalu 0 | `PurchaseOrderItem.receivedQty` tidak pernah ditulis | Ditulis saat verifikasi sebagai nilai **absolut** dari peta kumulatif yang SAMA dengan penjaga over-receipt (terverifikasi orkestrator: `goods-receipt.hook.ts`, `UPDATE purchase_order_items SET received_qty = ...`), dihitung ulang saat GR dihapus |
| Tagihan vendor tidak pernah menaut ke penerimaan; laporan Diterima Belum Ditagih selalu 0 | `VendorBill.goodsReceiptId`/`VendorBillItem.goodsReceiptItemId` tidak pernah diisi | Jalur "buat tagihan dari penerimaan" (`tagihan/tambah?grId=`) memvalidasi GR (terverifikasi, vendor sama, belum ditagih penuh) dan mengisi kedua kolom; halaman penerimaan dapat tombol "Buat Tagihan" + daftar tagihannya |
| Backlink PO → Retur hilang (data diambil, tidak dirender) | Halaman pesanan mengambil `purchaseReturns` tanpa merendernya | Tab Retur + tombol "Buat Retur" (`?poId=`), prefill dari `receivedQty` |

## 3. Produksi & stok — commit `38818b71`

| Celah | Bukti celah | Perbaikan |
| --- | --- | --- |
| `ProductionOrder.workOrderId` tidak pernah diisi; laporan Job Order kosong (UI menutupinya dengan heuristik cocok-item yang bisa salah pasang) | Form tanpa pilihan perintah kerja; halaman ubah mengirim hardcode `0` | Combobox "Perintah Kerja", halaman tambah membaca `?workOrderId=`/`?productId=`, aksi memvalidasi WO ke baris nyata lalu menulis FK, tombol "+ Perintah Produksi" di detail WO |
| `WorkOrder.bomRevisionId` tidak pernah diisi walau ditampilkan | Diisi dari revisi BOM yang di-snapshot order, hanya bila WO belum punya |
| Pengeluaran material dari modul Inventaris tidak tertaut ke pekerjaannya | Form tidak mengirim `workOrderId`/`projectId`/`costCenterId` | Kolom penaut dikirim lewat `buildMaterialIssueFormData`; kolom kosong TIDAK dikirim agar tidak menghapus tautan lama. Halaman tambah & ubah kini meneruskan daftar pilihannya (`27c28fa7`) — tanpa itu menyimpan ulang dokumen lama akan menghapus tautan |
| Gerbang status buntu untuk order tanpa material BOM | `in_progress` hanya bisa lewat pengeluaran material | Aksi `startProductionOrder` + tombol "Mulai Produksi" |
| `StockAdjustment.journalId` tidak pernah diisi | Diisi dari jurnal hook di transaksi yang sama, tidak menulis null bila jurnal tidak dibuat |

## 4. Keuangan & jurnal — commit `05f6b138`

| Celah | Bukti celah | Perbaikan |
| --- | --- | --- |
| **Uang keluar berstatus `paid` tanpa satu pun jurnal** | `onExpenseApproved` kembali senyap bila `paidFromAccountId` kosong, status tetap `paid` | `markExpensePaid` menolak lebih dulu saat akun sumber dana kosong; hook melempar kesalahan yang terlihat. Status `paid` dan jurnal tidak bisa berpisah lagi |
| **DPP laporan pajak terlalu besar** | `VendorBill.subtotal` yang dikirim form adalah angka BRUTO (Σ qty × harga, sebelum diskon baris), sementara `VendorBill.discountAmount` (level dokumen) **tidak pernah diisi sama sekali** — padahal tiga tempat menghitung `DPP = subtotal − discountAmount`. Jadi setiap tagihan yang punya diskon baris dilaporkan dengan dasar pemotongan PPh lebih besar daripada yang sebenarnya, bertentangan dengan `withholdingAmount` yang tersimpan | Diskon level dokumen diisi dari Σ diskon baris saat tagihan **dibuat dan diubah**, memakai satu sumber matematika (`src/lib/finance/vendor-bill.ts`) yang juga dipakai penulisan barisnya, sehingga keduanya tidak bisa berselisih. Penjaga `vendor-bill-discount-wiring` (berarah dua) mengunci kesepakatan penulis ↔ pembaca |
| Jurnal transaksi berulang tak bisa ditelusuri dan tanpa kunci periode | `DRAFT` tanpa `referenceType`/`referenceId` | Merujuk balik ke jadwalnya (`RecurringTransaction_YYYYMMDD`, pola `ASSET_DEPRECIATION_*`) dan memakai `assertPeriodOpen`: periode tertutup gagal terlihat dan jadwal tetap jatuh tempo (bisa diulang) |

Cara bug DPP di atas ditemukan: detektor kolom "dibaca tapi tak pernah ditulis"
(`/tmp/readonly-cols*.py`, gaya yang sama dengan `knip` — **sinyal, bukan penjaga**).
Detektor itu punya vonis palsu yang sudah dipetakan, jadi ia tidak dijadikan tes:
penulisan lewat notasi singkat `field,` (kini ditangani), lewat spread/variabel
payload (`data: parsed.data`), lewat `createMany({ data: variabel })`, dan FK anak
yang terisi otomatis oleh nested create. Karena itu setiap kandidat **diverifikasi
manual di jalur penulisannya sebelum dinyatakan celah** — persis seperti kasus ini:
`VendorBillItem.discountAmount` ternyata ditulis (di dalam `.map()` di luar blok
`data:`), sedangkan `VendorBill.discountAmount` benar-benar tidak pernah ditulis.

## 4b. Temuan lain dari detektor kolom "dibaca tapi tak pernah ditulis"

| Kolom | Verdict | Tindakan |
| --- | --- | --- |
| `OvertimeRequest.approvedAt` | **BUG — diperbaiki.** Aksi `approveOvertime` menulis `status`/`approvedBy` tanpa cap waktu, padahal halaman detail lembur hanya merender baris "Disetujui Pada" bila kolom itu terisi. Jadi pengajuan yang sudah disetujui tampil tanpa tanggal persetujuan, dan komentar di `hrm.actions.ts` yang menjanjikan jejak audit `approvedAt` tidak benar | Cap `approvedAt: new Date()` di klaim atomik persetujuan (pengesahan ulang tidak menimpa karena berhenti lebih awal di jalur idempotensi). Tes lama diperketat dengan asersi cap waktu |
| `OvertimeRequest.supervisorApprovedAt`, `OvertimeRequest.rejectionReason` | Kolom MATI: tidak ada aksi persetujuan supervisor maupun aksi penolakan lembur di seluruh repo | Keputusan produk: implementasikan tahapnya, atau buang kolomnya (butuh migrasi) — **bukan** diisi asal agar UI-nya terisi |
| `PettyCash.sourceAccountId`, `PettyCash.expenseAccountId` | Kolom MATI: payload `pettyCash.create` hanya menulis `accountId`/`projectId`/`vendorId`/`categoryId`. Perilakunya tetap benar karena hook memakai `pettyCash.sourceAccountId ?? settings.cashBankAccountId` dan MELEMPAR bila keduanya kosong — jadi tidak ada uang tanpa akun, hanya saja akun per transaksi tidak bisa dipilih dari UI | Keputusan produk (tambahkan pilihan akun, atau buang kolomnya lewat migrasi) |

Vonis PALSU yang dipetakan (kandidat detektor yang ternyata terisi — jangan
dijadikan tes): `QuotationItem.sectionId` (terisi otomatis oleh nested create
seksinya), `UomConversion.factorToBase` (`createMany({ data: … })` dari JSON form),
`Employee.dateOfBirth` (ditulis di `master.actions.ts`), dan
`VendorBillItem.discountAmount` (ditulis di dalam `.map()` di luar blok `data:`).

## 5. Keputusan desain yang TERVERIFIKASI: kapan stok keluar saat penjualan

Ini bukan celah kode, tetapi keputusan yang harus dipahami sebelum ada yang
"melengkapi rantainya":

- Stok keluar penjualan terjadi di **satu** tempat: `onSalesInvoicePosted`
  (`src/lib/hooks/accounting.hook.ts`) saat **faktur diposting** — mengurangi
  `qty_on_hand`, mengonsumsi lapisan FIFO, dan menulis HPP/COGS.
- **Surat jalan tidak menyentuh stok sama sekali**: tidak ada hook surat jalan di
  `src/lib/hooks/`, dan aksi `createDeliveryOrder`/`shipDeliveryOrder`/
  `deliverDeliveryOrder` tidak menyentuh `qty_on_hand`, `stock_moves`, maupun
  `item_transactions`.
- Pembatalan faktur **mengembalikan** stok lewat
  `src/lib/services/sales-invoice-posting.service.ts` (dokumen `SM-REV-INV-*`).

Konsekuensi bisnis yang perlu diputuskan pemilik repo: pada alur **kirim dulu,
faktur menyusul** (alur yang justru dibuka fitur surat jalan ini), barang sudah
keluar gudang tetapi sistem masih menghitungnya sebagai stok tersedia sampai
faktur diposting — laporan stok dan HPP akan lebih tinggi pada rentang itu, dan
surat jalan kedua untuk barang yang sama masih bisa dibuat karena penjaga
ketersediaan hanya berjalan saat faktur diposting.

`src/__tests__/stock-out-single-path.test.ts` mengunci keadaan ini sebagai
**gerbang keputusan**: menambahkan efek stok pada surat jalan akan memerahkan tes
(mencegah stok dan HPP terhitung dua kali). Bila diputuskan stok keluar di surat
jalan, pindahkan pengurangan stok/HPP ke sana, hapus dari faktur, dan perbarui tes
itu beserta dokumen ini.

## 6. Menunggu keputusan pemilik repo — butuh MIGRASI

Diusulkan, **belum dikerjakan** (mengubah skema produksi bukan keputusan sepihak):

1. Kolom penghubung `MaterialIssue` ↔ `ProductionOrder` — tanpa ini pengeluaran
   material tidak bisa dilaporkan per perintah produksi.
2. `batchId` pada item opname — opname barang berseri/batch tidak bisa dicatat.
3. FK `Cheque` → pembayaran + setelan akun kliring — tanpa akun lawan, jurnal giro
   akan mengarang kategori akun DAN dobel-hitung dengan jurnal pembayaran.
4. `receivedQty` sebaiknya dijaga di satu titik (service/trigger) supaya jalur
   pembatalan lain tidak bisa melewatkannya.

## 7. Sengaja TIDAK dikerjakan, dengan alasan yang bisa diperiksa

- **Kas kecil dari expense**: jejak GL uang keluarnya sudah ada lewat jurnal
  Expense saat `paid` (Cr = `paidFromAccountId` = akun kas kecil). Memanggil
  `onPettyCashCreated` akan memposting kredit kedua ke akun kas kecil dengan debit
  yang bisa berbeda akun — tidak ekuivalen.
- **Pembatalan jurnal memakai `deleteMany`** alih-alih jurnal pembalik, dan
  pembalik yang menunjuk `Journal` alih-alih dokumen: berisiko tinggi pada
  akuntansi yang sudah terposting; diusulkan, tidak dikerjakan.
- **Jurnal transaksi berulang tetap `DRAFT`**: mengubahnya menjadi `POSTED` akan
  menambah angka buku besar tanpa bukti; jalur posting manusia ada di `postJournal`.

## 8. Cara memverifikasi ulang

```bash
npx tsc --noEmit                 # 0 error
npx eslint src/                  # 0 error (2 warning lama: error.tsx/global-error.tsx)
npx vitest run --maxWorkers=4    # seluruh berkas hijau
```

Penjaga wajib **difalsifikasi** sebelum dipercaya: tanam pelanggaran di SALINAN
repo (`git worktree add -q --detach /tmp/check HEAD`), bukan di repo asli. Aturan
dan daftar-beku penjaga (`LINKS_PENDING`, `ACTIONS_PENDING`) bersifat **berarah
dua**: entri yang sudah usang memerahkan tes.
