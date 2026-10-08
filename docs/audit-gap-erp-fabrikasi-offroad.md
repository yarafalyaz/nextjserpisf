# Audit Gap ERP Fabrikasi Kendaraan Off-road Custom

**Status:** penilaian awal berbasis pembacaan schema, aksi manufaktur, hook Work Order, dan dokumen proyek. Ini bukan audit menyeluruh, sertifikasi, atau pengganti validasi proses lapangan.

**Batas arsitektur yang disepakati:** implementasi tetap pada stack repository saat ini (Next.js/TypeScript/Prisma/MariaDB). Arahan Laravel + React/Vite pada `docs/prd-erp-fabrikasi-offroad.md` tidak menjadi instruksi migrasi. Kebutuhan bisnis PRD dapat diadaptasi ke pola Next.js yang ada; penggantian database atau stack memerlukan keputusan terpisah.

## Ringkasan

YaraERP sudah memiliki fondasi ERP operasional: penjualan, pembelian, persediaan FIFO, jurnal, persetujuan, proyek, BOM sederhana, Production Order, Work Order, serta serial/batch pada persediaan. Namun, dari bagian yang ditinjau, sistem belum menunjukkan kapabilitas manufaktur kendaraan custom secara lengkap.

| Area | Kondisi awal | Prioritas |
| --- | --- | --- |
| Engineering/BOM dan revisi | BOM dasar; kontrol revisi dan snapshot order belum terlihat | P0 |
| QC, NCR, rework, keselamatan | Belum terlihat sebagai alur terstruktur | P0 |
| Traceability per kendaraan | Identitas kendaraan ada, keterkaitan komponen/pekerjaan perlu dilengkapi | P0 |
| Routing dan pelaporan operasi | Tahapan proyek ada, routing/work center produksi belum terlihat | P1 |
| HPP dan WIP aktual | Ada actual material cost/FIFO; tenaga kerja, jasa, overhead perlu dicakup | P1 |
| Integritas transaksi produksi | Ada transaksi dan idempotency di beberapa alur; beberapa helper memakai global Prisma | P0 |
| Perencanaan kebutuhan material | BOM ada, tetapi reservasi/MRP dan jadwal kapasitas belum terlihat | P1 |
| Uji bisnis end-to-end | Unit tests cukup luas; skenario pabrik menyeluruh perlu ditambah | P1 |

P0 = perlu ditangani sebelum mengandalkan sistem untuk traceability dan rilis unit; P1 = penting untuk perencanaan dan kendali biaya; P2 = peningkatan lanjutan.

## Temuan dan pekerjaan yang disarankan

### P0 — Kontrol engineering dan BOM berversi

**Temuan awal:** `ProductMaterial` menyimpan `productId`, `itemId`, dan `qty`; revisi/effective date/status persetujuan BOM tidak terlihat. `updateProduct` mengganti material BOM pada produk.

**Risiko:** BOM yang diedit dapat mengubah acuan produk, sedangkan order lama harus tetap menggunakan spesifikasi yang disetujui ketika order dibuat. Tanpa snapshot, histori alasan perubahan dan dampaknya sulit diaudit.

**Perbaikan:**
- Buat versi BOM dengan nomor revisi, status draft/approved/obsolete, tanggal berlaku, pembuat, approver, dan catatan perubahan.
- Simpan snapshot BOM dan versi engineering pada Production Order/Work Order saat dirilis; jangan membaca BOM master terkini untuk order yang sudah dirilis.
- Sediakan alur Engineering Change Order (ECO) dan daftar order/unit yang terdampak.
- Validasi bahwa produk tidak bisa dirilis ke produksi tanpa BOM yang disetujui dan material valid.

**Uji penerimaan:** revisi BOM baru tidak mengubah kebutuhan material order lama; revisi yang belum disetujui tidak dapat dipakai untuk order baru.

### P0 — QC, non-conformance, dan rilis kendaraan

**Temuan awal:** nama tahap proyek dapat mencakup “Quality Check”, tetapi model inspeksi/checklist, hasil terukur, NCR, dan keputusan release tidak terlihat pada schema yang diperiksa.

**Risiko:** status “selesai” tidak membuktikan bahwa unit lulus inspeksi teknis atau keselamatan. Produk dapat diteruskan ke pengiriman tanpa bukti quality gate yang dapat diaudit.

**Perbaikan:**
- Tambahkan template inspeksi per tipe pekerjaan/unit: item pemeriksaan, nilai/hasil, toleransi, foto/dokumen, inspector, waktu, alat ukur bila relevan.
- Buat NCR (non-conformance report), disposition (repair/rework/use-as-is/scrap), akar masalah, tindakan korektif, dan verifikasi ulang.
- Terapkan quality gate yang mencegah unit dikirim/ditutup jika inspeksi wajib belum lulus atau NCR kritis masih terbuka.
- Kelola checklist keselamatan dan uji fungsional kendaraan sesuai prosedur perusahaan dan regulasi yang berlaku.

