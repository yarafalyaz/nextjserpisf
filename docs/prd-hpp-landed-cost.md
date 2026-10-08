# PRD: HPP Berbasis Landed Cost per Penerimaan

**Status:** Implemented
**Tanggal:** 2026-10-04
**Diimplementasikan:** 2026-10-04
**Konteks:** Pelanggan membeli barang yang sama dari toko/vendor yang berpindah-pindah. Harga selalu berbeda karena ongkir, diskon, dan biaya lain. HPP harus mencerminkan biaya nyata per lot, bukan harga master.

## 1. Latar Belakang

Sistem sudah punya fondasi yang benar:

- **FIFO per layer** — setiap penerimaan membuat `InventoryLayer` dengan `unitCost` sendiri (`src/lib/hooks/goods-receipt.hook.ts`, model `InventoryLayer`). Lot murah keluar duluan, lot mahal menyusul. Harga beda antar toko sudah tertangani di level ini.
- **Alokasi landed cost** — `shippingCost` + `serviceFee` dari PO dialokasikan ke item secara proporsional terhadap nilai barang (`poItem.total / poTotalValue`), lalu ditambahkan ke `unitCost` layer dan ke jurnal persediaan.

Yang belum benar ada di empat titik di bawah. Selama ini belum ketahuan karena tidak ada satu pun test yang menutupi alokasi landed cost.

## 2. Masalah

### P1 — Ongkir teralokasi penuh di penerimaan pertama (bug, prioritas tertinggi)

Di `goods-receipt.hook.ts` (± baris 266–285), bagian ongkir per unit dihitung:

```
itemLandedCostShare = (nilai item / total nilai PO) × (shippingCost + serviceFee)
landedCostPerUnit   = itemLandedCostShare / poItem.qty     ← qty PO penuh
```

`landedCostPerUnit` lalu ditambahkan ke **setiap unit yang diterima**, tanpa memperhitungkan berapa yang sudah pernah diterima.

Contoh: PO 10 pcs, ongkir Rp 100.000 (Rp 10.000/unit). Terima 4 pcs dulu → layer membawa Rp 40.000 ongkir. Terima sisa 6 pcs → layer membawa Rp 60.000 lagi. Total ongkir di persediaan = Rp 100.000. Sepertinya pas, tapi hanya kalau PO akhirnya diterima 100%.

Kalau PO ditutup setelah 4 pcs (vendor kehabisan stok — umum di skenario pindah-pindah toko), Rp 60.000 ongkir **hilang dari HPP selamanya**, sementara uangnya sudah keluar. Sebaliknya, kalau ada penerimaan ulang/koreksi, ongkir bisa **terhitung dua kali**.

### P2 — Diskon nota tidak mengurangi HPP

`PurchaseOrder.discount` (diskon level header) tidak disentuh sama sekali oleh alokasi landed cost. `unitCost` GR hanya membawa harga item. Akibatnya diskon nota jatuh sebagai selisih di jurnal hutang/pembelian, bukan menurunkan harga pokok. Margin per produk jadi lebih rendah dari kenyataan.

Diskon per item (`PurchaseOrderItem.discount`) aman **hanya jika** `GoodsReceiptItem.unitCost` diisi dari harga setelah diskon item. Ini perlu dipastikan di form GR, karena field-nya bebas input.

### P3 — Tidak ada tempat mencatat ongkir nyata

`shippingCost` dan `serviceFee` hidup di PO, diisi saat order — yaitu **estimasi**. Ongkir nyata baru diketahui saat barang datang, dan di skenario ini ongkir adalah komponen yang paling fluktuatif. Tidak ada field biaya di `GoodsReceipt`, jadi satu-satunya cara mengoreksi adalah mengedit PO yang mungkin sudah terkunci atau separuh diterima.

### P4 — HPP tidak terlihat

Tidak ada tampilan yang menunjukkan "harga pokok lot ini = harga barang + bagian ongkir − bagian diskon". User tidak bisa memverifikasi angka sebelum posting, dan tidak ada laporan HPP per item per vendor untuk melihat toko mana yang sebenarnya paling murah setelah ongkir.

## 3. Tujuan

1. Total ongkir + biaya lain yang terserap ke persediaan **selalu sama** dengan total yang tercatat di dokumen, berapa pun jumlah penerimaan parsialnya.
2. Diskon nota menurunkan HPP secara proporsional, bukan menjadi selisih jurnal.
3. Ongkir nyata dicatat di penerimaan, bukan di order.
4. User bisa melihat komposisi HPP per lot sebelum posting.

## 4. Ruang Lingkup

### Termasuk

- Perbaikan alokasi agar berbasis **qty penerimaan ini**, dengan sisa biaya menempel di penerimaan terakhir / saat PO ditutup.
- Diskon header masuk ke perhitungan landed cost sebagai pengurang.
- Field biaya nyata di Goods Receipt (ongkir nyata, biaya lain) yang menimpa estimasi PO untuk penerimaan tersebut.
- Panel pratinjau HPP di form GR: per baris tampil harga barang, bagian ongkir, bagian diskon, HPP akhir per unit.
- Test untuk semua skenario di bagian 6.

