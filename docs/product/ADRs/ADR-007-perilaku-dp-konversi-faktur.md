# ADR-007: Perilaku Down Payment dan Konversi Quotation Menjadi Faktur

-   **Status:** Diusulkan-terverifikasi-kode
-   **Tanggal:** 28 Oktober 2026
-   **Konteks:** ADR-003 (`Proposed — business decision incomplete`)
    menyisakan empat pertanyaan tentang konversi quotation saat DP
    mencapai ambang: (1) tipe faktur hasil, (2) basis perhitungan ambang,
    (3) perilaku revisi quotation setelah DP, (4) perilaku reversal
    pembayaran setelah konversi. Repo aktif
    (commit `275b9596038608f7ce4c29fcb82e7c7cecd709f0`) sudah menentukan
    perilaku untuk pertanyaan 1–3. ADR ini memisahkannya dari ADR-003:
    bagian yang sudah ditentukan kode ditutup di sini; pertanyaan 4 tetap
    OPEN dan tetap menjadi isi ADR-003.
-   **Keputusan yang diusulkan:** Tetapkan perilaku berjalan berikut
    sebagai aturan resmi DP.

## Perilaku terverifikasi (pertanyaan 1–3 ADR-003)

### 1. Tipe faktur: faktur penuh, lahir sebagai DRAFT

Saat ambang tercapai, sistem membuat satu `SalesInvoice` senilai penuh
`quotation.grandTotal` (bukan faktur DP dan bukan faktur progress),
berstatus `draft` dan **tanpa nomor dokumen** — nomor resmi diterbitkan
saat posting manual. Pembuatan faktur tidak memposting stok, pendapatan,
atau HPP; itu terjadi di jalur posting faktur.

-   `src/lib/hooks/down-payment.hook.ts:617-669` (komentar desain
    `:618-625`, pembuatan `:646-669`)
-   Faktur hasil menyimpan relasi ke quotation dan pesanan penjualan:
    `salesOrderId` dan `quotationId` di `src/lib/hooks/down-payment.hook.ts:653-655`.

### 2. Basis ambang: total DP terverifikasi terhadap grandTotal quotation

-   Hanya DP berstatus `CONFIRMED` yang dihitung (bukan draft/cancelled);
    penjumlahan dalam sen integer (`Math.round(amount × 100)`) untuk
    menghindari drift float.
    `src/lib/hooks/down-payment.hook.ts:619-635`
-   Ambang = `ceil(grandTotal quotation × persen / 100)` sen.
    `src/lib/sales/invoice-threshold.ts:51-54`
-   Persen dibaca dari snapshot `Quotation.invoiceThresholdPercent`, yang
    disalin dari `CustomerCategory.downPaymentPercent` ketika quotation
    dibuat; mengubah master kategori sesudahnya tidak mengubah quotation
    berjalan. Snapshot kosong/korup fail-closed ke default **50**.
    `src/lib/sales/invoice-threshold.ts:4-15,17,38-49`;
    `prisma/schema.prisma:542,1515-1518`;
    `src/actions/sales.actions.ts:209-211,261`
-   Karena basisnya `grandTotal` quotation, ambang dihitung dari nilai
    akhir dokumen itu (sesudah komponen diskon/pajak yang membentuk
    `grandTotal`); tidak ada basis DPP terpisah.
-   Konversi idempoten dan terserialisasi: baris DP dan quotation dikunci
    `FOR UPDATE`, konfirmasi ulang DP yang sama dihentikan diam-diam,
    dan faktur yang sudah ada (non-cancelled) mencegah pembuatan kedua.
    `src/lib/hooks/down-payment.hook.ts:69-115,118-129`
-   Semua DP terverifikasi yang belum teralokasi dialokasikan ke faktur
    hasil (bukan hanya DP pemicu), dengan jurnal reklas
    Dr 210102 (uang muka) / Cr Piutang per DP; akun belum terpetakan =
    gagal tertutup. Kelebihan DP di atas nilai faktur dicatat sebagai
    saldo yang dapat dipakai ulang/direfund, bukan dialokasikan diam-diam.
    `src/lib/hooks/down-payment.hook.ts:685-719,272,797`
-   DP sendiri dicatat sebagai kewajiban uang muka dengan snapshot PPN
    faktur pajak uang muka yang dibekukan saat konfirmasi; edit master
    pajak sesudahnya tidak mengubah snapshot.
    `prisma/schema.prisma:1619-1647`;
    `src/lib/services/tax-invoice.service.ts:301`

### 3. Revisi quotation setelah DP

Revisi sesudah konversi tidak menulis ulang faktur hasil secara diam-diam:

-   Revisi menaikkan nilai: faktur **selisih** terpisah diterbitkan dari
    kandidat selisih revisi. `src/actions/sales.actions.ts:1463-1594`
-   Revisi menurunkan nilai di bawah yang sudah tertagih/terikat DP:
    selisih menjadi `CustomerCredit` pasif (tanpa jurnal saat lahir;
    jurnal hanya saat alokasi/refund).
    `src/actions/sales.actions.ts:1704-1777`

## Yang tetap OPEN (tetap milik ADR-003)

**Perilaku reversal/pembatalan pembayaran DP setelah konversi terjadi**
tidak ditemukan di kode: `src/lib/hooks/down-payment.hook.ts` tidak
memuat jalur reversal DP (yang ada hanya pengecualian faktur cancelled
dan penanganan kelebihan DP). Sampai owner memutuskan, tidak ada pihak
yang boleh mengasumsikan DP terkonversi dapat direversal, dan dokumen apa
yang menampung pembalikannya. ADR-003 tetap `Proposed` untuk pertanyaan
tunggal ini.

## Konsekuensi

-   `SAL-BR-004` dan `SAL-BR-015` kandidat ditandai tertutup-sebagian;
    sisa OPEN-nya hanya reversal DP pasca-konversi.
-   `AC-SAL-003` terpenuhi oleh perilaku di atas untuk tipe faktur dan
    basis ambang; kriteria untuk reversal belum dapat ditulis sebelum
    keputusan owner.
-   Mengubah persen ambang dilakukan lewat master kategori pelanggan
    untuk quotation baru; quotation berjalan tidak berubah.

## Status penerimaan

Belum diterima owner. Status `Diusulkan-terverifikasi-kode` berarti isi
cocok dengan kode pada commit di atas; penerimaan formal tetap keputusan
owner. Penerimaan ADR ini otomatis mempersempit ADR-003 menjadi dokumen
pertanyaan reversal saja.
