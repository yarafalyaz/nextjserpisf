# PRD — YaraERP (silengkap)

**Status:** potret sistem yang berjalan (Oktober 2026), bahan migrasi ke Laravel.
**Bukan** desain Laravel. Bagian 12 hanya mencatat implikasi pindah.
**Sumber kebenaran data:** `prisma/schema.prisma`. **Sumber aturan kode:** `AGENTS.md`.
`skill.md` adalah peta lama (Laravel → Next.js) dan **tidak** selalu sama dengan kode sekarang — jangan dipakai sebagai spesifikasi.

---

## 1. Tujuan dokumen

Satu acuan supaya rebuild Laravel tidak mengulang tebakan:

- modul dan alur dokumen yang sudah dipakai pelanggan,
- aturan bisnis yang mahal kalau salah (stok, HPP, jurnal, periode, nomor dokumen, izin),
- batas yang sengaja belum selesai.

Yang tidak ada di dokumen ini tidak boleh dianggap "belum ada di sistem" tanpa cek kode.

## 2. Produk

ERP kustom untuk usaha yang jual barang **pindah-pindah toko**. Barang yang sama tidak punya satu harga jual tetap: ongkir, diskon, dan biaya lain menempel di transaksi, bukan di master.

Akibatnya HPP **bukan** harga master. HPP adalah biaya per penerimaan (FIFO layer), sudah termasuk landed cost. Lihat `docs/prd-hpp-landed-cost.md` (status: Implemented).

Mata uang IDR. Zona waktu operasional **Asia/Jakarta**. Tahun fiskal bisa dimulai bukan Januari (`SystemSetting.fiscalYearStartMonth`).

## 3. Stack sekarang

| Lapisan | Sekarang |
| --- | --- |
| App | Next.js 16 App Router, ~337 halaman, slug Indonesia |
| Data | Prisma 7 + MariaDB, adapter `PrismaMariaDb` |
| Auth | NextAuth v5, session JWT, kredensial email/password |
| UI | Tailwind 4, Server Component dulu, `"use client"` hanya jika perlu |
| Validasi | Zod |
| Tes | Vitest di samping kode; Playwright `e2e/` (port 4101, runtime standalone) |
| Gerbang request | `src/proxy.ts` (bukan `middleware.ts`): sesi, rate limit, CSP |

Pola lapisan (ini yang harus dipertahankan maknanya, bukan nama filenya):

- Halaman di `src/app/(dashboard)/<modul>/` hanya baca dan merender.
- Tulisan lewat `src/actions/*.actions.ts` (`"use server"`).
- Efek samping dokumen (jurnal, stok, status induk) di `src/lib/hooks/*.hook.ts`. Hook menerima `tx` opsional supaya ikut transaksi pemanggil. Ini pengganti Observer Laravel — **dipanggil eksplisit**, tidak otomatis.
- Mesin di `src/lib/services/*.service.ts`: FIFO, jurnal, kunci periode, nomor dokumen, landed cost, UoM, payroll.

## 4. Peta modul

Slug URL = folder di `src/app/(dashboard)/`.

| Slug | Isi |
| --- | --- |
| `master` | Akun, bank, barang, barcode, departemen, gudang, jabatan, karyawan, kategori barang/pelanggan/pengeluaran, kelompok pajak, merek, metode bayar & kirim, pajak, pelanggan, pemasok, satuan, syarat bayar |
| `penjualan` | Penawaran, uang muka, pesanan, faktur, pembayaran, retur, surat jalan |
| `pembelian` | Permintaan, pesanan, penerimaan, tagihan vendor, pembayaran vendor, retur |
| `inventaris` | Mutasi stok, penyesuaian, transfer, pengeluaran material, rak & baris rak, scan |
| `produksi` | Produk (BOM), perintah produksi, perintah kerja |
| `proyek` | Proyek, tahap, tugas, log |
| `kendaraan` | Merek, model, varian, kendaraan pelanggan |
| `sdm` | Absensi (lewat pengaturan/cron), cuti, lembur, lembar waktu, penggajian, pinjaman, apresiasi |
| `keuangan` | Jurnal, kas kecil, pengeluaran, anggaran, pusat biaya, rekonsiliasi & laporan bank, angka kunci statistik |
| `laporan` | Neraca, laba rugi, neraca saldo, buku besar, arus kas, buku bank, AR/AP jatuh tempo, ringkasan AR/AP, stok (ringkasan, mutasi, umur, valuasi), pajak, anggaran vs realisasi, laba rugi per pusat biaya & proyek, pusat laba |
| `aset` | Aset tetap, kategori, merek, transfer, riwayat |
| `crm` | Lead + aktivitas, tiket + komentar |
| `anggaran` | Alokasi SKF |
| `pengaturan` | Perusahaan, preferensi, mapping akun, penomoran, peran, pengguna, persetujuan, workflow, log, cron, database, penyimpanan, lembur & kehadiran |
| `notifikasi`, `profil` | Kotak masuk notifikasi, profil sendiri |

