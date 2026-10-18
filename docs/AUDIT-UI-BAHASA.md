# Audit Kandidat Teks UI Berbahasa Inggris

Tanggal audit: 18 Oktober 2026

## Ringkasan

Pemindaian statis terhadap teks JSX serta atribut UI (`label`, `title`, `placeholder`, `description`, dan ARIA label) di `src/app` dan `src/components` menemukan **204 kemunculan kandidat** pada **115 file**. Setelah duplikasi teks yang sama di dalam file yang sama disatukan, daftar di bawah berisi **201 entri** untuk ditinjau.

Daftar ini sengaja bersifat inklusif: beberapa entri adalah istilah yang sudah lazim dalam penggunaan Indonesia (misalnya `vendor`, `model`, `batch`, atau `serial`), nama produk/akronim (`Cloudflare`, `R2`, `API`, `CDN`), atau token status internal yang tampil ke pengguna. Semua entri harus ditinjau; copy UI umum perlu diterjemahkan, sedangkan nama produk dan akronim teknis boleh dipertahankan bila memang disengaja.

## Kandidat per file

### `src/app/(auth)/kebijakan-privasi/page.tsx`

- **text:** Kami mengumpulkan data operasional bengkel, data pelanggan (nama, nomor telepon, email, alamat), data kendaraan, riwayat transaksi penjualan/pembelian, serta log aktivitas pengguna sistem demi kepentingan kelancaran operasional YaraERP.

### `src/app/(auth)/ketentuan-layanan/page.tsx`

- **text:** Anda bertanggung jawab sepenuhnya untuk menjaga kerahasiaan kredensial login (email dan password) akun Anda. Segala bentuk aktivitas yang terjadi di bawah akun Anda merupakan tanggung jawab Anda sepenuhnya.

### `src/app/(dashboard)/aset/merek/[slug]/page.tsx`

- **text:** Model
- **text:** Belum ada model
- **text:** Nama Model

### `src/app/(dashboard)/aset/merek/_components/asset-brand-table.tsx`

- **ariaLabel:** Daftar brand aset

### `src/app/(dashboard)/crm/leads/[slug]/page.tsx`

- **label:** Email

### `src/app/(dashboard)/crm/leads/page.tsx`

- **placeholder:** Cari nama, email, atau perusahaan...

### `src/app/(dashboard)/inventaris/opname/[[...segments]]/page.tsx`

- **text:** Penyesuaian Stok (draft)

### `src/app/(dashboard)/kendaraan/[slug]/page.tsx`

- **label:** Model
- **label:** Tahun Model

### `src/app/(dashboard)/kendaraan/fitment/[slug]/page.tsx`

- **label:** Model
- **text:** Aturan yang lebih spesifik (varian &gt; model &gt; merek) menang saat pengecekan kompatibilitas.

### `src/app/(dashboard)/kendaraan/merek/[slug]/page.tsx`

- **label:** Jumlah Model
- **text:** Model
- **text:** Model di bawah merek ini. Buka satu model untuk mengelola variannya.
- **text:** Tambah Model
- **text:** Belum ada model untuk merek ini.
- **text:** Nama Model

### `src/app/(dashboard)/kendaraan/merek/page.tsx`

- **text:** Merek &amp; Model Kendaraan
- **text:** Katalog merek kendaraan. Buka satu merek untuk melihat dan mengelola model serta variannya.

### `src/app/(dashboard)/kendaraan/model/[slug]/page.tsx`

- **label:** Nama Model
- **text:** Tipe/varian model ini beserta penggerak dan transmisinya.

### `src/app/(dashboard)/kendaraan/model/[slug]/ubah/page.tsx`

- **text:** Ubah Model Kendaraan

### `src/app/(dashboard)/kendaraan/model/tambah/page.tsx`

- **text:** Tambah Model Kendaraan

### `src/app/(dashboard)/kendaraan/pelanggan/page.tsx`

- **text:** Daftar semua unit kendaraan pelanggan — cari berdasarkan plat, rangka, mesin, model, atau nama pelanggan.

### `src/app/(dashboard)/keuangan/jurnal/_components/journal-table.tsx`

- **ariaLabel:** Daftar journal

