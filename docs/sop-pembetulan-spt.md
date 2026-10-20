# SOP Pembetulan SPT (Skema Replace Coretax)

| | |
|---|---|
| Dokumen | SOP pembetulan SPT Masa (PPN/PPnBM, PPh 21/26, PPh Unifikasi) dan SPT Tahunan |
| Berlaku untuk | Pembetulan disampaikan sejak 1 Oktober 2026 atas masa pajak 2025 dan seterusnya |
| Dasar | PER-12/PJ/2026 (mengubah PER-11/PJ/2025) — skema *replace* menggantikan *delta* [1][3] |
| Pemilik proses | Staf pajak / akunting Silengkap |
| Teman dokumen | `docs/rekomendasi-pembetulan-spt-coretax-ebupot.md` (riset t_08e20833, dasar R1–R8) |
| Sifat | Prosedur operasional. Dokumen ini **bukan** pengganti teks PER-12/PJ/2026; untuk hitungan yang dipersengketakan, rujuk teks peraturan + Lampiran [1] |

Penanda: **[Aturan]** = ketentuan regulasi bersumber. **[Buku]** = perlakuan di pembukuan Silengkap. **[Larangan]** = tidak boleh dilakukan.

---

## 1. Prinsip yang tidak boleh dilanggar

1. **Period lock TIDAK dibuka untuk pembetulan SPT.** Sekali lagi, eksplisit: **period lock tidak dibuka** — tidak untuk pembetulan SPT, tidak untuk “menyelaraskan angka masa lalu”, tidak atas permintaan siapa pun termasuk konsultan. Sistem memang menegakkannya: jurnal bertanggal pada/sebelum `SystemSetting.periodLockDate` ditolak oleh `assertPeriodOpen` (`src/lib/services/period-lock.service.ts`). Membuka kunci merusak jejak audit periode yang sudah dilaporkan dan sudah ditutup.
2. **Pembetulan SPT ≠ membetulkan buku masa lalu.** Pembetulan terjadi di **Coretax** (sisi pajak). Koreksi di **buku** selalu berupa jurnal baru **bertanggal periode berjalan** (tanggal hari koreksi dibuat, dan tanggal itu harus sesudah tanggal kunci periode). Histori jurnal lama tidak diedit dan tidak dihapus.
3. **Coretax adalah sumber kebenaran status lapor dan saldo kompensasi.**[1] Silengkap adalah sumber kebenaran **pembukuan** (jurnal, dokumen). Keduanya sah berbeda setelah pembetulan — selisihnya **dijelaskan**, bukan dipaksa sama (lihat §6).
4. **SPT pembetulan terakhir adalah patokan hak dan kewajiban** wajib pajak di Coretax.[1] Karena itu yang dicatat dan dibandingkan selalu **versi terakhir**, bukan gabungan versi-versi.

## 2. Kapan skema *replace* dipakai — dan kapan TIDAK

**[Aturan]** Skema *replace* berlaku untuk pembetulan yang **disampaikan sejak 1 Oktober 2026** atas **periode pajak 2025 dan seterusnya**, untuk SPT Masa PPh 21/26, PPh Unifikasi, PPN & PPnBM, serta SPT Tahunan PPh OP dan Badan.[1][3]

Artinya dalam SOP ini:

| Situasi | Perlakuan |
|---|---|
| Masa ≥ 2025, pembetulan disampaikan ≥ 1 Okt 2026 | **Skema *replace*** — SOP ini berlaku penuh. Sampaikan **seluruh isi SPT masa itu versi terakhir**, bukan daftar perubahan.[1][3] |
| Masa < 2025 (2024 dan sebelumnya) | **Aturan lama** — ikuti ketentuan pembetulan yang berlaku untuk masa tersebut. **Paket *replace* (CSV R2) TIDAK dipakai** untuk masa ini. |
| Pembetulan disampaikan **sebelum** 1 Okt 2026 | **Aturan lama** (proses *delta* sebagaimana berlaku saat itu), walau masanya ≥ 2025.[1][3] Paket *replace* tidak dipakai. |

**[Larangan]** Jangan memakai paket CSV “paket pembetulan replace” (R2) untuk dua baris terakhir tabel di atas. Paket itu dirancang untuk penyampaian *replace*: isi utuh satu masa versi terakhir.