## 5. Identitas, izin, audit

- User punya banyak Role. Role punya banyak Permission (nama string, mis. `view_units`, `edit_units`).
- `super_admin` lolos semua `requirePermission()`.
- **Setiap server action baru wajib** `requirePermission()`. Tes `permission-seed-parity` gagal jika kode memakai izin yang tidak di-seed.
- Ada juga `Module` / `ModuleAction` / `RoleModuleAccess` untuk akses per modul di UI. Jangan disamakan dengan Permission; keduanya hidup.
- `UserWarehouse` membatasi gudang yang boleh dilihat user.
- `ActivityLog` mencatat aksi. `IdempotencyKey` mencegah submit ganda.
- Login rate-limit dan header keamanan di `src/proxy.ts`. `TRUSTED_PROXY=1` hanya jika setiap request lewat proxy yang menimpa IP klien.

## 6. Master yang menopang transaksi

**Barang (`Item`).** SKU, nama, kategori, merek, harga jual/beli referensi (bukan HPP), min stok, `qtyOnHand` (cache, bukan sumber kebenaran costing), `unitOfMeasure` **string** (bukan FK). Konversi satuan per barang di `UomConversion` (`code` + `factorToBase`), unik per `(itemId, code)`.

**Satuan (`UnitOfMeasure`).** Master name + symbol + kategori + faktor ke satuan dasar. Form barang (tambah & ubah) membaca master ini dan menyimpan **symbol** (uppercase). Master kosong → fallback PCS, SET, KG, LTR, MTR, BOX. Satuan alternatif di form barang **belum** diikat ke master yang sama.

**Gudang.** Gudang → Rak → Baris rak. Stok bergerak per gudang lewat `StockMove`, bukan lewat satu angka di barang.

**Mitra.** Pelanggan (kategori, kendaraan), pemasok. Keduanya punya syarat bayar.

**Akun.** Bagan akun. Akun default transaksi (piutang, pendapatan, persediaan, PPN, kas, clearing pembelian, dll.) ada di `SystemSetting`, diubah lewat Pengaturan → mapping akun. Jurnal tidak jalan jika akun wajib kosong — hook sering `return` diam. Ini harus terlihat di Laravel, jangan diam-diam skip.

**Pajak.** `Tax`, `TaxGroup`, `TaxGroupTax`. Pajak dokumen biasanya sudah jadi angka di header (`tax` / `taxAmount`), bukan dihitung ulang dari master saat posting.

## 7. Alur jual

Urutan longgar, bukan satu state machine kaku. Dokumen bisa lahir dari induk atau berdiri sendiri.

1. **Penawaran** (`Quotation`) ber-section dan item. Status sampai `accepted` / `converted`. Riwayat di `QuotationHistory`.
2. **Uang muka** (`DownPayment`). Konfirmasi (jika penawaran accepted dan belum pernah) membuat sekaligus: perintah kerja, proyek + tahap, pesanan jual, faktur. Idempoten: tolak jika dokumen turunan sudah ada.
3. **Pesanan jual** (`SalesOrder` + item).
4. **Faktur** (`SalesInvoice` + item). Posting menjurnal: Dr piutang, Cr pendapatan, Cr PPN keluaran jika ada. Tanggal jurnal = tanggal faktur.
5. **Pembayaran** (`SalesPayment`): Dr kas/bank, Cr piutang. `paidAmount` faktur naik. Status bayar terpisah dari status dokumen.
6. **Surat jalan** (`DeliveryOrder` + item) mengeluarkan stok.
7. **Retur jual** (`SalesReturn`): stok masuk kembali, jurnal Dr retur penjualan / Cr piutang.

Harga jual hidup di baris dokumen. Master harga hanya referensi.

## 8. Alur beli dan HPP

