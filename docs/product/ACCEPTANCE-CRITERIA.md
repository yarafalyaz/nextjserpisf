# ACCEPTANCE CRITERIA --- ERP ISF

Dokumen ini adalah indeks kriteria penerimaan. Detail aturan bisnis
resmi ada di `BUSINESS-RULES.md`; jangan menduplikasi definisi dengan
makna berbeda.

## 1. Global

-   **AC-GL-001:** Draft tidak memengaruhi saldo posted.
-   **AC-GL-002:** Kegagalan posting tidak meninggalkan perubahan
    parsial.
-   **AC-GL-003:** Retry posting tidak menggandakan efek.
-   **AC-GL-004:** Semua aksi sensitif memvalidasi permission di
    backend.
-   **AC-GL-005:** Transaksi posted dikoreksi melalui proses terkontrol
    dan audit.
-   **AC-GL-006:** Nilai uang disimpan/dihitung dengan precision yang
    tepat.

## 2. Inventory

-   **AC-INV-001:** Receipt draft tidak mengubah stok.
-   **AC-INV-002:** Receipt posted membuat movement/ledger tepat satu
    kali.
-   **AC-INV-003:** Invoice posted mengurangi stok item stock tepat satu
    kali.
-   **AC-INV-004:** Transfer mengurangi lokasi asal dan menambah lokasi
    tujuan secara atomik.
-   **AC-INV-005:** Adjustment belum approved tidak mengubah saldo.
-   **AC-INV-006:** Adjustment posted mencatat alasan, approver, aktor,
    dan ledger.
-   **AC-INV-007:** Negative stock mengikuti policy yang disetujui,
    termasuk concurrency.
-   **AC-INV-008:** Remnant dan scrap dapat dibedakan dan ditelusuri.
-   **AC-INV-009:** Ledger menautkan setiap movement ke dokumen sumber.

## 3. Purchasing

-   **AC-PUR-001:** PO tidak mengubah saldo stok.
-   **AC-PUR-002:** Receipt parsial menampilkan kuantitas dipesan,
    diterima, dan sisa.
-   **AC-PUR-003:** Vendor bill dan payment merupakan dokumen berbeda.
-   **AC-PUR-004:** Pembayaran parsial memperbarui outstanding sesuai
    alokasi.
-   **AC-PUR-005:** Duplicate payment posting tidak menggandakan efek.
-   **AC-PUR-006:** Laporan supplier dapat ditelusuri ke PO, receipt,
    bill, dan payment.

## 4. Sales

-   **AC-SAL-001:** Quotation tidak memengaruhi saldo posted.
-   **AC-SAL-002:** DP draft/gagal tidak dihitung pada threshold 50%.
-   **AC-SAL-003:** DP posted mencapai threshold memicu konversi tepat
    satu kali sesuai keputusan final.
-   **AC-SAL-004:** Invoice posted mengurangi stok hanya untuk baris
    stock yang relevan.
-   **AC-SAL-005:** Pembayaran parsial/penuh menghasilkan outstanding
    yang benar.
-   **AC-SAL-006:** Retur/koreksi mempertahankan histori invoice asal.

## 5. Projects & work orders

-   **AC-PROJ-001:** Material issue mempunyai referensi project/work
    order.
-   **AC-PROJ-002:** Material issue mengurangi stok melalui Inventory,
    bukan direct update.
-   **AC-PROJ-003:** Estimasi dan biaya aktual ditampilkan terpisah.
-   **AC-PROJ-004:** Biaya aktual dapat ditelusuri ke sumber.
-   **AC-WO-001:** Material rencana tidak mengubah stok.
-   **AC-WO-002:** Issue/return aktual tercatat di inventory dan
    project.
-   **AC-WO-003:** Jam kerja mengikuti approval policy.

## 6. Finance dan HR

-   **AC-FIN-001:** Hutang/piutang dapat ditelusuri ke bill/invoice dan
    alokasi payment.
-   **AC-FIN-002:** Reversal mempertahankan transaksi asal dan alasan.
-   **AC-HR-001:** Payroll memperlihatkan rincian komponen.
-   **AC-HR-002:** Payroll tidak dapat diposting dua kali.
-   **AC-HR-003:** Potongan pinjaman tidak melebihi saldo/policy.
-   **AC-HR-004:** Payroll hanya dapat dilihat oleh role berwenang.

## 7. Reporting & export

-   **AC-REP-001:** Total report sesuai definisi query sumber.
-   **AC-REP-002:** Filter periode menggunakan timezone bisnis secara
    konsisten.
-   **AC-REP-003:** Export menyertakan judul, periode/filter, waktu
    pembuatan WIB, dan identitas perusahaan bila tersedia.
-   **AC-REP-004:** Export mematuhi permission dan tidak bisa diakses
    tanpa otorisasi.

## 8. Release gates

Release tidak boleh dilakukan jika test P0 gagal, terdapat akses tidak
sah pada data sensitif, posting dapat menggandakan efek, saldo tidak
dapat direkonsiliasi, atau migration/restore belum diverifikasi.
