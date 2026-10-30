# ROUND5 — Audit Stok / FIFO / COGS

Tanggal: 2026-10-30.
Mode: read-only kode produk.
Laporan ini satu-satunya file yang dibuat.
Scope: FIFO, COGS, retur, reservasi, transfer, produksi, pembayaran.

## Ringkasan

| Severity | CONFIRMED | PLAUSIBLE | Total |
|---|---:|---:|---:|
| HIGH | 6 | 0 | 6 |
| MEDIUM | 6 | 4 | 10 |
| LOW | 2 | 2 | 4 |
| **Total** | **14** | **6** | **20** |

Kandidat dibuang:

- GR backdated menjadi layer tertua.
  Dibuang karena CST-02 menetapkan urutan posting.
  Referensi: `docs/prd-erp-fabrikasi-offroad.md:330`.
- Cancel WO wajib reverse MI completed.
  Belum ada spec domain yang mewajibkan.
  Tidak ditulis sebagai bug.
- Final landed-cost discount tanpa true-up.
  Bukti residual aktual tidak ditemukan.
  Alokasi proporsional contoh tetap benar.
- Receive parsial disebut mengulang stok.
  Bukti duplikasi tidak ditemukan.
  Jalur idempotency dan klaim status sudah ada.

---

## STOK-01 — HIGH — CONFIRMED
### Retur jual memakai master cost berjalan, bukan biaya penjualan asal

Lokasi:

- `src/actions/sales.actions.ts:2259-2262`
- `src/actions/sales.actions.ts:2298-2299`
- `src/lib/hooks/sales-return.hook.ts:150-153`
- `src/lib/hooks/sales-return.hook.ts:209-217`
- `src/lib/hooks/accounting.hook.ts:1790-1796`
- `src/lib/hooks/accounting.hook.ts:2144-2161`

Bukti:

- `baseReturnCostMap` dibaca dari `Item.cost` saat create retur.
- Nilai itu dikali faktor UOM dan disimpan sebagai `SalesReturnItem.cost`.
- Hook stok memakai nilai tersebut sebagai `baseCost` FIFO layer baru.
- Accounting memakai `qty × item.cost` untuk Dr Persediaan.

Tidak ada pembacaan StockMove OUT faktur asal.
Tidak ada pembacaan COGS aktual penjualan.

Skenario:

1. Beli 10 unit @ Rp80.000.
2. Beli 10 unit @ Rp120.000.
3. Master cost berjalan menjadi Rp120.000.
4. Jual 10 unit dari layer pertama.
5. COGS penjualan benar Rp800.000.
6. Retur 10 unit dari penjualan tersebut.
7. Sistem membuat layer 10 × Rp120.000.
8. Layer dan jurnal menjadi Rp1.200.000.
9. Kelebihan restock Rp400.000.
10. Jual ulang menghasilkan COGS Rp1.200.000.
11. COGS historis seharusnya Rp800.000.

Dampak: valuasi, reversal HPP, dan COGS berikutnya salah.

Fix terkecil:

- Ambil biaya dari StockMove OUT faktur asal.
- Simpan biaya itu pada baris retur saat create.
- Master cost hanya fallback retur tanpa faktur.

Test regresi:

- Dua layer @80.000 dan @120.000.
- Jual dari layer @80.000.
- Ubah master cost ke @120.000.
- Complete retur.
- Assert layer dan jurnal memakai @80.000.

---

## STOK-02 — HIGH — CONFIRMED
### Recalc pembayaran mengabaikan returnCredit

Lokasi:

- `src/lib/hooks/sales-payment.hook.ts:49-63`
- `src/lib/hooks/sales-payment.hook.ts:78-86`
- `src/lib/hooks/accounting.hook.ts:2186-2216`

Bukti:

- Recalc menjumlah `amount + withholdingAmount` pembayaran.
- Status diturunkan dari `grandTotal` dan `totalPaid` saja.
- Tidak ada pembacaan returnCredit POSTED.
- Jalur retur memakai `grandTotal − paidAmount − returnCredit`.