1. **Permintaan beli** → **Pesanan beli** (`PurchaseOrder` + item).
2. Diskon: hanya `PurchaseOrder.discount` = jumlah `PurchaseOrderItem.discount`. Tidak ada diskon header terpisah di form. `PurchaseOrderItem.total` sudah neto. Bobot alokasi = `total / qty`.
3. **Penerimaan** (`GoodsReceipt` + item). Ongkir (`shippingCost`) dan biaya lain (`otherCost`) di header GR. Kosong = 0, bukan "salin dari PO".
4. Verifikasi GR (`onGoodsReceiptVerified`):
   - Alokasi landed cost (`allocateLandedCost`): dua pool terpisah (ongkir+biaya, dan diskon). Hasil per unit = barang + ongkir − diskon. Basis = nilai barang (`baseQty × harga neto`), bukan qty. Ongkir aktual GR > 0 menimpa estimasi PO. Selisih rupiah ke baris bernilai terbesar.
   - Satu layer FIFO per baris, `unitCost` = biaya per satuan dasar **sudah landed**.
   - Jurnal: Dr persediaan, Cr akun clearing pembelian, sebesar Σ qty × biaya landed.
   - Qty diterima kumulatif tidak boleh lewat qty PO (over-receipt ditolak). `receivedQty` di item PO **bukan** sumber kebenaran.
5. **Tagihan vendor** (`VendorBill`): Dr clearing (sebesar grand total − pajak), Cr hutang, Dr PPN masukan. **Celah:** ongkir yang sudah masuk HPP bisa meninggalkan selisih clearing jika tagihan tidak sebesar nilai GR. Belum ditutup.
6. **Bayar vendor** (`VendorPayment` + alokasi ke tagihan).
7. **Retur beli:** stok keluar, jurnal Dr hutang / Cr persediaan.

GR yang sudah verified **tidak bisa diedit**. Koreksi ongkir setelah posting (revaluasi layer sisa) **belum ada** — sekarang hapus GR (jika belum ada tagihan aktif) lalu terima ulang. Hapus membalik mutasi, layer, qty, serial, jurnal, dan mengembalikan PO ke `ordered` jika GR terakhir.

## 9. Stok dan costing

- **Sumber kebenaran qty bergerak:** `StockMove` (IN/OUT, status posted). `Item.qtyOnHand` adalah cache yang di-update atomik.
- **Sumber kebenaran nilai:** `InventoryLayer` (FIFO). Konsumsi layer tertua dulu (`createdAt`, lalu `id`), `FOR UPDATE`. Sisa layer tidak boleh negatif. Kalau layer tidak cukup sementara qty cache cukup → error inkonsistensi, jangan buat layer berharga nol diam-diam.
- Metode costing di setting: FIFO. Jangan siapkan average sebagai jalur kedua kecuali diminta; seluruh jurnal stok menganggap satu biaya per mutasi.
- Dokumen stok lain: penyesuaian (`StockAdjustment`), transfer antar gudang, pengeluaran material (ke produksi/proyek, Dr beban / Cr persediaan).
- Batch (`ItemBatch`) dan serial (`ItemSerial`) ada. Serial yang sudah keluar tidak boleh dipakai lagi.
- Scan barcode lewat `Barcode` + halaman inventaris/scan.

## 10. Produksi, proyek, kendaraan

- **Produk** = barang jadi + `ProductMaterial` (BOM). `ProductionOrder` menarik bahan (`ProductionOrderMaterial`) dan menghasilkan barang jadi. Bahan keluar FIFO; barang jadi masuk layer dengan biaya dari bahan (+ biaya lain jika ada di dokumen).
- **Work order** terpisah dari production order: lahir dari uang muka / penawaran, terikat proyek.
- **Proyek** punya item, tahap (`ProjectStage`), progres, log, tugas (`Task`). Laporan laba rugi proyek membaca biaya dan pendapatan yang referensinya proyek.
- **Kendaraan:** merek → model → varian → kendaraan, lalu `CustomerVehicle`. Penawaran bisa menempel ke kendaraan pelanggan. `ProductVehicleModel` mengikat produk ke model kendaraan.

## 11. SDM dan keuangan lain

