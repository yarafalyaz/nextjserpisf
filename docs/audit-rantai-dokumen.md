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

- **Ujung audit:** commit `6e60965e` (2026-10-18) — bagian per rantai mencantumkan commit
  awalnya; kelas "seed-only" (§4b–§4d) dan bukti E2E (§8a–§8b) ditutup sesudahnya
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
| `OvertimeRequest.supervisorApprovedAt` | **Kolom MATI**: halaman detail merender "Disetujui Supervisor" bila terisi, tetapi tidak ada penulis di seluruh repo — tahap persetujuan supervisor belum dibangun | Keputusan produk: bangun tahapnya, atau buang kolomnya (butuh migrasi) |
| `OvertimeRequest.rejectionReason` | **Bukan kolom mati (koreksi).** Ditulis langkah penolakan approval generik — `rejectStep` di `src/actions/approval.actions.ts` (`REJECTION_REASON_MODELS`) dengan catatan dari form di `/pengaturan/persetujuan/[slug]` | Tidak ada — alasan penolakan tampil di halaman detail lembur |
| `PettyCash.sourceAccountId`, `PettyCash.expenseAccountId` | Kolom MATI: payload `pettyCash.create` hanya menulis `accountId`/`projectId`/`vendorId`/`categoryId`. Perilakunya tetap benar karena hook memakai `pettyCash.sourceAccountId ?? settings.cashBankAccountId` dan MELEMPAR bila keduanya kosong — jadi tidak ada uang tanpa akun, hanya saja akun per transaksi tidak bisa dipilih dari UI | Keputusan produk (tambahkan pilihan akun, atau buang kolomnya lewat migrasi) |
| **10 kolom yang hanya diisi skrip seed** — **sebagian besar sudah ditutup.** `/sdm/absensi` (commit `2cb1d7da`) kini menulis `Attendance.checkOut`, `overtimeApproved`, `overtimeMinutes` dari jam dinding WIB, dan `addTicketComment` menulis `CrmTicketComment.isInternal` | Model `Attendance` DIBACA produk (metrik absensi dasbor + notifikasi terlambat di `api/cron/route.ts`) dan kini juga DITULIS (halaman + aksi absensi, izin `create/edit/manage_attendance`). Sisa yang masih seed-only: GPS absensi (`checkIn/outLatitude`, `checkIn/outLongitude`) + `CrmTicket.firstResponseAt`/`resolvedAt` | Penjaga skema DIPERKETAT: kelas ini dideteksi terpisah dan dicatat di `SEED_ONLY_COLUMNS` (berarah dua). Keputusan produk untuk enam sisanya: tangkap lokasi di form absensi, tandai waktu respons/penyelesaian tiket, atau buang kolomnya lewat migrasi |

Mengapa kelas "hanya seed" penting: ia **lolos** dari pemeriksaan kolom mati biasa
karena berkas seed ikut dipindai sebagai kode, sehingga berminggu-minggu tidak
terlihat. Ini kelas yang sama dengan enam kolom yang baru terdeteksi setelah 11
skrip yatim dibuang — hanya saja skrip seed-nya masih ada, jadi kolomnya tetap
"terpakai" secara palsu.

## 4c. Lubang penjaga yang diketahui (jangan diulang)

- Penjaga `schema-usage` memeriksa "ada rujukan", **bukan** "ada penulisan". Kolom
  yang dibaca laporan tetapi tidak pernah ditulis (kelas bug DPP di §4) lolos.
  Detektor "dibaca tapi tak pernah ditulis" (`/tmp/readonly-cols*.py`) menutup
  celah itu sebagai **sinyal**, bukan tes — vonis palsunya sudah dipetakan di §4b.
- Penjaga itu juga menghitung berkas seed sebagai pemakaian; karena itu
  pemeriksaan terpisah `SEED_ONLY_COLUMNS` ditambahkan (§4b).