Catatan batas: artikel DJP [1] adalah ringkasan resmi, bukan teks PER-12/PJ/2026 itu sendiri. Bila ada keraguan soal tanggal/masa yang masuk ketentuan baru, putuskan dari teks PER + Lampirannya, bukan dari SOP ini.[1]

## 3. Ringkasan alur (satu halaman)

```
1. Putuskan: masa & tanggal sampaikan masuk replace? (§2)
      └─ tidak → aturan lama, berhenti di sini.
2. Siapkan data versi terakhir SATU masa penuh dari Silengkap (paket CSV R2).
3. Cocokkan total paket CSV vs total laporan PDF masa sama (tie-out, §4 langkah 3).
4. Sampaikan SPT pembetulan di Coretax (key-in atau converter DJP) — isi utuh, bukan selisih.
5. Simpan Bukti Penerimaan Elektronik (BPE) dari Coretax.
6. Catat versi + nomor BPE (§5): register R4 bila sudah ada;
   sebelum R4 ada → TaxPayment.reference / catatan masa.
7. Bacakan saldo kompensasi Coretax sesudah pembetulan, cocokkan vs buku (§6).
8. Bila angka buku harus berubah: jurnal koreksi/pembalik bertanggal
   PERIODE BERJALAN (§7). Period lock tetap terkunci.
9. Arsipkan paket: CSV + PDF tie-out + BPE + jurnal koreksi (bila ada) per masa.
```

## 4. Langkah A — Siapkan dan sampaikan pembetulan di Coretax

1. **Tentukan masa dan jenis SPT** yang dibetulkan (PPN, PPh 21/26, Unifikasi, atau Tahunan) dan nomor pembetulan ke-berapa (pembetulan ke-1, ke-2, …). Satu paket = satu jenis SPT = satu masa. Jangan mencampur masa.
2. **Ambil paket data dari Silengkap (paket CSV R2).** Paket berisi **seluruh dokumen `posted/partial/paid` masa itu versi final saat export** — bukan hanya dokumen yang berubah. Di bawah *replace*, SPT yang disampaikan adalah isi utuh; menyampaikan hanya baris berubah sama dengan menyampaikan SPT yang hilang baris.[1][3]
   - Per baris minimal: tanggal, nomor faktur pajak (dari R1 bila sudah tercatat; sebelum R1 ada, nomor internal + catatan pemetaan manual ke nomor faktur Coretax), nomor internal, pihak + NPWP/NIK, DPP, tarif, PPN/PPh, total.
   - Nama berkas memuat jenis + masa + timestamp + label `PEMBETULAN-REPLACE`. Berkas tanpa label itu dianggap paket SPT normal — jangan unggah sebagai pembetulan.
3. **Tie-out sebelum menyentuh Coretax (wajib, angka disebut).** Total DPP dan total pajak pada paket CSV harus **sama persis sampai sen** dengan total laporan PDF masa yang sama (`faktur-ppn` / `pajak` / `bukti-potong-pph`). Catat di lembar kerja masa itu:
   - total DPP CSV = Rp… ; total DPP PDF = Rp… ; selisih = Rp0,00
   - total pajak CSV = Rp… ; total pajak PDF = Rp… ; selisih = Rp0,00
   
   Selisih ≠ 0 → **berhenti**. Cari dokumen draft/void yang ikut ter-export atau dokumen posted yang terlewat. Jangan “menyesuaikan” angka di Coretax agar cocok.
4. **Sampaikan di Coretax.** Isi SPT pembetulan sebagai **SPT utuh versi terakhir** masa itu (key-in dari paket, atau lewat converter Excel→XML DJP untuk jenis yang tersedia [2]). Untuk PPN: data faktur di Coretax terposting otomatis ke SPT Masa terkait [5], jadi periksa daftar faktur masa itu di Coretax dulu — koreksi faktur yang salah di modul faktur Coretax, lalu pastikan SPT-nya mencerminkan versi terakhir sebelum disampaikan.
   - Jangan menyampaikan angka “selisih dari SPT sebelumnya” (itu pola *delta* lama).
   - **[Aturan]** PKP tidak perlu membetulkan masa-masa di antara masa yang dibetulkan dan masa pembetulan disampaikan; selisihnya ditampung mekanisme penyesuaian saldo kompensasi.[4] Jangan membuat rangkaian pembetulan berantai hanya untuk “mengejar”masa antara.