- Karyawan terikat departemen & jabatan. Absensi harian, jadwal, libur, libur departemen.
- Cuti (kuota), lembur (dengan penalti keterlambatan terpisah), timesheet, pinjaman karyawan, apresiasi.
- Penggajian (`Payroll`) memakai ringkasan absensi + komponen statutori (`payroll-statutory`). Jangan hitung ulang aturan BPJS/PPh di luar service itu tanpa membaca kodenya.
- **Pengeluaran** (`Expense`) butuh kategori. Disetujui → jurnal Dr beban / Cr kas. Tanggal jurnal = tanggal pengeluaran, bukan hari ini.
- **Kas kecil** (`PettyCash`): masuk Dr kas kecil / Cr sumber; keluar Dr beban / Cr kas kecil.
- **Anggaran** per akun/periode, pusat biaya, pusat laba, SKF + aturan alokasi. Laporan anggaran vs realisasi membandingkan anggaran dengan jurnal posted.
- **Bank:** mutasi impor (`BankStatement` + baris), rekonsiliasi mencocokkan baris ke jurnal/pembayaran.
- **Jurnal manual** (`Journal` + `JournalEntry`) tetap ada untuk penyesuaian. Jurnal otomatis memakai `referenceType` + `referenceId` (string + int, bukan FK). Balik dokumen harus balik atau void jurnal dengan referensi yang sama, idempoten.

## 12. Aturan lintas modul (wajib dibawa ke Laravel)

1. **Dokumen bertanggal** memanggil `assertPeriodOpen(tanggalDokumen)` di dalam transaksi yang sama dengan tulisannya. Periode terkunci menolak backdate. Jangan pakai `new Date()` kalau dokumen punya tanggal sendiri.
2. **Nomor dokumen** dari `DocumentSequence`, kunci baris, format dari pengaturan penomoran. Jangan `count()+1`.
3. **Transaksi atomik.** Induk + baris + stok + jurnal satu `transaction`. Hook yang sudah dapat `tx` tidak boleh buka transaksi baru.
4. **Izin** di action, bukan hanya di tombol UI.
5. **Idempoten.** Posting ulang, konfirmasi DP ulang, approve ulang tidak boleh menggandakan jurnal.
6. **Desimal uang** `Decimal(15,2)`. Jangan jumlahkan float lalu bulatkan di akhir tanpa aturan drift (landed cost sudah punya: selisih ke baris terbesar).
7. **Bahasa UI** Indonesia. Label status lewat `status-labels`, bukan enum mentah.

## 13. Implikasi pindah ke Laravel

Yang dipertahankan:

- Skema MariaDB (nama tabel snake_case sudah di-`@@map`). Laravel bisa memakai DB yang sama; jangan migrasi "bersih" yang mengubah arti kolom.
- Pemanggilan eksplisit efek samping (Action/Service), bukan Observer tersembunyi — Observer mudah terlewat saat balik dokumen.
- FIFO + landed cost + kunci periode + sequence sebagai service terpisah, dengan tes yang sama (angka, bukan snapshot UI).
- Izin string yang sama supaya seed dan UI tidak patah.

Yang tidak perlu ditiru:

- NextAuth JWT, `proxy.ts`, cache React, `"use client"`.
- Dua sumber schema validasi jika ada (`validators` vs `validations`) — di Laravel satu Form Request per action.
- `skill.md` sebagai spesifikasi; anggap usang jika bentrok dengan `schema.prisma` dan action.

Urutan migrasi yang aman: master + auth → stok/FIFO → beli/GR/landed → jual/jurnal → SDM/payroll → laporan. Laporan terakhir karena ia hanya membaca jurnal posted dan layer.

## 14. Sengaja belum selesai

- Revaluasi HPP setelah GR terposting (§5.4 `docs/prd-hpp-landed-cost.md`).
- Selisih clearing pembelian vs tagihan vendor bila ongkir masuk HPP tetapi tidak ada di tagihan.
- Dropdown satuan alternatif (bukan field Satuan utama) belum membaca master satuan.
- DB dev bisa hampir kosong; jangan anggap seed lengkap hanya karena aplikasi nyala.

## 15. Cara membuktikan perilaku

- Unit: `TZ=Asia/Jakarta npm test` (CI sama).
- Tipe: `npm run typecheck`. Lint: `npm run lint`.
- E2E: `npm run test:e2e` butuh DB ter-seed dan build standalone.
- Perilaku HPP: `src/lib/services/__tests__/landed-cost.test.ts` dan `src/lib/hooks/__tests__/goods-receipt-landed-cost.test.ts`.
