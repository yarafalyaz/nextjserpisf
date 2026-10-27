# PRD --- ERP Ironsmith Fabrication (ISF)

**Versi:** 1.0.0 · **Status:** Draft baseline · **Tanggal:** 27 Oktober
2026\
**Bahasa:** Indonesia · **Mata uang:** IDR · **Zona waktu bisnis:**
Asia/Jakarta\
**Target awal:** ERP internal single-tenant untuk bisnis custom vehicle
fabrication dan spare part.

## 1. Ringkasan produk

ERP ISF menyatukan master data, inventory, purchasing, sales/CRM,
hutang/piutang, proyek kendaraan, work order, HR/payroll, reporting,
approval, dan audit. Tujuan utamanya adalah membuat transaksi
operasional dapat ditelusuri, menjaga integritas stok/keuangan, dan
menyediakan laporan yang konsisten.

## 2. Tujuan

-   Menjadi sumber data operasional utama ISF.
-   Menjaga stok dan histori pergerakan barang tetap akurat.
-   Menghubungkan pembelian, penerimaan, tagihan supplier, dan
    pembayaran.
-   Menghubungkan quotation, DP, faktur, pembayaran, dan piutang.
-   Menghubungkan proyek/work order dengan material dan biaya aktual.
-   Memisahkan remnant yang dapat dipakai ulang dari scrap.
-   Menyediakan approval, audit trail, dan laporan yang dapat
    ditelusuri.

## 3. Pengguna

Owner/Super Admin, Administrator, Sales, Purchasing, Warehouse,
Finance/Accounting, Project Manager, Technician/Fabricator, HR/Payroll,
Auditor/Read-only. Permission harus ditegakkan di backend, bukan hanya
dengan menyembunyikan tombol UI.

## 4. Scope modul

1.  Dashboard dan notifikasi.
2.  Identity, user, role, permission, company settings.
3.  Master data: item/SKU, kategori, brand, unit, lokasi/rak, supplier,
    customer, karyawan.
4.  Inventory: receipt, issue, transfer, ledger, adjustment, stock
    opname, remnant, scrap, retur.
5.  Purchasing: PO, penerimaan, vendor bill, hutang, pembayaran, ongkir,
    retur.
6.  Sales/CRM: customer, quotation, DP, faktur, pembayaran, piutang,
    retur/koreksi.
7.  Projects: proyek kendaraan, scope, estimasi, budget, biaya aktual,
    material, tenaga kerja.
8.  Work Orders: tugas bengkel, assignment, material, waktu kerja,
    status, QC.
9.  Finance: hutang, piutang, penerimaan/pembayaran, kas/bank dan
    laporan dasar.
10. HR/Payroll: karyawan, payroll mingguan/bulanan, lembur,
    pinjaman/potongan, cuti.
11. Reporting dan ekspor PDF/Excel.
12. Approval workflow, audit trail, import/migrasi, dan API internal.

## 5. Out of scope baseline

Multi-tenant SaaS, payment gateway/QRIS, integrasi bank otomatis,
marketplace, e-Faktur/pajak lengkap, mobile native app, barcode sebagai
persyaratan wajib, MRP manufaktur kompleks, GPS/fleet management,
offline sync, dan posting finansial otonom oleh AI belum termasuk
kecuali disetujui secara eksplisit.

## 6. Aturan bisnis global

-   Draft tidak mengubah saldo stok atau saldo finansial yang sudah
    diposting.
-   Posting adalah tindakan eksplisit, tervalidasi, atomik, dan dapat
    diaudit.
-   Dokumen posted tidak diedit/hapus bebas; koreksi melalui reversal,
    retur, credit note, atau adjustment.
-   Operasi posting harus idempotent atau memiliki proteksi duplikasi.
-   Semua perubahan stok harus melewati kontrak Inventory dan
    menghasilkan ledger.
-   Semua operasi terlindungi memvalidasi permission di backend.
-   Gunakan decimal/fixed precision untuk uang; jangan gunakan floating
    point untuk nilai uang.
-   Nomor dokumen final unik dan tidak digunakan kembali.
-   Bahasa UI Bahasa Indonesia, format Rupiah, tanggal Indonesia, zona
    waktu bisnis WIB.

## 7. Aturan bisnis ISF yang sudah diketahui

-   **INV-BR-001:** Stok penjualan berkurang ketika faktur diposting,
    bukan saat draft dibuat.
-   **INV-BR-002:** Saldo stok lama diselesaikan melalui stocktake
    bertahap dan adjustment ber-approval.
-   **INV-BR-003:** Remnant yang masih layak pakai dapat digunakan
    kembali.
-   **INV-BR-004:** Scrap dipisahkan dari remnant reusable.
-   **SAL-BR-005:** DP yang valid mencapai 50% memicu konversi quotation
    menjadi faktur secara otomatis. Detail tipe faktur dan basis
    perhitungan harus disetujui sebelum implementasi.
-   Semua transaksi stok/keuangan penting harus dapat ditelusuri ke
    dokumen sumber.

## 8. Non-functional requirements

-   Permission backend, audit trail, transaksi atomik,
    retry/idempotency, validasi server-side.
-   Pagination/filter/sort server-side untuk tabel besar.
-   Backup dan restore terdokumentasi dan diuji.
-   Loading, empty, error, success, dan forbidden states tersedia pada
    alur utama.
-   Target performa p95, RPO/RTO, retensi, dan skala data ditentukan
    setelah lingkungan deployment diketahui.

## 9. Acceptance criteria tingkat produk

-   Draft tidak memengaruhi saldo.
-   Posting gagal tidak meninggalkan perubahan parsial.
-   Posting ulang tidak menggandakan movement/pembayaran/faktur.
-   Stock ledger memiliki referensi transaksi.
-   Adjustment mengikuti approval yang ditetapkan.
-   Hutang/piutang dapat direkonsiliasi ke dokumen dan pembayaran.
-   Pemakaian material proyek terhubung ke inventory dan costing.
-   Report/export mengikuti permission dan filter.
-   Automated tests, typecheck, lint, build, dan pemeriksaan keamanan
    yang disepakati lulus.

## 10. Tahapan implementasi yang disarankan

0.  Audit repository dan tutup keputusan bisnis kritis.
1.  Fondasi: auth, permission, audit, master data, CI/test.
2.  Inventory dan purchasing.
3.  Sales dan finance.
4.  Projects dan work orders.
5.  HR/payroll.
6.  Migrasi, security/performance hardening, UAT, backup/restore,
    go-live.

## 11. Keputusan terbuka

-   Stack/ORM/database/auth yang benar-benar digunakan di repository.
-   Metode valuasi stok.
-   Kebijakan negative stock.
-   Perlakuan ongkir: biaya periode atau landed cost.
-   DP 50% menghasilkan faktur penuh atau faktur DP/progress.
-   Scope accounting: pencatatan dasar atau double-entry lengkap.
-   Kebijakan retur, approval, nomor dokumen, remnant/scrap.
-   Formula payroll/lembur/cuti/pinjaman.
-   Costing tenaga kerja dan overhead proyek.
-   Pajak/BPJS, backup/restore, RPO/RTO, dan target performa.

## 12. Aturan perubahan

Setiap perubahan scope/aturan bisnis harus memiliki owner, alasan,
dampak modul, requirement ID, acceptance criteria, dan pembaruan dokumen
terkait. Keputusan yang belum disetujui tidak boleh diasumsikan oleh
developer atau AI agent.