### `src/app/(dashboard)/keuangan/kas-kecil/[slug]/page.tsx`

- **label:** Nama Project
- **label:** Vendor

### `src/app/(dashboard)/keuangan/kas-kecil/_components/petty-cash-table.tsx`

- **ariaLabel:** Daftar petty cash

### `src/app/(dashboard)/keuangan/laporan-bank/page.tsx`

- **text:** Account #

### `src/app/(dashboard)/keuangan/pengeluaran/[slug]/page.tsx`

- **label:** Vendor

### `src/app/(dashboard)/laporan/analisis-harga-beli/[[...segments]]/page.tsx`

- **title:** Perbandingan Biaya Perolehan per Vendor
- **text:** Vendor

### `src/app/(dashboard)/laporan/bukti-potong-pph/[[...segments]]/page.tsx`

- **text:** Vendor
- **text:** Tidak ada tagihan vendor dengan pemotongan PPh pada periode ini

### `src/app/(dashboard)/laporan/hutang-jatuh-tempo/page.tsx`

- **text:** Vendor

### `src/app/(dashboard)/laporan/laba-rugi-tidak-terealisasi/[[...segments]]/page.tsx`

- **text:** Laporan ini memuat laba/rugi dari jurnal berstatus DRAFT — transaksi yang belum diposting. Angkanya masih dapat berubah dan belum menjadi bagian dari laporan keuangan final.

### `src/app/(dashboard)/laporan/nomor-seri-batch/[[...segments]]/page.tsx`

- **title:** Stok Nomor Seri/Batch

### `src/app/(dashboard)/laporan/pajak/[[...segments]]/page.tsx`

- **text:** Vendor

### `src/app/(dashboard)/laporan/pemenuhan-pesanan/[[...segments]]/page.tsx`

- **text:** · hanya pesanan berstatus confirmed/processing/completed yang dihitung, dan hanya surat jalan yang sudah jalan (shipped/delivered) yang mengurangi sisa.

### `src/app/(dashboard)/laporan/piutang-jatuh-tempo/page.tsx`

- **text:** No. Invoice

### `src/app/(dashboard)/laporan/ringkasan-ar-ap/page.tsx`

- **text:** Vendor

### `src/app/(dashboard)/laporan/total-hutang/page.tsx`

- **title:** Hutang per Vendor
- **text:** Vendor

### `src/app/(dashboard)/master/barang/[slug]/page.tsx`

- **title:** Batch/Lot
- **text:** No. Batch/Lot

### `src/app/(dashboard)/master/departemen/[slug]/page.tsx`

- **text:** Email

### `src/app/(dashboard)/master/gudang/[slug]/page.tsx`

- **ariaLabel:** Warehouse detail tabs

### `src/app/(dashboard)/master/jabatan/[slug]/page.tsx`

- **text:** Email

### `src/app/(dashboard)/master/karyawan/[slug]/page.tsx`

- **ariaLabel:** Employee detail tabs
- **label:** Email

### `src/app/(dashboard)/master/merek/_components/brand-table.tsx`

- **ariaLabel:** Daftar brand

### `src/app/(dashboard)/master/pelanggan/[slug]/kendaraan/[vehicleSlug]/page.tsx`

- **text:** Model

### `src/app/(dashboard)/master/pelanggan/[slug]/kendaraan/page.tsx`

- **text:** Model

### `src/app/(dashboard)/master/pelanggan/_components/customer-table.tsx`

- **ariaLabel:** Daftar customer

### `src/app/(dashboard)/master/vendor/[slug]/page.tsx`

- **ariaLabel:** Vendor detail tabs
- **label:** Email
- **text:** Belum ada purchase order
- **text:** Belum ada barang dari vendor ini

### `src/app/(dashboard)/master/vendor/[slug]/ubah/page.tsx`

- **text:** Ubah Vendor:

### `src/app/(dashboard)/master/vendor/_components/vendor-table.tsx`

- **ariaLabel:** Daftar vendor

### `src/app/(dashboard)/master/vendor/page.tsx`

- **text:** Vendor
- **text:** + Tambah Vendor

### `src/app/(dashboard)/master/vendor/tambah/page.tsx`

- **text:** Tambah Vendor

### `src/app/(dashboard)/pembelian/pembayaran-vendor/[slug]/page.tsx`