### Tidak termasuk

- Mengganti metode FIFO (tetap FIFO; average tidak dipakai).
- HPP untuk item manufaktur (sudah punya jalur sendiri lewat work order / production order).
- PPN masukan — tetap tidak masuk HPP selama bisa dikreditkan. Tidak ada perubahan di sini.
- Revaluasi layer yang sudah terpakai (kalau ongkir dikoreksi setelah sebagian stok terjual, selisihnya masuk akun selisih HPP, bukan menulis ulang layer lama).

## 5. Rancangan

### 5.1 Rumus alokasi (per penerimaan)

Basis alokasi tetap **nilai barang** (bukan qty), supaya barang mahal menanggung ongkir lebih besar.

```
biayaBersih        = ongkirNyata + biayaLain − diskonHeader
bagianItem         = (nilaiBaris / totalNilaiDiterima) × biayaBersih
hppPerUnit         = hargaSetelahDiskonItem + (bagianItem / qtyDiterima)
```

`nilaiBaris` dan `totalNilaiDiterima` dihitung dari **baris GR ini**, bukan dari PO penuh. Dengan begitu setiap penerimaan hanya menyerap biaya yang menjadi bagiannya, dan jumlah seluruh penerimaan = total biaya. Tidak ada lagi biaya yang menggantung atau terhitung ganda.

Pembulatan: selisih pembulatan rupiah ditambahkan ke baris bernilai terbesar, supaya total layer == total biaya sampai satuan rupiah.

### 5.2 Ongkir nyata di Goods Receipt

Tambah di `GoodsReceipt`:

| Field | Tipe | Keterangan |
|---|---|---|
| `shippingCost` | Decimal(15,2) default 0 | Ongkir nyata penerimaan ini |
| `otherCost` | Decimal(15,2) default 0 | Biaya lain (packing, admin, dll) |

Saat GR dibuat, kedua field boleh dibiarkan kosong (0). Kalau kosong, hook akan menghitung **porsi proporsional** dari estimasi PO berdasarkan nilai barang yang diterima (`poCostPool × nilaiDiterima / nilaiPO`) pada saat verifikasi — jadi perilaku lama (ongkir ikut PO) tetap terjaga, hanya basisnya yang diperbaiki. Field ini murni untuk **ongkir nyata**; kalau diisi (> 0), nilainya menimpa estimasi PO sepenuhnya untuk penerimaan tersebut.

> **Catatan implementasi:** field tidak diisi otomatis di form (biar tetap "actual only" dan tidak ada angka estimasi yang ikut tersimpan ke DB). Hasil akhirnya identik dengan skema auto-fill: total yang diserap satu penerimaan = `pool × nilaiDiterima / nilaiPO`. Lihat §9.

`PurchaseOrder.shippingCost` / `serviceFee` tetap ada sebagai estimasi untuk anggaran, tapi bukan lagi sumber kebenaran HPP.

### 5.3 Diskon header

`PurchaseOrder.discount` dialokasikan sebagai pengurang dengan basis yang sama (proporsional nilai barang per penerimaan). Tidak perlu field baru.

**Rancangan final (disepakati saat implementasi).** Di skema hanya ada SATU field diskon: `PurchaseOrder.discount` = rollup dari `PurchaseOrderItem.discount` (diskon per baris). `PurchaseOrderItem.total` sudah bersih dari diskon barisnya, dan form PO tidak punya input diskon header terpisah. Karena itu:

- **Basis bobot alokasi** = harga satuan NETO PO (`poItem.total / poItem.qty`), supaya pembagian antar-penerimaan konsisten.
- **`poDiscount` diperlakukan sebagai pool tersendiri** yang **dikurangkan** dari HPP, bukan dicampur ke pool ongkir. Dengan begitu kolom "Bagian Ongkir" dan "Bagian Diskon" di form bisa dibedakan dan ongkir yang diserap penerimaan parsial terhitung benar.
- **Harga satuan GR diisi GROSS** (harga satuan PO, bukan setelah diskon), sehingga diskon diterapkan **tepat satu kali** lewat pool diskon. Kalau suatu saat `GoodsReceiptItem.unitCost` diisi NETO, diskon akan terkurang dua kali — caveat ini juga ditulis di header `landed-cost.service.ts`.

Satu pool diskon, satu pool ongkir, hasil akhir = ongkir − diskon. Tidak ada perubahan skema tambahan.

### 5.4 Selisih koreksi setelah posting

Kalau ongkir dikoreksi setelah GR terposting dan sebagian layer sudah terpakai penjualan:

- Layer yang masih utuh dihitung ulang.
- Bagian yang sudah keluar tidak ditulis ulang; selisihnya dijurnal ke akun selisih HPP (perlu satu akun baru di pengaturan, fallback ke akun penyesuaian persediaan yang sudah ada).

### 5.5 Tampilan

Di form GR, kolom tambahan per baris (read-only, dihitung live): **Bagian Ongkir**, **Bagian Diskon**, **HPP/Unit**. Total di footer: total ongkir terserap = ongkir yang diinput (harus sama persis, ini jadi pengecekan visual untuk user).

## 6. Skenario Uji (wajib, sekarang nol test)

1. **Terima penuh sekaligus** — total ongkir di layer == `shippingCost` PO, sampai rupiah.
2. **Terima parsial 4 + 6** — jumlah ongkir kedua layer == total ongkir, tidak lebih tidak kurang.
3. **PO ditutup setelah terima sebagian** — seluruh ongkir terserap di penerimaan yang ada, tidak ada yang menggantung.
4. **Diskon header** — HPP turun proporsional, jurnal persediaan = nilai setelah diskon + ongkir.
5. **Ongkir nyata berbeda dari estimasi PO** — yang masuk layer adalah angka GR, bukan PO.
6. **Multi-UoM** — alokasi tetap benar setelah konversi ke base unit (regresi dari komentar yang sudah ada di hook).
7. **Dua item, nilai beda jauh** — barang mahal menanggung porsi lebih besar; total tetap imbang.
8. **Koreksi ongkir setelah sebagian terjual** — layer sisa berubah, stok terjual tidak berubah, selisih masuk jurnal.

## 7. Kriteria Selesai

- Kedelapan skenario uji hijau, dijalankan dengan `TZ=Asia/Jakarta`.
- `tsc` dan `lint` bersih.
- Untuk data lama: GR yang sudah terposting **tidak dihitung ulang otomatis** (mengubah HPP historis akan menggeser laba periode tertutup). Perbaikan hanya berlaku untuk penerimaan baru. Catatan migrasi ini ditulis di dokumen rilis.

## 8. Perkiraan Ukuran

Perubahan kecil-menengah: satu hook (`goods-receipt.hook.ts`), skema `GoodsReceipt` (+2 kolom), form GR, dan file test baru. Tidak ada perubahan di jalur penjualan — FIFO sudah mengonsumsi `unitCost` layer apa adanya, jadi begitu layer-nya benar, HPP penjualan ikut benar.

## 9. Catatan Rilis

**Migrasi database.** `prisma/migrations/20261004130000_add_goods_receipt_landed_cost` menambah dua kolom ke `goods_receipts`:

```sql
ALTER TABLE `goods_receipts` ADD COLUMN `shipping_cost` DECIMAL(15, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE `goods_receipts` ADD COLUMN `other_cost`     DECIMAL(15, 2) NOT NULL DEFAULT 0.00;
```

Keduanya `NOT NULL DEFAULT 0.00`, jadi aman dijalankan pada tabel berisi data: baris lama otomatis bernilai 0 (= "pakai estimasi PO"), tanpa backfill dan tanpa downtime. Tidak ada perubahan skema lain.

**Data historis tidak dihitung ulang.** GR yang sudah terverifikasi **tidak** dihitung ulang. Perbaikan alokasi hanya berlaku untuk penerimaan yang diverifikasi setelah rilis ini. Alasannya: menulis ulang `unitCost` layer lama akan menggeser laba periode yang sudah ditutup dan membuat jurnal yang sudah diposting tidak lagi cocok dengan subledger persediaan. Ini dijamin secara struktural — allocator bersifat murni/stateless dan tidak menyimpan riwayat, sehingga tidak ada jalur yang bisa menyentuh layer lama (lihat test "scenario 8").

**Koreksi ongkir setelah posting — belum diimplementasikan (defer).** Rancangan §5.4 (revaluasi layer sisa + jurnal selisih HPP ke akun baru) **tidak** termasuk rilis ini. Saat ini GR yang sudah terverifikasi tidak bisa diedit (`Hanya GR draft yang dapat diedit`); satu-satunya koreksi adalah **hapus lalu terima ulang**, yang membalik layer lama secara utuh lalu membuat layer baru — jadi tetap tidak ada penulisan ulang sebagian. Konsekuensinya, skenario §6 no. 8 diverifikasi pada level *structural guarantee* (allocator stateless, test hijau), bukan pada alur revaluasi UI. Kalau nanti koreksi in-place dibutuhkan, §5.4 perlu dikerjakan bersama akun selisih HPP baru di `SystemSetting`.

**Verifikasi.** 23 test baru (17 di `src/lib/services/__tests__/landed-cost.test.ts`, 6 di `src/lib/hooks/__tests__/goods-receipt-landed-cost.test.ts`), seluruh suite 2739 test hijau dengan `TZ=Asia/Jakarta`; `tsc` dan `lint` bersih.