Skenario:

1. Faktur Rp1.000.000.
2. Pelanggan bayar Rp600.000.
3. Retur completed Rp400.000.
4. Secara ekonomi faktur lunas.
5. Payment reversal memicu recalc.
6. Recalc hanya membaca kas valid.
7. Status turun menjadi `posted` atau `partial`.
8. Sistem dapat menerima pembayaran baru.
9. Kas baru Rp1.000.000 dapat masuk.
10. Total penyelesaian menjadi Rp1.400.000.

Dampak: overpayment dan status AR salah.

Fix terkecil:

- Pakai rumus outstanding kanonis di recalc.
- Rumus: `grandTotal − paidValid − returnCreditPosted`.
- Status paid bila sisa dalam toleransi Rp1.

Test regresi:

- Faktur Rp1.000.000.
- Payment valid Rp600.000.
- Return credit POSTED Rp400.000.
- Jalankan recalc sesudah reversal/update.
- Assert status tetap paid.
- Assert pembayaran tambahan ditolak.

---

## STOK-03 — HIGH — CONFIRMED
### Void faktur dan complete retur dapat restock dobel

Lokasi:

- `src/actions/sales.actions.ts:4011-4034`
- `src/actions/sales.actions.ts:2124-2131`
- `src/actions/sales.actions.ts:2169-2178`

Bukti:

- Void hanya menolak payment aktif.
- Void tidak memeriksa SalesReturn draft/completed.
- Void lalu memanggil reversal posting faktur.
- Complete retur memeriksa status retur di luar transaksi.
- Complete tidak memeriksa faktur sudah cancelled di dalam transaksi.
- Hook retur tetap membuat StockMove IN dan kredit AR.

Skenario urutan A:

1. Faktur menjual 10 unit.
2. Retur draft dibuat untuk 10 unit.
3. Faktur di-void.
4. Reversal faktur mengembalikan 10 unit.
5. Retur draft diselesaikan.
6. Hook retur mengembalikan 10 unit lagi.
7. Stok naik 20 unit dari penjualan 10 unit.
8. Kredit retur ikut dibukukan.

Skenario urutan B:

1. Faktur menjual 10 unit.
2. Retur completed mengembalikan 10 unit.
3. Faktur kemudian di-void.
4. Reversal faktur mengembalikan 10 unit lagi.
5. Hasil akhir tetap restock dobel.

Dampak: stok dan AR/COGS reversal dobel.

Fix terkecil:

- Dalam transaksi void, lock faktur lalu cek SalesReturn.
- Tolak void bila ada retur draft atau completed.
- Dalam transaksi complete, lock faktur asal.
- Tolak complete bila faktur cancelled.

Test regresi:

- Draft return lalu void harus gagal, atau complete sesudah void gagal.
- Completed return lalu void harus gagal.
- Assert tidak ada StockMove IN kedua.

---

## STOK-04 — HIGH — CONFIRMED
### Void faktur memulihkan batch dari semua layer item+gudang

Lokasi:

- `src/lib/services/sales-invoice-posting.service.ts:46-49`
- `src/lib/services/sales-invoice-posting.service.ts:92-102`
- `src/lib/services/sales-invoice-posting.service.ts:103-122`

Bukti:

- OUT moves dipilih berdasarkan faktur yang di-void.
- Batch attribution tidak dibatasi ke OUT move tersebut.
- Query membaca semua layer item+gudang dengan `qtyOut > 0`.
- Layer dibaca urut tertua dan diambil sampai qty move terpenuhi.

Skenario:

1. Faktur A menjual 5 unit dari LOT-A.
2. Faktur B menjual 5 unit dari LOT-B.
3. Void hanya faktur B.
4. Query menemukan LOT-A lebih dulu.
5. Sistem memulihkan 5 unit sebagai LOT-A.
6. LOT-A menjadi 10 unit.
7. LOT-B tetap kurang 5 unit.
8. Total stok benar, identitas lot salah.

Dampak: traceability, FEFO, expiry, dan recall salah.

Fix terkecil:

- Batasi layer sumber ke StockMove OUT faktur.
- Jangan agregat semua `qtyOut` item+gudang.
- Bila source layer tidak tercatat, fallback tanpa batch lebih aman.

Test regresi:

- Dua faktur dari LOT-A dan LOT-B.
- Void faktur LOT-B.
- Assert hanya LOT-B bertambah 5.
- Test existing hanya memakai satu faktur dan satu lot.

---

## STOK-05 — HIGH — CONFIRMED
### Retur beli mixed-UOM: cap dan stok-out beda basis

Lokasi:

- `src/actions/purchase.actions.ts:556-565`
- `src/actions/purchase.actions.ts:567-589`
- `src/actions/purchase.actions.ts:608-612`
- `src/lib/hooks/purchase-return.hook.ts:140-142`

Bukti:

- Cap menjumlah `Number(it.qty)` mentah dari semua GR.
- Baris GR dapat memakai UOM berbeda.
- Hook mengambil satu `receipt.uom` per item.
- Hook mengalikan qty retur dengan faktor UOM itu.
- Cap dan hook karena itu memakai basis berbeda.

Skenario:

1. Satuan dasar item PCS.
2. Konversi BOX = 12 PCS.
3. GR pertama menerima 1 BOX.
4. GR kedua menerima 1 PCS.
5. Total sah 13 PCS.
6. Cap membaca `1 + 1 = 2`.
7. Retur 13 ditolak walau sah.
8. Retur 2 dapat lolos cap.
9. Hook dapat membaca UOM BOX.
10. Hook mengeluarkan `2 × 12 = 24 PCS`.

Dampak: retur sah ditolak atau stok keluar berlebih.

Fix terkecil:

- Agregasi received dan prior returns dalam base qty.
- Simpan UOM/factor eksplisit per baris retur.
- Alternatif: simpan `goodsReceiptItemId` per baris.

Test regresi:

- GR 1 BOX + 1 PCS.
- Retur 13 harus lolos cap.
- Retur 14 harus ditolak.
- StockMove OUT harus tepat 13 PCS.

---

## STOK-06 — HIGH — CONFIRMED
### Approval StockAdjustment mengunci dokumen pada status approved

Lokasi:

- `src/actions/approval.actions.ts:34-39`
- `src/actions/approval.actions.ts:300-364`
- `src/actions/inventory.actions.ts:336-339`
- `src/actions/inventory.actions.ts:364-372`
- `src/app/(dashboard)/inventaris/penyesuaian/[slug]/page.tsx:106-122`

Bukti:

- `GATE_ONLY_REFERENCE_TYPES` hanya Journal dan VendorPayment.
- Approval final menulis status dokumen menjadi `approved`.
- StockAdjustment dibuat lalu diajukan ke approval.
- Process hanya menerima status `draft`.
- UI hanya menampilkan Posting/Ubah/Hapus saat `draft`.
- Approval karena itu mengubah draft menjadi status buntu.

Kondisi: workflow `modelType="StockAdjustment"` aktif.
Workflow dapat dibuat karena schema tidak membatasi modelType ke enum.

Skenario:

1. Adjustment ADJ-001 menambah 6 unit.
2. Unit cost Rp50.000.
3. Nilai dokumen Rp300.000.
4. Workflow satu langkah disetujui.
5. Dokumen berubah dari draft ke approved.
6. Tombol Posting hilang.
7. Process langsung juga menolak non-draft.
8. Stok dan jurnal Rp300.000 tidak pernah terposting.

Fix terkecil:

- Tambah StockAdjustment ke `GATE_ONLY_REFERENCE_TYPES`.
- Approval menjadi gate saja.
- Dokumen tetap draft sampai process berjalan.

Test regresi:

- Final approve StockAdjustment.
- Assert status dokumen tetap draft.
- Assert approval record menjadi approved.
- Assert processStockAdjustment dapat berjalan.

---

## STOK-07 — MEDIUM — CONFIRMED
### Konsumsi reservasi MI hanya menyentuh reservasi aktif pertama