- **label:** Vendor

### `src/app/(dashboard)/pembelian/pembayaran-vendor/_components/vendor-payment-table.tsx`

- **ariaLabel:** Daftar pembayaran vendor

### `src/app/(dashboard)/pembelian/pembayaran-vendor/page.tsx`

- **text:** Pembayaran Vendor

### `src/app/(dashboard)/pembelian/pembayaran-vendor/tambah/page.tsx`

- **text:** Buat Pembayaran Vendor

### `src/app/(dashboard)/pembelian/penerimaan/[slug]/page.tsx`

- **text:** Vendor
- **text:** Tagihan Vendor

### `src/app/(dashboard)/pembelian/permintaan/[slug]/page.tsx`

- **label:** Vendor Disarankan

### `src/app/(dashboard)/pembelian/pesanan/[slug]/page.tsx`

- **label:** Vendor
- **text:** Tagihan Vendor

### `src/app/(dashboard)/pembelian/pesanan/page.tsx`

- **placeholder:** Cari no. dokumen atau vendor...

### `src/app/(dashboard)/pembelian/retur/[slug]/page.tsx`

- **label:** Vendor

### `src/app/(dashboard)/pembelian/tagihan/[slug]/page.tsx`

- **text:** Vendor

### `src/app/(dashboard)/pembelian/tagihan/_components/vendor-bill-table.tsx`

- **ariaLabel:** Daftar vendor bill

### `src/app/(dashboard)/pembelian/tagihan/page.tsx`

- **text:** Tagihan Vendor
- **placeholder:** Cari no. dokumen atau vendor...

### `src/app/(dashboard)/pembelian/tagihan/tambah/page.tsx`

- **text:** Buat Tagihan Vendor

### `src/app/(dashboard)/pembelian/transfer-pemasok/_components/vendor-transfer-panel.tsx`

- **text:** Menandai transfer tidak membuat jurnal. Untuk pembayaran berstatus draft jurnalnya memang belum ada — jurnal kas/bank baru dibuat saat pembayaran dikonfirmasi/diposting (aksi itu belum tersambung ke UI). Daftar ini hanya menandai pembayaran yang transfer banknya sudah dikirim.

### `src/app/(dashboard)/pembelian/transfer-pemasok/page.tsx`

- **text:** — termasuk yang masih berstatus draft (belum dikonfirmasi, jadi jurnalnya belum dibuat). Menandai transfer tidak membuat jurnal.

### `src/app/(dashboard)/pembelian/uang-muka/page.tsx`

- **text:** Pembayaran di muka ke pemasok. Setiap dokumen membuat satu jurnal: uang muka bertambah (aset), kas/bank berkurang. Penerapan ke tagihan vendor dilakukan manual.

### `src/app/(dashboard)/pengaturan/log-aktivitas/_components/activity-log-table.tsx`

- **placeholder:** Semua model

### `src/app/(dashboard)/pengaturan/pajak-potong/page.tsx`

- **text:** Tarif dan akun hutang pajak yang dipakai saat memotong PPh pada tagihan vendor.
- **text:** Belum ada jenis PPh. Tambahkan agar pemotongan PPh pada tagihan vendor bisa dijurnal.

### `src/app/(dashboard)/pengaturan/pengguna/[slug]/page.tsx`

- **label:** Email

### `src/app/(dashboard)/pengaturan/pengguna/page.tsx`

- **text:** Email

### `src/app/(dashboard)/pengaturan/pengguna/tambah/_components/user-create-form.tsx`

- **text:** Email
- **placeholder:** email@example.com

### `src/app/(dashboard)/pengaturan/penomoran/page.tsx`

- **label:** Vendor

### `src/app/(dashboard)/pengaturan/penyimpanan/page.tsx`

- **text:** Kredensial Cloudflare R2

### `src/app/(dashboard)/pengaturan/penyimpanan/ubah/_components/storage-form.tsx`

- **text:** Opsional. Kalau diisi, semua file diakses lewat URL ini. Cocok untuk Cloudflare CDN/R2 public domain.
- **text:** Kredensial Cloudflare R2
- **text:** Dapatkan dari dashboard Cloudflare &gt; R2 &gt; Manage API Tokens. Install dulu paket
- **text:** Account ID
- **text:** Kalau upload ke Cloudflare R2 gagal atau tidak bisa diakses, file otomatis disimpan ke server lokal supaya proses upload tetap berhasil.

