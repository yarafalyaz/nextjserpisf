# ADR-003: Konversi Quotation Saat Ambang DP Tercapai & Kebijakan Reversal DP

-   **Status:** Accepted (Vonis Owner 10 November 2026: **Option B — Cash Refund**)
-   **Tanggal:** 10 November 2026 (Diperbarui dari 27 Oktober 2026)
-   **Konteks:** Aturan semula menyisakan pertanyaan terbuka mengenai perilaku
    reversal / pembatalan pembayaran uang muka (Down Payment) setelah
    terkonversi menjadi faktur penjualan.

## Keputusan Resmi (Vonis Owner: Option B)

1. **Kebijakan Pembatalan / Reversal DP Pasca-Konversi:**
   - Bila pesanan/faktur dibatalkan, uang muka yang sudah diterima **wajib dikembalikan secara fisik/tunai/transfer (Cash Refund)** kepada pelanggan, bukan diubah otomatis menjadi saldo deposit (Customer Credit).
   - Kasir/Finance menerbitkan voucher pengeluaran kas/bank pembalik untuk mencatat pengeluaran kas fisik (Dr Kewajiban Uang Muka 210102 / Cr Kas/Bank 1101xx), sehingga buku kas fisik dan saldo kewajiban uang muka kembali seimbang.
   - Down Payment yang telah berstatus `confirmed` tidak dapat dihapus mentah (*delete draft-only*); pembalikannya harus melalui alur refund kas / voucher pembatalan beralasan.

- **Konsekuensi:**
  - Status ADR-003 resmi **Accepted**.
  - Menutup seluruh sisa open item pada `SAL-BR-004`, `SAL-BR-015`, dan `AC-SAL-003`.
  - Rekapitulasi di dokumen bisnis dan kesiapan produksi diperbarui menjadi tertutup penuh.