Lokasi:

- `src/lib/services/stock-reservation.service.ts:178-189`
- `src/lib/services/stock-reservation.service.ts:194-211`
- `src/lib/reports/stock-reservation.ts:104-141`

Bukti:

- Planner dapat membuat beberapa reservasi aktif.
- Reservasi dapat berasal dari beberapa WorkOrderItem.
- Item dan gudang beberapa baris dapat sama.
- Konsumsi MI memakai `findFirst` satu reservasi aktif.
- MI tidak lanjut ke reservasi aktif kedua.

Skenario:

1. WO punya dua baris material sama.
2. Reservasi baris pertama 6 unit.
3. Reservasi baris kedua 6 unit.
4. MI mengeluarkan 10 unit.
5. Sistem konsumsi 6 dari reservasi pertama.
6. Sistem catat 4 sebagai unreserved outflow.
7. Reservasi kedua tetap aktif 6 unit.
8. Stok untuk WO lain tampak terblokir 6 unit.

Dampak: reservasi bocor dan ketersediaan salah.

Fix terkecil:

- Ambil semua reservasi aktif urut ID.
- Konsumsi berurutan sampai qty MI habis.
- Hanya sisa sesudah semua reservasi menjadi unreserved.

Test regresi:

- Dua reservasi aktif 6 + 6.
- Konsumsi MI 10.
- Assert update 6 dan 4.
- Assert unreserved outflow 0.

---

## STOK-08 — MEDIUM — CONFIRMED
### Transfer tujuan membuat layer baru dan kehilangan umur FIFO sumber

Lokasi:

- `docs/prd-erp-fabrikasi-offroad.md:330`
- `src/lib/hooks/inventory-transfer.hook.ts:346-365`
- `src/lib/services/inventory-fifo.ts:160-165`
- `src/lib/services/inventory-fifo.ts:501-516`

Bukti:

- CST-02: transfer mempertahankan umur asal.
- CST-02 juga menetapkan identitas biaya dan jejak lot.
- Transfer membawa unit cost dan batch ke tujuan.
- Layer tujuan dibuat baru lewat `createInLayer`.
- `createInLayer` tidak menerima tanggal atau posisi layer sumber.
- Prisma mengisi `createdAt` waktu receive.
- FIFO konsumsi mengurutkan `created_at ASC, id ASC`.

Skenario:

1. Gudang A menerima layer tua @80.000.
2. Gudang B menerima layer muda @120.000.
3. Stok tua ditransfer dari A ke B.
4. Layer B dari transfer lahir pada waktu receive.
5. Layer lokal B yang lebih muda secara dokumen bisa lebih tua `createdAt`.
6. Penjualan berikutnya konsumsi layer lokal @120.000 dulu.
7. COGS seharusnya memakai stok transfer @80.000 lebih dulu.

Dampak: FIFO dan COGS antar-gudang salah.

Fix terkecil:

- Simpan source posting sequence pada layer tujuan.
- Alternatif: terima `createdAt` sumber di `createInLayer`.
- Jangan gunakan tanggal dokumen backdate bebas.

Test regresi:

- Layer sumber tua dan layer tujuan lokal muda.
- Transfer sumber ke tujuan.
- Consume satu unit.
- Assert biaya memakai layer transfer tertua.

---

## STOK-09 — MEDIUM — CONFIRMED
### Duplicate PO lines beda harga merusak bobot landed cost

Lokasi:

- `src/lib/hooks/goods-receipt.hook.ts:303-310`
- `src/lib/hooks/goods-receipt.hook.ts:318-351`

Bukti:

- `poItemsById` dibuat dengan Map dari itemId ke baris PO.
- Baris duplikat item menimpa baris sebelumnya.
- `poNetUnitPriceOf` memakai harga baris terakhir.
- Harga itu menjadi bobot semua GR item tersebut.
- `receivedValueBefore` ikut memakai bobot salah.

Skenario:

1. PO item X baris pertama 5 @ Rp1.000.
2. Baris kedua 5 @ Rp2.000.
3. Total PO item Rp15.000.
4. Pool ongkir Rp3.000.
5. GR menerima 5 unit pertama.
6. Bobot benar Rp5.000.
7. Serapan benar Rp1.000.
8. Map hanya menyimpan harga Rp2.000.
9. Bobot terbaca Rp10.000.
10. Serapan menjadi Rp2.000.

Dampak: unit cost layer dan COGS salah.

Fix terkecil:

- Agregasi per item: `Σtotal / Σqty`.
- Alternatif: alokasikan per PO line, bukan per item.

Test regresi:

- PO duplikat 5@1000 dan 5@2000.
- GR 5 unit.
- Assert absorbed pool Rp1.000.
- Assert bukan Rp2.000.

---

## STOK-10 — MEDIUM — CONFIRMED
### Complete retur jual tidak atomik terhadap status awal

Lokasi:

- `src/actions/sales.actions.ts:2124-2131`
- `src/actions/sales.actions.ts:2169-2178`
- `src/lib/hooks/sales-return.hook.ts:38-41`
- `src/lib/hooks/sales-return.hook.ts:72-87`

Bukti:

- Action membaca status retur di luar transaksi.
- Action hanya lanjut bila snapshot berstatus draft.
- Transaksi tidak lock dan baca ulang status sebelum hook.
- Hook memang lock baris `sales_returns`.
- Hook hanya no-op bila completed/cancelled.
- Status antara draft dan completed tidak diklaim action.

Risiko utama bukan complete ganda sederhana.
Hook punya guard existing moves.
Risiko adalah status berubah ke keadaan lain di antara snapshot dan transaksi.
Action tidak punya klaim `draft -> processing/completed`.

Skenario:

1. Request A membaca retur draft.
2. Request B mengubah status retur.
3. Request A tetap masuk transaksi completion.
4. Hook memeriksa cancelled/completed saja.
5. Completion dapat menimpa transisi B.
6. Jurnal dan stok lahir dari snapshot lama.

Klasifikasi tetap CONFIRMED untuk cacat non-atomik.
Dampak race persis bergantung transisi pesaing.

Fix terkecil:

- Di transaksi, lock baris retur.
- Klaim `updateMany where status="draft"`.
- Hentikan bila klaim count 0.
- Panggil hook hanya sesudah klaim menang.

Test regresi:

- Mock status berubah sesudah snapshot.
- Assert hook stok tidak dipanggil.
- Assert tidak ada StockMove atau jurnal.

---

## STOK-11 — MEDIUM — CONFIRMED
### Update retur jual tidak lock baris retur dalam transaksi

Lokasi:

- `src/actions/sales.actions.ts:3634-3636`
- `src/actions/sales.actions.ts:3681-3693`

Bukti:

- Transaksi hanya lock faktur.
- Status retur dibaca ulang pada baris 3683-3686.
- Baris `sales_returns` tidak dikunci FOR UPDATE.
- Header update pada 3693 tidak bersyarat `status="draft"`.
- Item lama dihapus sebelum update header.

Skenario:

1. Request A membaca status draft.
2. Request B menyelesaikan atau mengubah retur.
3. Request A menghapus item lama.
4. Request A menulis item dan header baru.
5. Hasil dapat menimpa transisi B.

Risiko bergantung isolasi database dan timing.
Bukti cacat lock dan klaim tidak ada bersifat langsung.

Fix terkecil:

- Lock baris `sales_returns` di awal transaksi.
- Atau klaim update dengan `where status="draft"`.
- Lakukan klaim sebelum delete item.

Test regresi:

- Interleave update dan complete.
- Assert salah satu gagal.
- Assert item tidak hilang setengah.
- Assert status terminal tidak tertimpa.

---

## STOK-12 — MEDIUM — CONFIRMED
### Penambahan stok batch-tracked tidak dapat diselesaikan lewat form normal

Lokasi:

- `src/lib/hooks/stock-adjustment.hook.ts:191-198`
- `src/actions/inventory.actions.ts:205-212`
- `src/actions/inventory.actions.ts:244-250`
- `src/actions/inventory.actions.ts:311-325`

