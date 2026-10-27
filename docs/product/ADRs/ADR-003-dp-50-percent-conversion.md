# ADR-003: Konversi Quotation Saat DP 50%

-   **Status:** Proposed --- business decision incomplete
-   **Tanggal:** 27 Oktober 2026
-   **Konteks:** Aturan ISF menyatakan DP 50% memicu konversi quotation
    menjadi invoice otomatis.
-   **Yang sudah diketahui:** Hanya pembayaran yang berhasil diposting
    dan memenuhi syarat yang dihitung. Pemrosesan event harus idempotent
    dan menyimpan relasi quotation, pembayaran pemicu, dan invoice
    hasil.
-   **Keputusan yang masih dibutuhkan:**
    1.  Apakah invoice yang dibuat adalah invoice penuh, invoice DP,
        atau progress invoice?
    2.  Basis 50% sebelum/sesudah pajak, diskon, ongkir, dan biaya lain.
    3.  Perilaku ketika quotation direvisi setelah DP.
    4.  Apa yang terjadi jika pembayaran direversal setelah konversi.
-   **Konsekuensi:** Jangan implementasikan perilaku final sampai
    keputusan di atas disetujui.