- **Penjaga yang tidak bisa menyala.** `deleteUom` (`master.actions.ts`) menolak
  penghapusan bila ada satuan lain yang menurunkan diri darinya
  (`count({ where: { baseUnitId: id } })`) — tetapi `UnitOfMeasure.baseUnitId`
  tidak pernah ditulis kode mana pun, jadi hitungannya selalu 0 dan cabang itu
  tidak pernah tercapai. Bandingkan penjaga di sebelahnya (`usedByItems`) yang
  benar-benar bekerja. Tidak ada bahaya hari ini karena memang tidak ada yang bisa
  bergantung pada kolom itu; keputusan produk: bangun hierarki satuan (isi
  `baseUnitId` dari UI) atau buang kolom + penjaganya lewat migrasi. Pola umumnya
  sama dengan `OvertimeRequest.approvedAt`: **elemen yang tidak bisa pernah
  aktif lebih menyesatkan daripada elemen yang tidak ada**, karena ia tampak
  seperti jaminan.

Vonis PALSU yang dipetakan (kandidat detektor yang ternyata terisi — jangan
dijadikan tes): `QuotationItem.sectionId` (terisi otomatis oleh nested create
seksinya), `UomConversion.factorToBase` (`createMany({ data: … })` dari JSON form),
`Employee.dateOfBirth` (ditulis di `master.actions.ts`), dan
`VendorBillItem.discountAmount` (ditulis di dalam `.map()` di luar blok `data:`).

## 4d. Model yang dibaca produk tetapi tidak punya jalur tulis (11 model → 0)

Kelas yang lebih besar dari §4b: bukan sekadar kolom, melainkan **seluruh modelnya
tidak bisa diisi dari aplikasi**. Terdeteksi lewat pemeriksaan baru di penjaga
`schema-usage` (`SEED_ONLY_MODELS`, berarah dua) yang memperhitungkan TIGA jalur
tulis: delegate Prisma langsung, raw SQL, dan nested write dari model induk.

| Model | Yang dibaca produk | Akibatnya (dulu) | Status |
| --- | --- | --- | --- |
| `Attendance` | metrik absensi dasbor + notifikasi keterlambatan | absensi tidak bisa dicatat siapa pun; dasbor hanya berisi pada basis data yang di-seed | **DITUTUP** — `/sdm/absensi` (commit `2cb1d7da`) |
| `AssetGroup` | halaman aset (`asset.group?.name`) | kelompok aset tidak bisa dibuat, dan `Asset.groupId` tidak pernah ditulis | **DITUTUP** — master `/aset/grup`; `Asset.groupId` & `assetBrandId` ditulis form aset |
| `BankStatementLine` | halaman rekonsiliasi bank | baris rekening koran hanya dari seed (impor belum ada) | **DITUTUP** — `/keuangan/laporan-bank/[slug]` (commit `6e60965e`) |

### Sudah ditutup

| Model | Perbaikan |
| --- | --- |
| `UserWarehouse` | `updateUserWarehouses` + panel "Akses Gudang" di detail pengguna. Menyangkut pembatasan akses, jadi `getWarehouseScope` tetap **fail-closed** (`{ kind: "none" }` bila kosong); pemberian aksesnya lewat izin `manage_users`, id gudang divalidasi ada, dan perubahan dicatat |
| `CrmTicketComment` | `addTicketComment` + form di kartu Komentar; kolom `isInternal` kini dipakai (kotak "Catatan internal"). Penulis dari SESI |
| `ProjectLog` | `addProjectLog` + form "Tambah Log" di tab Log. Penulis dari SESI |
| `AssetBrandModel` | kolom "Tipe / Model" pada form merek aset (tanpa modul baru): kolom "Jumlah Model" di tabel merek akhirnya berisi |
| `Holiday`, `DepartmentHoliday`, `WorkSchedule` | halaman `/sdm/kalender-kerja` + 9 aksi (buat/ubah/hapus untuk ketiganya). Izinnya **sudah di-seed sejak dulu** (`create/edit/delete/manage_holidays`, `view/create/delete_work_schedules`) — hanya halaman & aksinya yang tidak pernah dibangun. `edit_work_schedules` ditambahkan ke `PERMISSIONS` + katalog (prosedur generator) |
| `AssetGroup` | master `/aset/grup` + aksi create/update/delete + izin `view/create/edit/delete_asset_groups`. Sekaligus menutup lingkaran: `Asset.assetBrandId` dan `Asset.groupId` kini benar-benar ditulis form aset (lihat catatan cacat skema di bawah). **Hapus ditolak** bila grup masih dipakai aset — relasi `Asset.groupId` opsional, dan tanpa penjagaan itu Prisma melepas asetnya diam-diam (SetNull) |
| `ProfitCenter` | master `/keuangan/pusat-laba` + aksi create/update/delete dan izin `view/create/edit/delete_profit_centers`. **TERHUBUNG KE JURNAL**: form jurnal punya pilihan "Pusat Laba" yang ditulis ke setiap entri di kedua jalur (buat & ubah), dan jalur pembalikan jurnal ikut menyalinnya — jadi laporan pusat laba berhenti menumpuk di "Tanpa Pusat Laba" |
| `Attendance` | halaman `/sdm/absensi` + aksi `createAttendance`/`updateAttendance`/`deleteAttendance` (izin `create/edit/manage_attendance`), menulis absensi dari jam dinding WIB lewat `src/lib/utils/attendance-time.ts`; kolom GPS sengaja tetap seed-only (§4b) |
| `BankStatementLine` | halaman detail `/keuangan/laporan-bank/[slug]` + aksi `createBankStatementLine`/`updateBankStatementLine`/`deleteBankStatementLine` (izin `create_journals` — sama dengan penulis header `createBankStatement`). `totalDebits`/`totalCredits` header dihitung ulang (`_sum`) di dalam transaksi yang sama; kolom `matchedType` sudah dibuang (2026-10-19, branch kerja, migrasi `20261019001000_drop_wave2_dead_columns`) |