**Uji penerimaan:** order tidak dapat masuk status siap kirim bila inspeksi wajib gagal/belum ada; rework harus menghasilkan pemeriksaan ulang dan jejak audit.

### P0 — Genealogi (traceability) per unit kendaraan

**Temuan awal:** `CustomerVehicle` menyimpan antara lain nomor rangka dan mesin; item mendukung pelacakan batch/serial. Belum dipastikan ada hubungan lengkap dari unit akhir ke semua komponen, lot pemasok, pemakaian material, dan inspeksi.

**Risiko:** sulit menelusuri komponen kritis yang terpasang pada unit tertentu, melakukan analisis cacat, atau menentukan unit terdampak jika pemasok/lot bermasalah.

**Perbaikan:**
- Tetapkan identitas unik setiap unit produksi/modifikasi dan hubungkan dengan customer vehicle, VIN/nomor rangka, nomor mesin, proyek, sales order, dan production/work order.
- Catat lot/serial aktual komponen saat issue/consumption dan saat pemasangan; jangan hanya menyimpan kuantitas agregat.
- Simpan riwayat pemasangan, penggantian, dan pelepasan komponen berikut pelaksana, waktu, alasan, dan dokumen pendukung.
- Buat tampilan genealogy dua arah: unit → komponen/lot dan lot/serial → semua unit terkait.
- Validasi keunikan dan format nomor rangka/mesin sesuai kebijakan perusahaan serta aturan setempat.

**Uji penerimaan:** dari sebuah serial/lot material dapat ditemukan semua unit pemakai; dari unit dapat ditampilkan seluruh lot/serial komponen terpasang dan riwayat inspeksinya.

### P0 — Atomisitas penyelesaian Work Order dan surat jalan

**Temuan awal:** `completeWorkOrder` melakukan claim status dalam transaksi, tetapi komentar di kode menyebut `autoCreateDeliveryOrder` dan `syncProjectStatus` memakai Prisma global sehingga tulisannya tidak masuk transaksi yang sama.

**Risiko:** kegagalan di tengah rangkaian dapat meninggalkan status Work Order selesai tanpa surat jalan atau sinkronisasi proyek yang konsisten. Pengamanan status mencegah sebagian duplikasi, tetapi tidak menyelesaikan konsistensi antar-tabel.

**Perbaikan:**
- Ubah helper terkait agar menerima `txClient` dan gunakan transaksi yang sama untuk claim, item, delivery order, dan sinkronisasi status yang wajib.
- Buat constraint/idempotency key yang mencegah surat jalan ganda untuk sumber Work Order yang sama.
- Pisahkan efek eksternal/non-kritis ke outbox atau job yang dapat diulang; simpan status proses dan mekanisme retry.
- Tambahkan uji fault injection untuk kegagalan setelah claim dan sebelum pembuatan dokumen turunan.

**Uji penerimaan:** jika satu langkah gagal, seluruh perubahan wajib rollback; retry setelah rollback sukses tanpa dokumen ganda.

### P1 — Routing operasi, work center, dan kapasitas

**Temuan awal:** proyek mempunyai tahapan umum/progress, tetapi routing produksi terstruktur dan work center belum terlihat.

**Perbaikan:**
- Definisikan routing per produk/konfigurasi: urutan operasi, work center, skill, durasi standar, instruksi kerja, dan quality gate.
- Catat mulai/selesai operasi, operator, jam kerja, downtime, hasil, dan kuantitas baik/cacat.
- Kelola kalender/kapasitas work center dan penjadwalan dasar agar estimasi tanggal selesai tidak hanya berupa tanggal manual.
- Dukung routing berbeda untuk fabrikasi baru, retrofit kendaraan pelanggan, dan pekerjaan subkontrak.

### P1 — Kebutuhan material, reservasi, dan pengadaan

**Temuan awal:** Production Order mengisi material dari BOM, dan issue material mengurangi stok FIFO. Perencanaan kebutuhan material, reservasi per order, dan shortage planning belum terlihat jelas.

**Perbaikan:**
- Hitung kebutuhan bersih dari BOM versi order, stok tersedia, stok ter-reservasi, safety stock, dan material yang sudah dipesan.
- Reservasi material per gudang/order; tampilkan kekurangan, tanggal kebutuhan, lead time pemasok, dan saran PR.
- Dukung substitusi material yang disetujui dengan jejak persetujuan dan dampak pada BOM/HPP.
- Pastikan warehouse scope berlaku konsisten pada seluruh baca/tulis stok.

### P1 — HPP, WIP, dan varians produksi