5. **Terima dan simpan BPE.** Unduh Bukti Penerimaan Elektronik, catat **nomor BPE** dan **tanggal/jam penyampaian** persis seperti tercetak. BPE adalah bukti versi itu yang berlaku.

## 5. Langkah B — Catat versi dan BPE sesudah lapor

Setiap penyampaian (normal maupun pembetulan) meninggalkan satu baris catatan. Tanpa catatan ini, tidak ada yang bisa menjawab “angka Coretax masa X sekarang versi berapa”.

**Sesudah register R4 (`SptFiling`) tersedia** — catat di register, satu baris per penyampaian, **append-only** (versi lama tidak ditimpa):

- jenis SPT (`ppn` / `pph21` / `unifikasi` / `tahunan`), masa (`YYYY-MM`)
- versi: `normal`, `pembetulan-1`, `pembetulan-2`, …
- tanggal lapor, **nomor BPE**
- kurang/lebih bayar menurut SPT versi itu (dari Coretax, input manual)
- **saldo kompensasi menurut Coretax sesudah lapor** (dari Coretax, input manual — lihat §6)
- tautan opsional ke `TaxPayment` bila ada pembayaran terkait

**Sebelum R4 tersedia (keadaan hari ini)** — catat manual, jangan menunggu sistem:

- Di `TaxPayment` pembayaran masa terkait: isi `reference` dengan nomor BPE (kolom ini hari ini dipakai nomor SSP/MPN — bila keduanya ada, tulis keduanya, mis. `BPE 1234567890123; SSP/MPN …`), dan `period` dengan masa `YYYY-MM` (`prisma/schema.prisma`, model `TaxPayment`).
- Bila tidak ada pembayaran terkait (mis. SPT lebih bayar tanpa setor), catat di **catatan masa**: satu berkas/lembar per masa berisi tabel versi (normal/pembetulan ke-n, tanggal, nomor BPE, kurang/lebih bayar, saldo kompensasi Coretax). Simpan bersama arsip paket §3 langkah 9.
- **[Larangan]** Jangan menimpa catatan versi sebelumnya. Pembetulan ke-2 menambah baris, bukan mengedit baris pembetulan ke-1.

**[Buku]** Register/catatan ini **bukan posting GL**: mencatat lapor tidak membuat jurnal apa pun dan tidak tunduk pada period lock. Debit = kredit tidak tersentuh oleh langkah ini.

## 6. Langkah C — Cocokkan saldo kompensasi Coretax vs posisi buku

**[Aturan]** Pada pembetulan SPT Masa PPh 21/26 dan PPN, Coretax **otomatis memperbarui saldo tabel kompensasi**. Selisih penyesuaian yang timbul **dapat bernilai negatif** dan **otomatis diperhitungkan pada SPT Masa berstatus normal pertama yang disampaikan berikutnya**.[1]

Konsekuensi praktis yang harus diterima staf:

1. Sesudah pembetulan masa X, **bacakan saldo kompensasi di Coretax** (tabel kompensasi masa itu / masa berjalan) dan catat angkanya di register/catatan masa (§5). Angka ini **input dari Coretax**, bukan hasil hitung Silengkap.
2. Bandingkan tiga angka masa itu, dan sebut ketiganya secara eksplisit di lembar kerja:
   - **Per buku**: posisi dari jurnal (akun PPN Keluaran / PPN Masukan terpetakan, lihat laporan `rekonsiliasi-ppn` sisi buku).
   - **Per dokumen**: keluaran − masukan dari dokumen masa itu (`buildVatPosition`, `src/lib/reports/vat-reconciliation.ts`).
   - **Per Coretax**: kurang/lebih bayar SPT **versi terakhir** + saldo kompensasi Coretax sesudahnya.