Catatan prosedur yang terbukti: menambah permission baru menuntut EMPAT suntingan,
bukan dua — `PERMISSIONS`, `RESOURCE_MODULE`, `RESOURCE_LABEL`
(`scripts/generate-module-catalog.mjs`), dan `permission-labels.ts`. Entri yang hanya
masuk `PERMISSIONS` + `RESOURCE_MODULE` akan tercetak sebagai "unmapped" oleh
generator, lalu memerahkan tes katalog DAN tes label izin.

Untuk modul baru, itu belum cukup — masih ada DUA penjaga yang menahan:
1. `page-action-permission-parity` menuntut entri halaman di `CREATE_PAGE_CASES`, dan
2. `ROUTE_PERMS` di `src/lib/auth/action-perms.ts` harus punya prefix KHUSUS yang
   diletakkan **sebelum** prefix luas pendahulunya (`/aset/grup` sebelum `/aset`).
   Tanpa urutan itu, halaman grup dianggap memakai `edit_assets` dan paritas memerah.

### Cacat senyap yang ditemukan lewat kolom yang "dibaca tetapi tak ditulis" ini

`assetSchema` dulu tidak memuat `assetBrandId`, padahal form aset punya dropdown
"Merek" sejak awal. zod membuang kunci yang tidak dideklarasikan, sehingga nilainya
sampai ke aksi lalu HILANG: pengguna memilih merek, halaman aset tetap menampilkan
"-", tanpa error dan tanpa satu tes memerah. Detektor kolom-mati tidak melihat kelas
ini karena kolomnya memang DIBACA — yang hilang penulisnya, dan sebabnya di skema.
Verifikasi wajib dua sisi: skema MENERIMA nilainya, DAN aksi MENULISKAN-nya.

**Kelas ini sekarang dijaga otomatis** oleh `src/__tests__/form-field-wiring.test.ts`:
setiap nama field yang dikirim formulir (`name="..."`, `fd.set/append("...")`) harus
terbukti dibaca di luar berkas form — entah sebagai kunci skema validasi, entah sebagai
literal di sisi server. Nama yang hanya dirujuk formulirnya sendiri selalu bug.

Penyisiran perdana atas 94 formulir: **nol pelanggaran nyata**. Satu kandidat, `modelId`
di form kendaraan, ternyata sah (tabel `Vehicle` tidak punya kolom model; model
kendaraan tersirat dari variannya, field itu murni state cascade di klien). Tiga
kandidat lain dibaca lewat jalur yang detektor pertama lewatkan — `formData.getAll("x")`
yang terpecah baris dan helper `strNull("x")` — sehingga aturan "dibaca"-nya dilonggarkan
secara sadar, dengan batasnya dituliskan di berkas penjaganya.