**Temuan awal:** model Production Order memiliki total biaya standar/aktual dan material aktual; issue material menghitung biaya FIFO. Biaya tenaga kerja, jasa/subkontrak, overhead, scrap/rework, dan alokasi WIP perlu ditinjau dan belum terlihat sebagai pencatatan biaya produksi lengkap.

**Perbaikan:**
- Pisahkan biaya material, tenaga kerja langsung, jasa/subkontrak, overhead, scrap, dan rework per order/unit.
- Tetapkan kebijakan alokasi biaya, periode pengakuan, serta perlakuan WIP dan varians; validasi bersama akuntansi perusahaan.
- Pastikan biaya aktual yang dikapitalisasi ke produk jadi sama dengan biaya WIP yang diselesaikan, dengan aturan pembulatan/selisih eksplisit.
- Tambahkan rekonsiliasi subledger persediaan/WIP dengan jurnal buku besar dan laporan varians per produk, order, serta proyek.

### P1 — Status dan transisi manufaktur yang eksplisit

**Temuan awal:** status proses disimpan sebagai `String`; ada guard transisi pada beberapa aksi, tetapi perlu audit menyeluruh atas seluruh status, pembatalan, penutupan, dan hak aksi.

**Perbaikan:**
- Definisikan state machine dan transisi legal untuk draft → confirmed/released → in progress → QC → completed/closed serta hold/cancel.
- Pastikan tiap transisi memiliki permission, validasi prasyarat, actor/timestamp, dan audit log.
- Hindari perubahan/edit BOM atau kuantitas order setelah issue material; gunakan amendment/return dengan jejak audit.
- Audit konsistensi penamaan status dan transisi di UI, server actions, hook, laporan, dan seed permission.

### P1 — Uji alur menyeluruh berbasis skenario bengkel

Tambahkan integration/E2E test yang meniru transaksi riil, bukan hanya pengujian helper:

1. Penawaran konfigurasi kendaraan → uang muka/konfirmasi → proyek/order.
2. Persetujuan BOM/revisi → perencanaan material → PR/PO → penerimaan dan inspeksi barang.
3. Reservasi → issue material FIFO/lot/serial → pencatatan tenaga kerja dan subkontrak.
4. Operasi produksi → QC gagal → rework → QC lulus.
5. Penyelesaian produksi → penerimaan barang jadi/genealogy → costing/WIP/jurnal.
6. Persetujuan serah terima → surat jalan/faktur/pembayaran.
7. Uji paralel, rollback kegagalan, periode terkunci, hak gudang, retur, dan pembatalan.

Gunakan `TZ=Asia/Jakarta` sesuai panduan repository. Untuk alur yang mengubah stok/jurnal, validasi saldo sebelum/sesudah, FIFO layer, serial/lot, dan jurnal double-entry.

### P2 — Kesiapan operasi dan tata kelola

- Simpan instruksi kerja, gambar, sertifikat material, hasil ukur, foto sebelum/sesudah, dan dokumen serah terima dengan versi dan hak akses yang memadai.
- Tetapkan backup teruji, pemulihan bencana, retensi audit, pemantauan job/cron, dan prosedur koreksi data.
- Validasi kebutuhan legal/sertifikasi kendaraan hasil modifikasi dengan pihak berwenang/ahli yang relevan; software tidak menggantikan inspeksi atau persetujuan regulasi.
- Sediakan dashboard keterlambatan operasi, shortage, NCR terbuka, biaya aktual vs estimasi, dan unit menunggu release.

## Urutan implementasi yang direkomendasikan

1. Petakan dulu proses aktual perusahaan: produksi unit baru, modifikasi kendaraan pelanggan, atau keduanya; tentukan dokumen wajib dan quality gate.
2. Tutup risiko konsistensi transaksi dan tambah integration test pada alur Work Order/Production Order.
3. Implementasikan identitas unit dan traceability komponen/lot/serial.
4. Implementasikan BOM versioning, approval, snapshot, dan engineering change.
5. Implementasikan QC/NCR/rework dan blokir rilis unit bila gate belum lulus.
6. Lengkapi routing, pencatatan tenaga kerja/subkontrak, material planning, dan perhitungan HPP.
7. Jalankan pilot dengan data nyata terbatas, rekonsiliasi stok/jurnal/HPP, lalu perluas setelah hasil disetujui pemilik proses.

## Batas audit ini

- Audit ini hanya berdasarkan pembacaan sebagian schema, aksi manufaktur, hook Work Order, dan dokumentasi yang tersedia.
- Daftar “belum terlihat” berarti belum ditemukan pada area yang diperiksa, bukan bukti pasti bahwa fitur tidak ada di bagian lain.
- Belum dilakukan eksekusi test suite, pemeriksaan database produksi, rekonsiliasi akuntansi, penetration test, atau validasi regulasi/teknis kendaraan.
- Jangan menerapkan migrasi perubahan schema ke database produksi tanpa backup, review migrasi, dan rencana rollback.