3. **Selisih buku vs Coretax sesudah pembetulan adalah wajar dan permanen.** Penyebab sahnya antara lain: (a) pembetulan mengubah angka masa lama di Coretax, sedangkan buku mengoreksi di periode berjalan (§7) sehingga per-masa tidak akan pernah sama lagi; (b) selisih penyesuaian kompensasi Coretax (termasuk yang negatif) yang baru masuk hitungan di SPT normal berikutnya [1]; (c) kompensasi masa antara yang ditampung Coretax tanpa pembetulan berantai [4].
4. **[Larangan] Jangan memaksa saldo buku sama dengan saldo Coretax** — jangan membuat jurnal “penyesuaian kompensasi” hanya agar angka tampil sama, jangan mengubah saldo awal, dan jangan membuka period lock. Selisih dijelaskan dalam satu kalimat alasan di register/catatan masa, mis.: `Selisih Rp… = penyesuaian kompensasi Coretax atas pembetulan masa 2026-03 (BPE …), diperhitungkan Coretax di SPT normal berikutnya [1]; buku koreksi via JRN … tanggal …`.
5. Selisih yang **harus** diselidiki (bukan dijelaskan lalu dibiarkan): selisih per buku vs per dokumen pada masa yang sama, dan selisih total paket CSV vs PDF pada §4 langkah 3. Dua selisih itu menandakan kesalahan posting/export, bukan efek pembetulan.

Saat SPT normal masa berikutnya disampaikan, periksa bahwa selisih penyesuaian kompensasi dari pembetulan memang sudah diperhitungkan Coretax di masa itu [1], lalu catat hasilnya di baris register masa berikutnya. Rantai ini yang membuat selisih §6 langkah 3 bisa ditutup penjelasannya dari masa ke masa.

## 7. Langkah D — Koreksi di buku (bila angka buku memang harus berubah)

Pembetulan SPT sering berarti angka yang dulu diposting memang keliru. Koreksinya di buku mengikuti pola yang sudah ada di sistem — bukan jalur khusus pembetulan:

1. **Jangan edit, jangan hapus jurnal lama.** Jurnal `POSTED` tidak diedit dan tidak dihapus; histori dipertahankan.[Buku: `reverseJournalsByReferenceTx`, `src/lib/hooks/accounting.hook.ts:169-240`]
2. **Dua pola yang sah, pilih sesuai keadaan tanggal:**
   - **Dokumen sumbernya yang salah dan masa dokumen masih terbuka** (tanggal jurnal ≤ tanggal kunci **tidak** berlaku — artinya tanggalnya sesudah kunci): pakai pembalikan dokumen existing `JRN-RV` — debit↔kredit ditukar, jurnal asli ditandai `REVERSED`, idempoten (menjalankan ulang tidak membuat pembalik kedua), lalu posting dokumen yang benar. Perhatikan: pola existing ini membuat jurnal pembalik **bertanggal sama dengan jurnal asli** dan akan **ditolak `assertPeriodOpen` bila tanggal asli sudah terkunci** — itu memang disengaja.
   - **Masa asal sudah terkunci** (keadaan normal saat pembetulan ditemukan): buat **jurnal koreksi baru bertanggal periode berjalan** lewat Jurnal Umum (`createJournal` → `postJournal`, `src/actions/finance.actions.ts`) — tanggal = tanggal koreksi dibuat, wajib sesudah tanggal kunci. Isi hanya **selisih** yang perlu dikoreksi (atau balik penuh lalu posting ulang versi benar, keduanya di periode berjalan). Deskripsi wajib menyebut: masa asal, nomor BPE pembetulan, dan alasan, mis. `Koreksi PPN Keluaran masa 2026-03 atas pembetulan SPT (BPE …): keluaran turun Rp…`.
3. **Syarat angka jurnal koreksi (dicek sebelum posting):**
   - total debit = total kredit persis (sistem menolak jurnal tidak balance di `postJournal`);
   - akun yang dipakai akun PPN/PPh yang sama dengan posting asal (akun terpetakan di Pengaturan → Mapping Akun), bukan akun penampung baru;
   - satu jurnal koreksi per pembetulan per masa — jangan dicicil beberapa jurnal untuk satu BPE, agar jejak BPE ↔ jurnal satu-satu;
   - jurnal koreksi **tidak** mengubah masa asal: laporan per-masa masa asal tetap menampilkan angka asal; angka koreksi tampil di masa periode berjalan. Ini disengaja dan menjadi penyebab selisih sah di §6 langkah 3(a).