Ironi yang tercatat pada kelompok SDM: `bulk.actions.ts` **sudah** memetakan hapus
massal untuk `holiday`, `departmentHoliday`, dan `workSchedule` — jadi aplikasi bisa
menghapus baris yang tidak bisa dibuat.

Tidak ada sisa keputusan di tingkat model: kesebelas model kelas ini sudah punya jalur
tulis produk, dan `SEED_ONLY_MODELS` (berarah dua) kini **kosong** — model baru yang
hanya bisa diisi seed akan langsung memerahkannya. Yang **tidak** masuk daftar ini sudah
diverifikasi punya jalur tulis meski tidak terlihat dari delegate — mis. `ActivityLog`
ditulis `INSERT INTO activity_logs` (raw SQL) dan `SalesReturnItem`/`PurchaseOrderItem`
ditulis lewat nested create.

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

## 8a. Bukti kelas-baru: aplikasi + basis data NYATA (bukan mock)

Seluruh audit di atas dilakukan dengan membaca kode dan menjalankan tes satuan — itu
membuktikan *sambungan ada*, bukan *sistem berjalan*. Bukti kelas berikutnya diambil
dengan meniru resep CI secara lokal: MariaDB 10.11 bersih, `prisma migrate deploy`,
kedua seed, build produksi, lalu **seluruh suite E2E** terhadap aplikasi yang benar-benar
berjalan.

Hasil (2026-10-18, satu mesin, satu basis data):

- **1075 lulus, 0 gagal**, 3 flaky (lulus saat retry; semuanya kegagalan waktu di bawah
  beban 2 worker, bukan logika — terbukti karena lulus saat diulang), 65 dilewati.
- Jurnal hasil alur aplikasi (mis. `002/JRN/YAR/10/2026` yang tadinya DRAFT lalu
  diposting lewat UI) **seimbang**: 250.000 debit = 250.000 kredit, 2 baris.
- Audit integritas basis data sesudah suite: **nol pelanggaran** pada sembilan cek
  (buku tidak seimbang, total tersimpan beda dari jumlah baris, jurnal POSTED tanpa
  baris, entri yatim, stok beda dari pergerakan, faktur tanpa jurnal, total faktur
  tidak konsisten, jurnal nol yang diposting, pergerakan menunjuk item hilang).

### DUA CELAH BUKTI YANG TERSISA — **keduanya sudah ditutup** (§8b)

1. **Posting faktur penjualan tidak pernah diuji end-to-end.** Tidak ada satu pun spec
   yang menekan "Posting faktur ini?" — `sales-flow.spec.ts` hanya memastikan halaman
   terbuka. Jalur uang (piutang, pendapatan, HPP) dan `onSalesInvoicePosted` hanya
   terbukti oleh tes satuan dengan mock. Seed pun tidak menutupinya: seed menulis
   `status: "posted"` LANGSUNG lewat Prisma, melewati hook, sehingga tidak ada jurnal
   `SalesInvoice` di basis data mana pun.
2. **Tidak ada alur E2E yang menghasilkan pergerakan stok.** Setelah seluruh suite,
   `stock_moves` tetap **0 baris**. Jadi pengurangan stok, HPP, dan lapisan persediaan
   belum pernah dilihat berjalan pada basis data nyata.

Keduanya tentang rantai uang/persediaan — bagian yang paling mahal bila salah.
Ditutup pada 2026-10-18: spec `penjualan-posting-faktur.spec.ts` menekan tombol posting
lewat UI, dan fixture penerimaan barang + lapisan FIFO membuat jalur stok berjalan nyata
(pergerakan stok `OUT`, `qty_on_hand` 10 → 8 — tabel bukti §8b).

## 8b. CACAT DITEMUKAN: posting faktur bisa "berhasil" tanpa membukukan apa pun

Ditemukan justru karena menjalankan sistemnya, bukan karena membacanya.

**Fakta dari basis data nyata.** `system_settings.id=1` berisi
`sales_receivable_account_id = 101` tetapi **`sales_revenue_account_id = NULL`**.
`onSalesInvoicePosted` (`src/lib/hooks/accounting.hook.ts`) dibuka dengan:

```ts
const settings = await getSystemSettings(db);
if (!settings.salesReceivableAccountId || !settings.salesRevenueAccountId)
  return;   // <— diam-diam menyerah, tanpa galat, tanpa peringatan
```

Akibatnya, saat sebuah faktur DIPOSTING lewat UI: **status faktur berubah menjadi
`posted`** (bukti: `007/INV/YAR/10/2026`, grand total 200.000) sementara
**nol jurnal `SalesInvoice`** lahir, **nol pergerakan stok**, dan `qty_on_hand`
item TIDAK berkurang. Pembukuan tampak benar padahal kosong — dan tidak ada satu pun
tanda di UI, log, atau tes.

Ini juga menjelaskan temuan §8a: tidak ada jurnal `SalesInvoice` di basis data mana
pun, karena mapping pendapatan memang tidak pernah ada — **CI pun belum pernah
menjalankan posting faktur yang benar-benar membukukan.**

**Bukti pembanding (uji pembeda).** Ketika mapping piutang+pendapatan dipasang manual
lalu faktur diposting ulang, jalur itu **gagal keras** dan status faktur tetap `draft`
— jadi aplikasi ini memang bisa gagal dengan berisik; yang salah adalah satu cabang
yang memilih diam.

**SUDAH DIPERBAIKI — dengan bukti dari aplikasi yang berjalan.**

Perbaikan yang dipasang:

1. **Seed E2E mengisi seluruh mapping**: `scripts/seed-remaining-e2e.ts` dulu hanya menulis
   `salesReceivableAccountId` (itulah sebabnya pendapatan NULL). Kini juga menulis
   `salesRevenueAccountId`, `cogsAccountId`, `inventoryAccountId`, dan
   `purchaseInventoryAccountId` — dengan akun E2E-nya sendiri (E2E-4000, E2E-5103, E2E-1104).
2. **`onSalesInvoicePosted` gagal berisik** bila piutang/pendapatan belum dipetakan,
   bukan `return` senyap. Dua tes di `accounting-hook.test.ts` yang dulu MENGUNCI
   perilaku diam itu kini menuntut galatnya (satu untuk piutang hilang, satu untuk
   pendapatan hilang — kasus yang benar-benar terjadi).
3. **Fixture posting** (blok 11 seed): produk berstok dengan **penerimaan barang (IN) +
   lapisan FIFO**, lalu faktur draft berslug tetap `e2e-post-invoice-draft`.
4. **Spec E2E** `penjualan-posting-faktur.spec.ts` menekan "Posting faktur ini?" — jalur
   uang kini terjaga otomatis, bukan hanya cerita di dokumen.

**Bukti setelah perbaikan** (aplikasi + MariaDB nyata, posting lewat UI):

| Yang diperiksa | Hasil |
|---|---|
| Status faktur | `draft` → **`posted`** |
| Jurnal `SalesInvoice` | 200.000 / 200.000, 2 baris — Dr Piutang, Cr Pendapatan |
| Jurnal `SalesInvoiceCOGS` | 200.000 / 200.000, 2 baris — Dr HPP, Cr Persediaan |
| `qty_on_hand` | 10 → **8** |
| Lapisan FIFO | 10 → **8** |
| Pergerakan stok | lahir, `OUT`, qty 2, status `posted` |

### Jebakan kedua yang ditemukan: stok berasal dari LAPISAN, bukan `qty_on_hand`

Percobaan pertama dengan mapping lengkap DITOLAK dengan pesan:
*"Stok tidak mencukupi untuk 2 di gudang 2: butuh 2, tersedia 0"* — padahal item
menampilkan stok 10. Sebabnya: ketersediaan dihitung dari `inventory_layers` (costing
method FIFO), dan lapisan hanya lahir dari pergerakan stok yang nyata.

Konsekuensi praktisnya penting: kalau stok pernah diisi dengan menulis `qty_on_hand`
langsung (impor, seed, migrasi) tanpa penerimaan barang, penjualan akan ditolak sebagai
"stok tidak mencukupi" meski item terlihat ada stoknya. Penjaganya benar; yang menjebak
adalah cara stok masuk. Fixture E2E karena itu membuat **penerimaan barang + lapisan**,
bukan sekadar menulis `qty_on_hand`.

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