### `src/app/(dashboard)/pengaturan/perusahaan/page.tsx`

- **label:** Email

### `src/app/(dashboard)/pengaturan/preferensi/page.tsx`

- **label:** Tampilkan Is Active

### `src/app/(dashboard)/pengaturan/transaksi-berulang/page.tsx`

- **text:** draft

### `src/app/(dashboard)/pengaturan/ubah/_components/settings-edit-form.tsx`

- **text:** Email
- **placeholder:** email@company.com
- **label:** Tampilkan Field Is Active
- **text:** Prefix Vendor
- **label:** Kode Otomatis Vendor
- **text:** Tagihan Vendor
- **text:** Pembayaran Vendor

### `src/app/(dashboard)/penjualan/faktur/_components/invoice-table.tsx`

- **ariaLabel:** Daftar invoice

### `src/app/(dashboard)/penjualan/penawaran/[slug]/page.tsx`

- **ariaLabel:** Quotation detail tabs

### `src/app/(dashboard)/penjualan/penawaran/_components/quotation-table.tsx`

- **ariaLabel:** Daftar quotation

### `src/app/(dashboard)/penjualan/pesanan/_components/order-table.tsx`

- **ariaLabel:** Daftar sales order

### `src/app/(dashboard)/penjualan/surat-jalan/_components/delivery-order-table.tsx`

- **ariaLabel:** Daftar delivery order

### `src/app/(dashboard)/penjualan/uang-muka/_components/down-payment-table.tsx`

- **ariaLabel:** Daftar down payment

### `src/app/(dashboard)/produksi/perintah-kerja/[slug]/_components/create-service-po-button.tsx`

- **text:** Item jasa pada perintah kerja ini akan digabung menjadi satu PO jasa (draft) tertaut ke perintah kerja. Penerimaannya tidak menggerakkan stok — biaya langsung dibebankan.
- **text:** Vendor Jasa *
- **placeholder:** Cari vendor...

### `src/app/(dashboard)/produksi/perintah-kerja/[slug]/page.tsx`

- **text:** + Sales Invoice

### `src/app/(dashboard)/produksi/production-orders/[slug]/page.tsx`

- **text:** Batch
- **text:** Serial Hasil
- **text:** Lot/Serial

### `src/app/(dashboard)/produksi/production-orders/_components/production-cost-section.tsx`

- **placeholder:** mis. tagihan vendor

### `src/app/(dashboard)/produksi/production-orders/_components/production-order-actions.tsx`

