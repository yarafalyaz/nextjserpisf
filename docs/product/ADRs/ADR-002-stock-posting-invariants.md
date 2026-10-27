# ADR-002: Invariant Posting Inventory

-   **Status:** Proposed
-   **Tanggal:** 27 Oktober 2026
-   **Konteks:** Banyak domain (Purchasing, Sales, Projects, Work
    Orders) dapat menambah/mengurangi stok. Direct update dari banyak
    domain menimbulkan risiko saldo tidak konsisten.
-   **Keputusan yang diusulkan:** Inventory menjadi pemilik resmi stock
    movement dan ledger. Domain lain memanggil kontrak Inventory; semua
    posting kritis bersifat atomik, tervalidasi, dan terlindung dari
    duplikasi.
-   **Konsekuensi:** Kontrak Inventory harus disepakati sebelum
    integrasi. Perlu strategi transaksi/locking dan idempotency.
-   **Alternatif:** Setiap domain memperbarui saldo sendiri; ditolak
    karena aturan dan audit mudah terduplikasi.
-   **Keputusan final:** Menunggu review teknis dan kesesuaian dengan
    repository aktual.
