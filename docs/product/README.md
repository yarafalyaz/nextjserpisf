# Dokumentasi ERP ISF

Paket ini berisi baseline dokumentasi produk dan pengembangan ERP ISF.

> **Status salinan:** Disalin 28 Oktober 2026 dari folder sumber
> `ERP-ISF-Documentation` ke `docs/product/` repo Silengkap
> (basis `origin/main` `327ae39258b4cce6dfd27492d02aae2cfc6f3a65`),
> lalu disesuaikan pada bagian yang disebut di bawah. Isi lain
> dipertahankan apa adanya dari sumber dan belum tentu menggambarkan
> implementasi repo sampai diverifikasi. Peta verifikasi per aturan:
> [INDEKS-ATURAN.md](INDEKS-ATURAN.md).

## Isi

-   `PRD.md` --- tujuan, scope, modul, aturan global, dan roadmap.
-   `BUSINESS-RULES.md` --- indeks aturan bisnis resmi dan keputusan
    terbuka.
-   `ARCHITECTURE.md` --- domain boundaries dan prinsip arsitektur
    konseptual.
-   `DATA-MODEL.md` --- entitas dan relasi konseptual; bukan schema
    final.
-   `API-CONTRACTS.md` --- kontrak integrasi baseline.
-   `SECURITY.md` --- persyaratan keamanan dan permission.
-   `TEST-STRATEGY.md` --- strategi testing dan quality gates.
-   `ACCEPTANCE-CRITERIA.md` --- indeks kriteria penerimaan.
-   `TASK-BOARD.md` --- template board dan backlog awal.
-   `ADRs/` --- catatan keputusan arsitektur/bisnis yang masih proposed.
-   `INDEKS-ATURAN.md` --- peta ID aturan (`GL-BR-*`, `INV-BR-*`,
    `PUR-*`, `SAL-*`, `FIN-*`, `PROJ-*`, `WO-*`, `HR-*`, `AC-*`) ke
    status implementasi terverifikasi di repo.

## Cara menggunakan

1.  Folder ini sudah tersalin di `docs/product/` repository aktif;
    jangan menyalin ulang dari folder sumber tanpa memeriksa diff.
2.  Audit repository aktual sebelum mengunci stack atau schema.
3.  Minta Product Owner menyelesaikan keputusan yang berstatus
    OPEN/Proposed.
4.  Pecah requirement menjadi task yang mempunyai owner, dependency,
    acceptance criteria, dan test plan.
5.  Setiap PR yang mengubah perilaku bisnis atau kontrak harus
    memperbarui dokumentasi terkait.
6.  Jangan menyatakan dokumen ini sudah final atau implementasi sudah
    sesuai sebelum diverifikasi.

## Catatan penting

Semua struktur data, endpoint, dan arsitektur di sini bersifat
konseptual sampai diverifikasi terhadap repository aktif, kecuali
bagian yang secara eksplisit ditandai terverifikasi (Stack di
`ARCHITECTURE.md`, ADR-001, pemetaan model di `DATA-MODEL.md`, dan
`INDEKS-ATURAN.md`). Business rules yang diketahui dicatat sebagai
baseline; aturan yang belum diputuskan ditandai OPEN.

> **Penanda keputusan menyusul:** file `KEPUTUSAN-TERVERIFIKASI.md`
> dan ADR keputusan bisnis baru belum dilipat ke paket ini. Tabel
> keputusannya menyusul dari peran Business; lihat penanda di
> `INDEKS-ATURAN.md`. Jangan menganggap keputusan OPEN sudah tertutup
> hanya karena implementasi parsial ditemukan di repo.