Bukti:

- Hook mewajibkan `batchNumbers` untuk item batch-tracked.
- `AdjustmentItemInput` hanya punya `serialNumbers`.
- Normalizer hanya meneruskan serial.
- Create StockAdjustmentItem tidak menyimpan batchNumbers.
- Jalur form tidak memberi identitas lot yang diminta hook.

Skenario:

1. Item `trackBatch=true`.
2. Stok aktual bertambah 6 unit.
3. Unit cost Rp50.000.
4. Draft adjustment Rp300.000 dibuat.
5. Draft tidak punya batchNumbers.
6. Process memanggil hook.
7. Hook throw karena lot kosong.
8. Tidak ada field normal untuk memperbaiki lot.
9. Adjustment tidak pernah bisa diposting.

Fix terkecil:

- Teruskan batchNumbers end-to-end.
- Tambah input lot untuk item trackBatch.
- Simpan pada StockAdjustmentItem saat create/update.

Test regresi:

- Create adjustment untuk item trackBatch.
- Assert batchNumbers tersimpan.
- Complete adjustment.
- Assert layer dan ItemBatch LOT-A bertambah.

---

## STOK-13 — MEDIUM — PLAUSIBLE
### Cancel WO tidak memeriksa Material Issue completed atau ProductionOrder anak

Lokasi:

- `src/actions/manufacturing.actions.ts:2740-2764`

Bukti:

- Cancel hanya lock WO.
- Cancel hanya klaim status `in_progress -> cancelled`.
- Cancel hanya release reservasi aktif.
- Tidak ada query MaterialIssue completed.
- Tidak ada query ProductionOrder anak aktif.

Skenario:

1. WO `in_progress`.
2. MI completed mengeluarkan material Rp2.000.000.
3. WO dibatalkan.
4. Reservasi sisa terlepas.
5. Material tetap keluar dan biaya tetap tercatat.
6. ProductionOrder anak dapat tetap aktif.
7. WO induk tampil cancelled.

Alasan PLAUSIBLE:

- BR-RES-11 hanya menetapkan release reservasi.
- Belum ada spec reversal MI saat cancel.
- Produk dapat memang memilih penyelesaian manual.

Fix terkecil:

- Tolak cancel bila MI completed atau PO anak aktif.
- Tawarkan jalur reversal eksplisit bila bisnis mengizinkan.

Test regresi:

- WO dengan MI completed.
- Cancel harus gagal.
- Assert status WO tetap in_progress.

---

## STOK-14 — MEDIUM — PLAUSIBLE
### Biaya non-material sesudah release parsial mengubah valuasi release berikutnya

Lokasi:

- `src/actions/production-cost.actions.ts:67-73`
- `src/lib/services/production-cost.service.ts:25-43`
- `src/actions/manufacturing.actions.ts:1315-1319`

Bukti:

- Production cost dapat ditambah pada order belum completed.
- Delta menaikkan `totalActualCost`.
- Completion parsial menyisakan `totalActualCost`.
- Completion berikutnya membagi biaya tersisa ke qty tersisa.
- Biaya baru karena itu masuk hanya ke release akhir.

Skenario:

1. Production order 10 unit.
2. Material cost Rp1.000.000.
3. Release 5 unit.
4. Release pertama @Rp100.000.
5. Tambah labor Rp200.000.
6. Sisa WIP menjadi Rp700.000.
7. Release akhir 5 unit @Rp140.000.
8. Dua batch produk sama punya biaya beda Rp40.000/unit.

Alasan PLAUSIBLE:

- Dapat dianggap biaya aktual periode berjalan.
- Belum ada spec alokasi ulang batch sebelumnya.

Fix terkecil:

- Batasi biaya baru sesudah release parsial pertama.
- Atau alokasikan biaya susulan ke semua unit direncanakan.

Test regresi:

- Release 5 dari 10.
- Tambah labor.
- Tentukan assert sesuai keputusan bisnis.
- Assert valuasi dua release konsisten dengan spec.