4. **Bila pembetulan tidak mengubah angka buku** (mis. hanya salah klasifikasi di SPT, atau angka Coretax yang dikoreksi sedangkan buku sudah benar): **tidak ada jurnal**. Catat “tanpa jurnal koreksi — buku sudah sesuai” di register/catatan masa beserta alasannya. Jangan membuat jurnal nol atau jurnal penyeimbang artifisial.
5. Pembayaran/penyetoran yang timbul dari pembetulan (kurang bayar bertambah) dicatat sebagai `TaxPayment` baru bertanggal pembayaran aktual (periode berjalan) dengan `period` = masa yang dibetulkan dan `reference` = nomor SSP/MPN + nomor BPE terkait (§5). Jurnalnya mengikuti jurnal penyetoran existing (Dr utang pajak / Cr kas-bank) — jangan memposting pembayaran ke masa terkunci.

## 8. Yang dilarang (daftar periksa cepat)

- [ ] Membuka period lock (`periodLockDate`) untuk alasan pembetulan apa pun.
- [ ] Mengedit/menghapus jurnal `POSTED` atau dokumen masa terkunci agar “sesuai SPT baru”.
- [ ] Menyampaikan hanya baris berubah (pola *delta*) untuk pembetulan *replace* masa ≥2025 yang disampaikan ≥ 1 Okt 2026.
- [ ] Memakai paket *replace* untuk masa <2025 atau penyampaian sebelum 1 Okt 2026.
- [ ] Membuat jurnal agar saldo buku tampil sama dengan saldo kompensasi Coretax.
- [ ] Menimpa catatan versi/BPE sebelumnya.
- [ ] Menyampaikan ke Coretax sebelum tie-out CSV vs PDF = Rp0,00.
- [ ] Mengarang nomor BPE, saldo kompensasi, atau angka Coretax — semua angka Coretax di register adalah **salinan dari Coretax**, bukan hitungan/ingatan staf.

## 9. Arsip per masa (satu map per jenis SPT + masa)

1. Paket CSV R2 yang disampaikan (nama berkas berlabel `PEMBETULAN-REPLACE` + timestamp).
2. Laporan PDF masa sama + catatan tie-out §4 langkah 3 (tiga pasang angka + selisih).
3. BPE (PDF/tangkapan) + baris register/catatan masa §5.
4. Bacaan saldo kompensasi Coretax sesudah lapor + penjelasan selisih §6.
5. Jurnal koreksi periode berjalan (nomor `JRN-…`/`JRN-RV-…`) bila ada, atau catatan “tanpa jurnal” §7 langkah 4.

## 10. Rujukan silang

- Halaman laporan pajak (`/laporan/pajak`, `/laporan/faktur-ppn`, `/laporan/rekonsiliasi-ppn`) **perlu tautan teks ke SOP ini** (“SOP Pembetulan SPT” → berkas ini). Itu pekerjaan kartu frontend kecil tersendiri — **tidak dibuat dalam kartu SOP ini**; minta ke bot-frontend/bot-pr-git sebagai kartu lanjutan kecil (teks tautan saja, tanpa perubahan logika laporan).
- Paket data yang dirujuk §4 adalah R2 (export CSV paket pembetulan *replace*) dan nomor faktur pajak R1 dari riset t_08e20833; sebelum keduanya tersedia, paket disusun manual dari laporan `faktur-ppn`/`pajak`/`bukti-potong-pph` masa yang sama dengan tie-out yang sama (§4 langkah 3 tetap wajib).
- Register versi + saldo kompensasi yang dirujuk §5–§6 adalah R4 (`SptFiling`, P1). Sampai R4 tersedia, catatan manual §5 adalah prosedur resmi, bukan improvisasi.

## Sources

[1] https://www.pajak.go.id/id/artikel/goodbye-skema-delta-coretax-kini-terapkan-skema-replace-mulai-1-oktober-2026-12pj2026 — DJP PER-12/PJ/2026 skema replace
[2] https://www.pajak.go.id/id/reformdjp/coretax/template-xml-dan-converter-excel-ke-xml — DJP Template XML Converter Coretax
[3] https://news.ddtc.co.id/berita/nasional/1822905/per-12pj2026-terbit-djp-rombak-skema-delta-dalam-pembetulan-spt — DDTC PER-12 rombak delta
[4] https://ortax.org/per-11-2025-diubah-pembetulan-spt-tak-lagi-pakai-skema-delta — Ortax PER-12 replace
[5] https://www.pajak.go.id/id/reformdjp/coretax-spt — DJP SPT Masa Coretax faktur auto-posting