- **text:** Serial number (
- **placeholder:** Satu serial number per baris

### `src/app/(dashboard)/produksi/products/[slug]/_components/fitment-checker.tsx`

- **text:** Model
- **placeholder:** Pilih model...

### `src/app/(dashboard)/produksi/products/[slug]/page.tsx`

- **label:** Model Kendaraan

### `src/app/(dashboard)/produksi/products/_components/product-form.tsx`

- **text:** Model Kendaraan
- **placeholder:** Cari model kendaraan...

### `src/app/(dashboard)/proyek/[slug]/page.tsx`

- **text:** Belum ada invoice

### `src/app/(dashboard)/proyek/_components/project-stages.tsx`

- **text:** *Mengatur progres ke 100% akan otomatis memindahkan status tahapan ini menjadi Selesai (Completed).

### `src/app/setup/_components/setup-form.tsx`

- **text:** Email Perusahaan
- **text:** Email *

### `src/components/activity-log/detail-drawer.tsx`

- **label:** Model

### `src/components/dashboard/purchase-dashboard.tsx`

- **label:** Vendor
- **text:** Vendor
- **text:** Tagihan Vendor Terbaru
- **text:** Belum ada tagihan vendor

### `src/components/forms/asset-brand-form.tsx`

- **text:** Tipe / Model

### `src/components/forms/customer-form.tsx`

- **text:** Email
- **placeholder:** email@customer.com

### `src/components/forms/customer-vehicle-form.tsx`

- **text:** Model Kendaraan *
- **placeholder:** Cari model...

### `src/components/forms/employee-form.tsx`

- **text:** Email
- **placeholder:** email@company.com
- **text:** Karyawan dengan akun login bisa masuk ke sistem (mis. untuk absensi mandiri). Email di atas dipakai sebagai email login.
- **text:** Minimal 8 karakter. Pastikan email pada bagian atas sudah terisi.

### `src/components/forms/expense-form.tsx`

- **text:** Nama Project
- **placeholder:** Cari project...
- **text:** Vendor
- **placeholder:** Cari vendor/toko...

### `src/components/forms/goods-receipt-form.tsx`

- **text:** No. Batch/Lot

### `src/components/forms/item-form.tsx`

- **text:** Vendor *
- **placeholder:** Cari vendor...
- **text:** Lacak Batch/Lot
- **text:** Aktifkan untuk melacak nomor batch/lot dan tanggal kedaluwarsa

### `src/components/forms/lead-form.tsx`

- **text:** Email
- **placeholder:** email@example.com

### `src/components/forms/petty-cash-form.tsx`

- **text:** Nama Project
- **placeholder:** Cari project...
- **text:** Vendor
- **placeholder:** Cari vendor/toko...

### `src/components/forms/profile-form.tsx`

- **text:** Email
- **text:** Ubah Password
- **text:** Password Lama
- **text:** Password Baru

### `src/components/forms/purchase-order-form.tsx`

- **text:** Item &amp; vendor di bawah terisi dari permintaan ini (vendor masih bisa diganti). Setelah PO disimpan, permintaan otomatis ditandai dipesan.
- **text:** Vendor *
- **placeholder:** Cari vendor...
- **text:** Pakai termin vendor
- **text:** Otomatis dari vendor:

### `src/components/forms/purchase-request-form.tsx`

- **text:** Vendor yang Disarankan
- **placeholder:** Cari vendor (opsional)...
- **text:** Opsional. Dipakai untuk mengisi vendor saat permintaan ini dibuatkan pesanan pembelian.

### `src/components/forms/purchase-return-form.tsx`

- **placeholder:** Alasan pengembalian barang ke vendor...

### `src/components/forms/recurring-transaction-form.tsx`

- **text:** Jurnal Umum (draft)
- **text:** Beban (draft)

### `src/components/forms/ticket-form.tsx`

- **text:** Email Pelanggan
- **placeholder:** email@example.com

### `src/components/forms/vehicle-fitment-form.tsx`

- **text:** Model
- **placeholder:** Semua model...

### `src/components/forms/vehicle-form.tsx`

- **text:** Model
- **text:** Tahun Model

### `src/components/forms/vehicle-model-form.tsx`

- **text:** Nama Model *

### `src/components/forms/vehicle-variant-manager.tsx`

- **text:** Daftar tipe/varian untuk model ini. Contoh: 2.4 VRZ GR Sport, penggerak 4x2, transmisi AT.

### `src/components/forms/vendor-bill-form.tsx`

- **text:** Vendor *
- **placeholder:** Cari vendor...
- **text:** No. Faktur Vendor
- **placeholder:** No. faktur dari vendor
- **text:** Dibayarkan ke vendor:

### `src/components/forms/vendor-form.tsx`

- **text:** ID Vendor
- **text:** Nama Vendor *
- **placeholder:** Nama vendor
- **text:** Email
- **placeholder:** email@vendor.com

### `src/components/forms/vendor-payment-form.tsx`

- **text:** Vendor *
- **placeholder:** Cari vendor...
- **text:** Belum dipilih tagihan. Pembayaran akan otomatis dialokasikan ke tagihan tertua vendor ini saat dikonfirmasi.

### `src/components/forms/withholding-tax-type-form.tsx`

- **text:** Wajib diisi bila PPh ini dipotong dari tagihan vendor — jurnal pemotongan mengkredit akun ini.

### `src/components/login-form.tsx`

- **text:** Masuk dengan email dan password Anda
- **text:** Email

## Metode

Audit ini hanya menangkap string literal yang berada di permukaan JSX dan atribut UI. Ia tidak menjamin semua teks dinamis, pesan dari basis data, atau keluaran pustaka pihak ketiga sudah tercakup.
