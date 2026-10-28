# BUSINESS RULES --- ERP ISF

**Status:** Baseline; keputusan bertanda OPEN memerlukan persetujuan
Product Owner.\
Dokumen ini menjadi indeks aturan bisnis resmi. Definisi aturan berada
di sini; dokumen modul boleh merujuk ID, bukan membuat definisi yang
bertentangan.

## 1. Aturan global

-   **GL-BR-001 --- Draft isolation:** draft tidak memengaruhi saldo
    stok, kas, hutang, piutang, atau payroll yang telah diposting.
-   **GL-BR-002 --- Atomic posting:** perubahan satu transaksi yang
    saling terkait berhasil seluruhnya atau gagal seluruhnya.
-   **GL-BR-003 --- Immutable posted records:** transaksi posted tidak
    boleh dihapus atau diedit bebas; koreksi harus dapat ditelusuri.
-   **GL-BR-004 --- Idempotency:** retry/request duplikat tidak boleh
    menggandakan efek bisnis.
-   **GL-BR-005 --- Auditability:** aksi penting menyimpan aktor, waktu,
    referensi, dan alasan jika relevan.
-   **GL-BR-006 --- Server authorization:** permission selalu diperiksa
    di backend.
-   **GL-BR-007 --- Document numbering:** nomor final unik dan tidak
    digunakan kembali.
-   **GL-BR-008 --- Financial precision:** nilai uang menggunakan tipe
    decimal/fixed precision.
-   **GL-BR-009 --- No silent assumptions:** aturan berstatus OPEN harus
    diangkat sebagai blocker atau opsi keputusan.

## 2. Inventory

-   **INV-BR-001:** stok penjualan berkurang ketika faktur penjualan
    diposting.
-   **INV-BR-002:** saldo stok lama diselesaikan melalui stocktake
    bertahap dan adjustment dengan approval.
-   **INV-BR-003:** remnant layak pakai bisa dipakai kembali.
-   **INV-BR-004:** scrap dipisahkan dari remnant reusable.
-   **INV-BR-005:** setiap perubahan stok menghasilkan ledger entry
    dengan referensi sumber.
-   **INV-BR-006:** posting stok atomik.
-   **INV-BR-007 \[OPEN\]:** negative stock dilarang secara default;
    pengecualian harus disetujui eksplisit.
-   **INV-BR-008:** transfer lokasi mengurangi lokasi asal dan menambah
    lokasi tujuan secara atomik.
-   **INV-BR-009:** draft/gagal tidak mengubah saldo.
-   **INV-BR-010:** transaksi posted dikoreksi melalui
    reversal/retur/adjustment.
-   **INV-BR-011:** adjustment menyimpan alasan, pengusul, approver,
    waktu, dan selisih.
-   **INV-BR-012:** posting ulang tidak menciptakan movement ganda.
-   **INV-BR-013:** ledger tidak dapat dihapus oleh pengguna
    operasional.
-   **INV-BR-014:** material proyek/work order mengacu pada proyek/work
    order.
-   **INV-BR-015:** material kembali harus diklasifikasikan sebagai
    reusable, remnant, atau scrap.

## 3. Purchasing

-   **PUR-BR-001:** penerimaan barang yang diposting menambah stok
    sesuai kuantitas yang diterima/disetujui.
-   **PUR-BR-002:** PO tidak menambah stok.
-   **PUR-BR-003:** penerimaan parsial mencatat dipesan, diterima, dan
    sisa.
-   **PUR-BR-004 \[OPEN\]:** penerimaan melebihi PO ditolak kecuali
    kebijakan dan approval mengizinkan.
-   **PUR-BR-005:** tagihan supplier berbeda dari pembayaran.
-   **PUR-BR-006:** pembayaran posted mengurangi saldo hutang sesuai
    alokasi.
-   **PUR-BR-007:** status lunas dihitung dari outstanding, bukan input
    bebas.
-   **PUR-BR-008 \[OPEN\]:** ongkir dialokasikan sebagai landed cost
    atau biaya periode berdasarkan kebijakan yang disetujui.
-   **PUR-BR-009:** retur mengacu ke dokumen asal jika tersedia dan
    menangani efek stok/finansial.
