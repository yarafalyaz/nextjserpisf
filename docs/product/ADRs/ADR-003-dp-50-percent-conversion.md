# ADR-003: Konversi Quotation Saat Ambang DP Tercapai

-   **Status:** Proposed --- business decision incomplete (hanya
    reversal DP pasca-konversi)
-   **Tanggal:** 27 Oktober 2026
-   **Konteks:** Aturan ISF semula dibingkai sebagai "DP 50% memicu
    konversi quotation menjadi invoice otomatis". Bingkai itu tidak
    sesuai kode berjalan: ambang konversi adalah **persen per kategori
    pelanggan yang tersnapshot per quotation**, bukan ambang tetap
    50%. Saat quotation dibuat, `CustomerCategory.downPaymentPercent`
    kategori pelanggan disalin ke `Quotation.invoiceThresholdPercent`;
    hook konversi memakai snapshot itu. Angka 50% hanya **fallback
    fail-closed bawaan** bila snapshot kosong/tidak sah. Mengubah
    master kategori sesudahnya tidak mengubah quotation berjalan.
    Bukti: `src/actions/sales.actions.ts:201,209-211,261`;
    `src/lib/hooks/down-payment.hook.ts:639-646`;
    `src/lib/sales/invoice-threshold.ts:28-49,51-54,56-62`;
    `prisma/schema.prisma:542,1514-1518`.
-   **Yang sudah diketahui:** Hanya pembayaran yang berhasil diposting
    dan memenuhi syarat yang dihitung. Pemrosesan event harus idempotent
    dan menyimpan relasi quotation, pembayaran pemicu, dan invoice
    hasil.

## Tertutup-terverifikasi (dipindah dari pertanyaan terbuka)

Perilaku berikut sudah ditentukan kode; rincian di
[ADR-007](ADR-007-perilaku-dp-konversi-faktur.md):

1.  **Tipe faktur:** faktur penuh senilai `quotation.grandTotal`,
    lahir sebagai DRAFT tanpa nomor dokumen (nomor resmi terbit saat
    posting manual).
    `src/lib/hooks/down-payment.hook.ts:646-669`
2.  **Basis ambang:** `ceil(grandTotal quotation × persen snapshot / 100)`
    dalam sen; persen adalah snapshot kategori pelanggan per quotation,
    bukan 50% tetap. Basis `grandTotal` sudah termasuk komponen
    diskon/pajak yang membentuk `grandTotal` dokumen itu; tidak ada
    basis DPP terpisah.
    `src/lib/hooks/down-payment.hook.ts:639-646`;
    `src/lib/sales/invoice-threshold.ts:38-49,51-54`
3.  **Snapshot saat quotation direvisi sesudah DP:** revisi dan edit
    quotation **tidak menulis ulang** snapshot. `reviseQuotation`
    hanya mengubah `status`/`revisionNumber`
    (`src/actions/sales.actions.ts:491-497`); `updateQuotation`
    menulis ulang isi dokumen tanpa `invoiceThresholdPercent`
    (`src/actions/sales.actions.ts:682-712`). Snapshot hanya ditulis
    saat pembuatan (`src/actions/sales.actions.ts:261`).

## Keputusan yang masih dibutuhkan (OPEN)

1.  Apa yang terjadi jika pembayaran DP direversal setelah konversi.

-   **Konsekuensi:** Perilaku konversi berjalan mengikuti ADR-007.
    Jangan implementasikan perilaku reversal final sampai keputusan
    OPEN di atas disetujui.
