# ADR-005: Valuasi Stok, Landed Cost, dan Kebijakan Stok Negatif

-   **Status:** Diusulkan-terverifikasi-kode
-   **Tanggal:** 28 Oktober 2026
-   **Konteks:** `BUSINESS-RULES.md` menyisakan INV-BR-007 (stok negatif)
    dan PUR-BR-008 (ongkir) sebagai `[OPEN]`, dan `PRD.md` §11 menyisakan
    metode valuasi stok. Kode repo aktif
    (commit `275b9596038608f7ce4c29fcb82e7c7cecd709f0`) sudah menjalankan
    satu perilaku untuk ketiganya.
-   **Keputusan yang diusulkan:** Catat perilaku berjalan berikut sebagai
    aturan resmi, menggantikan status OPEN pada ketiga poin itu.

## 1. Metode valuasi stok — hierarki, bukan satu metode global

Resolver tunggal `resolveCostingMethod` memakai urutan:

1.  Metode kategori item,
2.  Metode item,
3.  Metode perusahaan (`SystemSetting.costingMethod`),
4.  Hard default `fifo`.

Hanya `fifo` dan `average` yang sah; nilai global non-kosong yang tidak
dikenal melempar error dan membatalkan posting, bukan diam-diam memilih
metode lain. Penerimaan dan penjualan memakai resolver yang sama.

Bukti:

-   `src/lib/services/costing-method.service.ts:14-22` (urutan prioritas
    tertulis), `:37-48` (resolver murni), `:76-99` (fail-closed nilai
    korup), `:105-115` (resolver per item).
-   Konsumsi lapisan memakai resolver sama dan bercabang fifo/average:
    `src/lib/services/inventory-fifo.ts:128-129,168,171-182,219,263,284-285`.
-   Default kolom: perusahaan `FIFO` (`prisma/schema.prisma:138`), tetapi
    kategori `average` (`prisma/schema.prisma:731`) dan item `average`
    (`prisma/schema.prisma:793`).

**Kontradiksi yang wajib diketahui owner:** item baru tanpa pilihan
eksplisit diwarisi dari kategori, lalu fallback `"average"` di jalur
create (`src/actions/master.actions.ts:618-632`), dan kategori baru juga
bawaan `"average"` (`src/actions/master.actions.ts:1638`). Akibatnya data
baru pada praktiknya efektif **average**, sedangkan hard default resolver
adalah **fifo**. Keduanya berjalan tanpa error, tetapi bawaan bisnis yang
dimaksud tidak tegas. ADR ini mencatat fakta itu; menegaskan bawaan yang
diinginkan adalah keputusan owner (masuk daftar OPEN di
`KEPUTUSAN-TERVERIFIKASI.md`).

Biaya lot fisik tetap dipisahkan dari biaya nilai: dekremen lot fisik
urut FEFO (kedaluwarsa tercepat), biaya tetap dari lapisan FIFO —
`src/lib/services/inventory-fifo.ts:80-89,143-144,337-341`.

## 2. Ongkir — landed cost yang dikapitalisasi ke HPP

Ongkir **bukan beban periode**. Alokasi per penerimaan:

-   Pool biaya = ongkir aktual yang dicatat pada penerimaan bila diisi
    (> 0), selain itu porsi proporsional estimasi PO
    (`shippingCost + serviceFee`); ditambah fee admin bank sebagai pool
    sendiri; dikurangi porsi diskon PO.
-   Dibagi antar baris proporsional nilai barang diterima; hasil per unit
    dibulatkan ke sen dan ditambahkan ke unit cost StockMove, lapisan
    FIFO, dan jurnal penerimaan.

Bukti: `src/lib/services/landed-cost.service.ts:4-8,20-30,122-205`;
penerapan di `src/lib/hooks/goods-receipt.hook.ts:277-360,391,422,434-441,451-489`;
kolom `prisma/schema.prisma:2135` dan `prisma/schema.prisma:2202-2208`;
pemecahan jurnal Dr Persediaan / Dr Ongkir / Dr Beban Admin di
`src/lib/services/stock-journal.service.ts:132-205`; uji regresi di
`src/lib/services/__tests__/landed-cost.test.ts:14-75,236-256` dan
`src/lib/hooks/__tests__/goods-receipt-landed-cost.test.ts:129-227`.

## 3. Stok negatif — ditolak, tanpa override

Semua jalur keluar (penjualan, material issue, transfer, retur pembelian,
penyesuaian negatif, produksi) melewati guard terpusat yang melempar
`Stok tidak mencukupi … Tersedia: …, dibutuhkan: …` bila lapisan tersisa
kurang. Parameter `allowShortfall` bawaan `false`; tidak ditemukan saklar
izin stok negatif di hook, service, action, maupun skema.

Bukti: `src/lib/services/inventory-fifo.ts:69,98,109,184-197`;
`src/lib/hooks/accounting.hook.ts:665,827`;
`src/lib/hooks/purchase-return.hook.ts:147,185-188`;
`src/lib/hooks/material-issue.hook.ts:158`;
`src/lib/hooks/inventory-transfer.hook.ts:111`;
`src/actions/manufacturing.actions.ts:990`.
Pemeriksaan tutup periode hanya melaporkan stok negatif sebagai temuan
yang harus diperbaiki lewat penyesuaian, bukan pengecualian yang
diizinkan: `src/lib/settings/period-close.ts:133-135`.

## Konsekuensi

-   INV-BR-007 dan PUR-BR-008 kandidat ditutup; metode valuasi dicatat
    sebagai aturan hierarki (kandidat INV-BR-016).
-   Gudang tidak dapat mengoversell/mengeluarkan melebihi lapisan per
    gudang; kekurangan stok menggagalkan seluruh transaksi pemanggil
    (atomik), bukan melahirkan saldo negatif.
-   Margin per produk sudah memuat ongkir perolehan; membandingkan harga
    daftar supplier tanpa landed cost dinyatakan menyesatkan oleh kode
    laporan (`src/lib/services/purchase-price-analysis.service.ts:12-14`).

## Yang tetap OPEN di bawah ADR ini

Bawaan metode costing yang diinginkan bisnis (fifo atau average) belum
tegas karena kontradiksi default di poin 1. Sampai owner menegaskan,
perilaku berjalan di atas adalah fakta, bukan pilihan yang sudah disahkan.