-   **PUR-BR-010:** dokumen posted tidak dihapus fisik.
-   **PUR-BR-011:** tagihan dan pembayaran memiliki alokasi yang jelas.
-   **PUR-BR-012:** laporan membedakan PO, penerimaan, tagihan,
    pembayaran, dan outstanding.

## 4. Sales

-   **SAL-BR-001:** quotation tidak memengaruhi stok/piutang posted.
-   **SAL-BR-002:** faktur draft tidak mengubah saldo stok/piutang
    posted.
-   **SAL-BR-003:** faktur penjualan posted mengurangi stok untuk baris
    stock item yang relevan.
-   **SAL-BR-004:** model akunting DP tertutup-terverifikasi oleh
    kode. Saat DP dikonfirmasi, penerimaan dicatat lebih dulu oleh
    `onDownPaymentReceived` dalam transaksi yang sama dengan
    konfirmasi (`src/actions/sales.actions.ts:980-981`): jurnal
    `POSTED` lahir lewat `tx.journal.create`
    (`src/lib/hooks/accounting.hook.ts:2498-2519`) dengan baris dari
    `buildDownPaymentReceiptLines`
    (`src/lib/tax/down-payment-vat.ts:261-278`) — debit akun kas/bank
    (`cashBankAccountId`) sebesar amount penuh, kredit akun kewajiban
    Uang Muka Penjualan 210102 (`customerDownPaymentAccountId`)
    sebesar amount, atau neto PPN bila DP terutang PPN (sisa kredit
    ke PPN Keluaran 210201). Akun kas/bank atau 210102 belum
    terkonfigurasi = gagal tertutup
    (`src/lib/hooks/accounting.hook.ts:2382-2387,2491-2496`).
    DP bukan piutang dan bukan pendapatan saat diterima: kredit ke
    210102, bukan Piutang (`src/lib/hooks/accounting.hook.ts:2378-2381`).
    Alokasi DP ke faktur adalah reklas, bukan kas baru: Dr 210102 /
    Cr Piutang — jalur faktur-sudah-ada
    `src/lib/hooks/down-payment.hook.ts:219-240` dan jalur konversi
    awal `src/lib/hooks/down-payment.hook.ts:756-775`; tanpa jurnal
    kas kedua (`src/lib/hooks/down-payment.hook.ts:685-688`).
    Sisa OPEN tunggal: perilaku reversal/pembatalan pembayaran DP
    setelah konversi terjadi (ADR-003); refund kelebihan DP lewat
    kredit pelanggan adalah jalur terpisah, bukan reversal DP
    terkonversi.
-   **SAL-BR-005:** pembayaran DP valid mencapai ambang persen kategori
    pelanggan yang tersnapshot pada quotation (bawaan aman 50% bila
    snapshot tak sah) memicu konversi quotation menjadi faktur sesuai
    definisi yang disetujui.
-   **SAL-BR-006:** hanya pembayaran posted yang memenuhi syarat
    dihitung untuk ambang DP.
-   **SAL-BR-007:** konversi DP idempotent; tidak membuat faktur ganda.
-   **SAL-BR-008:** faktur hasil konversi menyimpan referensi quotation
    dan pembayaran pemicu.
-   **SAL-BR-009:** faktur posted dikoreksi lewat proses terkontrol.
-   **SAL-BR-010:** pembayaran parsial mengurangi piutang sesuai
    alokasi.
-   **SAL-BR-011:** status lunas dihitung dari outstanding.
-   **SAL-BR-012:** retur/credit note mempertahankan histori faktur
    asal.
-   **SAL-BR-013:** jasa/non-stock tidak mengurangi stok kecuali
    memiliki baris material.
-   **SAL-BR-014:** penjualan barang dan material proyek tidak boleh
    menghasilkan pengurangan stok ganda.
-   **SAL-BR-015:** basis ambang tertutup-terverifikasi: ambang dihitung
    dari `grandTotal` quotation (sudah termasuk komponen diskon/pajak
    yang membentuk `grandTotal`; tidak ada basis DPP terpisah), dan
    faktur hasil adalah faktur penuh yang lahir sebagai DRAFT. Persen
    ambang mengikuti SAL-BR-005. Sisa OPEN: tidak ada untuk basis/tipe
    faktur; perilaku reversal DP sesudah konversi tetap OPEN di ADR-003.

## 5. Finance