---

## STOK-15 — MEDIUM — PLAUSIBLE
### Service PO cost dibagi rata per ProductionOrder, bukan per output

Lokasi:

- `src/lib/services/production-cost.service.ts:150-154`

Bukti:

```ts
const perOrder = Math.round((desiredTotal / productionOrders.length) * 100) / 100
```

Komentar menyebut job output.
Implementasi tidak membaca qty/output ProductionOrder.
Sisa rounding hanya diberikan ke order pertama.

Skenario:

1. Satu service PO Rp10.100.000.
2. ProductionOrder A qty 100.
3. ProductionOrder B qty 1.
4. Masing-masing menerima Rp5.050.000.
5. Biaya jasa per unit A Rp50.500.
6. Biaya jasa per unit B Rp5.050.000.
7. HPP produk B sangat overstated.

Alasan PLAUSIBLE:

- Pembagian rata dapat menjadi kebijakan internal.
- Tidak ditemukan spec alokasi per qty.

Fix terkecil:

- Bobotkan berdasarkan qty direncanakan.
- Snapshot bobot saat service PO pertama disinkronkan.

Test regresi:

- Dua order qty 100 dan 1.
- Sync service Rp10.100.000.
- Assert alokasi proporsional qty.

---

## STOK-16 — MEDIUM — PLAUSIBLE
### Retur beli selalu mengambil gudang/UOM receipt terbaru per item

Lokasi:

- `src/lib/hooks/purchase-return.hook.ts:40-49`
- `src/lib/hooks/purchase-return.hook.ts:139-142`

Bukti:

- Receipt lines diurutkan `goodsReceipt.createdAt desc`.
- Map menyimpan receipt pertama per item.
- Hook memakai UOM dan warehouse receipt itu.
- Baris retur tidak menyimpan GR asal eksplisit.

Skenario:

1. GR1 menerima 10 unit di gudang A @Rp100.
2. GR2 menerima 10 unit di gudang B @Rp200.
3. Barang fisik dari A diretur 5 unit.
4. Retur tidak menyimpan GR1 sebagai sumber.
5. Hook memilih GR2 terbaru.
6. Stok keluar dari B @Rp200.
7. Relief persediaan salah Rp500.
8. Bila B kosong, retur gagal walau A tersedia.

Alasan PLAUSIBLE:

- UI dapat memang tidak memberi pilihan sumber.
- Fallback terbaru bisa jadi kebijakan saat ini.
- Tidak ditemukan spec tautan GR wajib.

Fix terkecil:

- Simpan `goodsReceiptItemId` dan warehouse per baris retur.
- Fallback terbaru hanya untuk data legacy.

Test regresi:

- Dua receipt A dan B.
- Retur tertaut GR1.
- Assert StockMove warehouse A.
- Assert FIFO cost dari A.

---

## STOK-17 — LOW — CONFIRMED
### IssueMaterial production order memakai tanggal order untuk guard expiry

Lokasi:

- `src/actions/manufacturing.actions.ts:1003-1010`
- `src/lib/hooks/material-issue.hook.ts:174-184`

Bukti:

- PO issue memakai `order.startDate ?? order.createdAt`.
- Material Issue memakai tanggal dokumen issue.
- Tanggal dokumen mengaktifkan guard expiry dan FEFO fisik.
- Tanggal issue aktual tidak diteruskan PO path.

Skenario:

1. Production order mulai 1 September.
2. Lot kedaluwarsa 15 September.
3. Issue aktual terjadi 20 Oktober.
4. Guard menilai 1 September.
5. Lot yang sudah expired pada issue aktual lolos.
6. Material Issue biasa akan menolak lot sama.

Dampak terbatas pada expiry/FEFO, bukan biaya FIFO.

Fix terkecil:

- Terima tanggal issue aktual dari action/UI.
- Teruskan tanggal itu sebagai `documentDate`.

Test regresi:

- Start date sebelum expiry.
- Issue date sesudah expiry.
- Assert consumeFifoLayers dipanggil dengan issue date.
- Assert lot expired ditolak.

