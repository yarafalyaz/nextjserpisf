# ADR-006: Model Accounting — Double-Entry General Ledger

-   **Status:** Diusulkan-terverifikasi-kode
-   **Tanggal:** 28 Oktober 2026
-   **Konteks:** `BUSINESS-RULES.md` FIN-BR-010 dan `PRD.md` §11
    menyisakan scope accounting sebagai `[OPEN]` ("pencatatan dasar atau
    double-entry lengkap"). Repo aktif
    (commit `275b9596038608f7ce4c29fcb82e7c7cecd709f0`) sudah menjalankan
    general ledger double-entry penuh.
-   **Keputusan yang diusulkan:** Tetapkan scope accounting ERP ISF
    sebagai **double-entry general ledger lengkap** sesuai perilaku
    berjalan di bawah, dan tutup FIN-BR-010.

## Perilaku terverifikasi

1.  **Validasi balance wajib.** `JournalService.createJournal` menolak
    jurnal tanpa baris, menolak total debit ≠ kredit (toleransi 0,001),
    menolak baris bernilai negatif, baris nol, dan baris yang memiliki
    debit sekaligus kredit. Jurnal lahir langsung berstatus `POSTED`
    dalam transaksi berisolasi Serializable.
    `src/lib/services/journal.service.ts:51-71,73-84,86-126,138-140`
2.  **Chart of accounts nyata.** Model `Account` berkode unik, bertipe,
    berhierarki (parent/children), dengan `normalBalance` dan grup
    laporan; baris jurnal merujuk akun + pusat biaya/laba.
    `prisma/schema.prisma:1120-1147`, `prisma/schema.prisma:4254-4272`
3.  **Header jurnal terlindungi.** `Journal.journalNumber @unique`;
    kolom generated `activeReferenceKey` unik untuk jurnal aktif,
    mencegah dua jurnal aktif untuk referensi sumber yang sama.
    `prisma/schema.prisma:4221-4251`
4.  **Reversal terkendali.** Reversal membuat jurnal lawan (debit/kredit
    ditukar, tanggal mengikuti jurnal asal) dan menandai asal `REVERSED`.
    Jurnal non-POSTED, jurnal yang sudah punya lawan, jurnal lawan itu
    sendiri, dan jurnal penutup tahun lewat jalur umum semuanya ditolak.
    `src/lib/services/journal.service.ts:34-46,147-190,192-235`
5.  **Period lock.** Tanggal kunci `SystemSetting.periodLockDate`
    (`prisma/schema.prisma:144`) menolak posting/edit/reversal bertanggal
    pada atau sebelum tanggal kunci; di dalam transaksi pemanggil tanggal
    kunci dibaca `FOR UPDATE` sehingga tutup periode tidak dapat menyelip
    di antara cek dan tulis (TOCTOU).
    `src/lib/services/period-lock.service.ts:6-18,20-47`
6.  **Jurnal lahir dari domain, bukan hanya entri manual.** Hook
    penerimaan (landed cost), penjualan (pendapatan/HPP), material issue,
    retur, down payment, dan payroll memanggil jalur jurnal yang sama,
    sehingga subledger stok/AR/AP dapat direkonsiliasi ke GL.
    Contoh: `src/lib/hooks/goods-receipt.hook.ts:434-441,570`;
    `src/lib/services/stock-journal.service.ts:132-205`;
    `src/lib/hooks/down-payment.hook.ts:707-719`.

## Konsekuensi

-   Laporan keuangan formal (neraca saldo dan turunannya) adalah scope
    resmi, bukan tambahan opsional; `DATA-MODEL.md` bagian 7 yang masih
    menulis chart of accounts/jurnal sebagai "hanya jika dipilih" sudah
    tidak sesuai fakta.
-   Koreksi transaksi posted berjalan lewat reversal/retur/jurnal
    koreksi; pengeditan bebas jurnal posted bertentangan dengan model ini.
-   Setiap fitur baru yang menimbulkan efek finansial wajib memasang
    jurnal lewat titik hook/domain yang ada dan lolos gerbang
    `assertPeriodOpen`.

## Alternatif yang ditolak oleh fakta

Pencatatan dasar (kas masuk/keluar tanpa jurnal berpasangan) — tidak
sesuai kode: jurnal tak balance tidak dapat disimpan sama sekali
(`src/lib/services/journal.service.ts:62-71`).

## Status penerimaan

Belum diterima owner. Status `Diusulkan-terverifikasi-kode` berarti isi
cocok dengan kode pada commit di atas; penerimaan formal tetap keputusan
owner.