-   **FIN-BR-001:** hutang berasal dari vendor bill valid.
-   **FIN-BR-002:** piutang berasal dari faktur posted.
-   **FIN-BR-003:** pembayaran dan tagihan adalah entitas berbeda.
-   **FIN-BR-004:** pembayaran dapat dialokasikan sesuai aturan ke
    satu/lebih dokumen.
-   **FIN-BR-005:** outstanding dihitung dari dokumen dan alokasi valid.
-   **FIN-BR-006:** status lunas mengikuti outstanding dan toleransi
    pembulatan yang disetujui.
-   **FIN-BR-007:** pembayaran draft/gagal tidak mengurangi saldo.
-   **FIN-BR-008:** reversal pembayaran mempertahankan histori asli.
-   **FIN-BR-009:** aging memakai tanggal acuan dan due date konsisten.
-   **FIN-BR-010 [TERTUTUP-terverifikasi]:** double-entry general
    ledger dan laporan formal adalah scope — tertutup oleh ADR-006 +
    vonis Accountant kartu t_9e202412 (28 Okt 2026, butir 1). Bukti:
    `JournalService.createJournal` menolak jurnal tak balance, status
    lahir `POSTED` (`src/lib/services/journal.service.ts:57-71,73-84,100-140`);
    `Journal`/`JournalEntry` (`prisma/schema.prisma:4221-4272`); period
    lock `assertPeriodOpen` (`src/lib/services/period-lock.service.ts:20-47`).
    Sejalan KEPUTUSAN-TERVERIFIKASI.md butir 6.

## 6. Projects & work orders

-   **PROJ-BR-001:** material issue mengacu pada proyek dan/atau work
    order.
-   **PROJ-BR-002:** modul proyek tidak mengubah saldo stok langsung;
    gunakan kontrak Inventory.
-   **PROJ-BR-003:** material return diverifikasi dan diklasifikasikan.
-   **PROJ-BR-004:** estimasi biaya dipisahkan dari biaya aktual.
-   **PROJ-BR-005:** biaya aktual bersumber dari transaksi yang dapat
    ditelusuri.
-   **PROJ-BR-006:** perubahan scope/budget setelah approval menyimpan
    histori dan dapat memerlukan approval.
-   **PROJ-BR-007:** penutupan proyek tidak menghilangkan histori.
-   **PROJ-BR-008 \[OPEN\]:** definisi margin, overhead, tenaga kerja,
    dan basis pengakuan biaya harus disetujui.
-   **WO-BR-001:** material rencana tidak mengurangi stok.
-   **WO-BR-002:** material aktual mengurangi stok saat issue diposting.
-   **WO-BR-003:** jam kerja belum disetujui tidak masuk costing/payroll
    final jika kebijakan mensyaratkan approval.
-   **WO-BR-004:** issue yang diulang tidak menggandakan pengeluaran.

## 7. HR & Payroll

-   **HR-BR-001:** payroll selalu terikat pada periode yang eksplisit.
-   **HR-BR-002:** payroll draft bukan pembayaran final.
-   **HR-BR-003 \[OPEN\]:** formula lembur/tarif/pembulatan harus
    disetujui.
-   **HR-BR-004:** potongan pinjaman tidak melebihi saldo pinjaman dan
    batas kebijakan.
-   **HR-BR-005:** payroll posted dikoreksi melalui proses yang dapat
    diaudit.
-   **HR-BR-006:** akses payroll dibatasi.
-   **HR-BR-007:** cuti menyimpan pemohon, approver, periode, dan
    status.
-   **HR-BR-008:** rincian payroll dapat ditelusuri ke sumber
    perhitungan.

## 8. Keputusan terbuka wajib

1.  Metode valuasi stok.
2.  Negative stock dan override.
3.  Ongkir dan landed cost.
4.  Reversal/pembatalan pembayaran DP setelah konversi quotation terjadi (sisa OPEN tunggal DP; detail konversi lain tertutup-terverifikasi — lihat SAL-BR-004, SAL-BR-005, SAL-BR-015, ADR-007).
5.  Retur pembelian/penjualan dan credit note.
6.  Double-entry accounting.
7.  Nomor dokumen.
8.  Remnant/scrap dan costing.
9.  Approval matrix.
10. Formula payroll/lembur/cuti/pinjaman.
11. Costing tenaga kerja/overhead proyek.
12. Pajak/BPJS, target performa, backup, RPO/RTO.