---

## STOK-18 — LOW — CONFIRMED
### Duplicate PO item membuat snapshot qtyOrdered GR salah

Lokasi:

- `src/actions/purchase.actions.ts:1095-1097`
- `src/actions/purchase.actions.ts:167-171`

Bukti:

- `orderedQtyByItem` dibuat Map dari itemId.
- Baris PO duplikat menimpa qty sebelumnya.
- Setiap GR line membaca nilai terakhir.
- Nilai bukan total item pada PO.

Skenario:

1. PO item X punya dua baris.
2. Masing-masing qty 5.
3. Total pesanan item 10.
4. Map menyimpan qty terakhir 5.
5. GR line menulis `qtyOrdered=5`.
6. Detail GR tampil dipesan 5, bukan 10.

Dampak terbatas pada snapshot dan tampilan.
Stok tidak terdampak.

Fix terkecil:

- Agregasikan qty per item saat membuat Map.

Test regresi:

- PO duplicate lines 5 + 5.
- Create GoodsReceipt.
- Assert `qtyOrdered` item = 10.

---

## STOK-19 — LOW — PLAUSIBLE
### Dua draf penutupan selisih transfer dapat lahir bersamaan

Lokasi:

- `src/actions/inventory.actions.ts:908-920`
- `src/actions/inventory.actions.ts:941-970`

Bukti:

- Cek closure aktif memakai findFirst.
- Create draf terjadi di luar transaksi.
- Baris transfer tidak dilock FOR UPDATE.
- Schema tidak memberi unique guard pada transfer closure aktif.

Skenario:

1. Transfer punya sisa 4 unit.
2. Dua request menutup selisih bersamaan.
3. Keduanya membaca belum ada closure aktif.
4. Keduanya membuat draf adjustment.
5. Draf pertama menutup transfer.
6. Draf kedua menjadi yatim dan gagal diproses.

Dampak terbatas: jurnal ganda tidak terbukti.
Cabang process mengunci dan menghitung ulang sisa.

Fix terkecil:

- Bungkus cek dan create dalam satu transaksi.
- Lock baris transfer FOR UPDATE.

Test regresi:

- Panggil close dua kali paralel.
- Assert hanya satu draf aktif.
- Assert jurnal hanya lahir sekali.

---

## STOK-20 — LOW — PLAUSIBLE
### Update adjustment/transfer menghapus item sebelum klaim status aman

Lokasi:

- `src/actions/inventory.actions.ts:2040-2052`
- `src/actions/inventory.actions.ts:2210-2222`

Bukti:

- Jalur update menghapus item lama lebih dulu.
- Status dibaca ulang polos sesudah delete.
- Tidak ada lock baris dokumen FOR UPDATE.
- Tidak ada klaim kondisional status draft.

Skenario:

1. Adjustment berisi 10 unit.
2. Request A mulai update dan menghapus item.
3. Request B process mengklaim dokumen.
4. Hook membaca nol baris pada jendela delete.
5. Process dapat selesai tanpa StockMove.
6. Stok dan jurnal tidak sesuai dokumen final.

Interleave MariaDB belum dibuktikan end-to-end.
Karena itu klasifikasi PLAUSIBLE, bukan CONFIRMED.

Fix terkecil:

- Lock dokumen sebelum delete item.
- Atau klaim `updateMany where status="draft"` dulu.

Test regresi:

- Sisipkan process di antara delete dan recreate.
- Assert update gagal tanpa menghapus item.
- Assert process tidak membaca dokumen setengah jadi.

---

## Penutup

Prioritas perbaikan:

1. STOK-01 sampai STOK-05: uang, stok, lot, dan UOM.
2. STOK-06 dan STOK-12: dokumen stok buntu.
3. STOK-07 sampai STOK-11: reservasi, FIFO transfer, status race.
4. STOK-13 sampai STOK-20: keputusan domain dan hardening.

Audit tidak mengubah schema.
Audit tidak mengubah action, hook, service, test, atau file produk.
