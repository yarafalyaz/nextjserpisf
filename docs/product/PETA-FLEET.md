# PETA FLEET — ERP ISF

**Status:** dokumen operasional fleet. Mengikat peta aturan produk ke
lane kerja bot supaya kerja terus berjalan **berarah** — bukan mesin
tanpa peta. Bukan klaim audit, bukan persetujuan owner atas keputusan
bisnis apa pun.

Dokumen ini tidak menambah aturan bisnis baru. Aturan tetap milik
[BUSINESS-RULES.md](BUSINESS-RULES.md) dan
[ACCEPTANCE-CRITERIA.md](ACCEPTANCE-CRITERIA.md); dokumen ini hanya
mengatur **dari mana kartu kerja boleh lahir, siapa mengerjakan,
dengan urutan apa, dan kapan berhenti**.

## 1. Sumber kerja tunggal

Kartu kerja fleet **hanya boleh lahir dari tiga sumber**:

| # | Sumber | Isi yang dipakai |
| --- | --- | --- |
| 1 | [INDEKS-ATURAN.md](INDEKS-ATURAN.md) | Status per ID aturan: `Belum`, `Sebagian`, `OPEN-keputusan` (juga `Terpasang`) |
| 2 | [../erp-research-backlog.md](../erp-research-backlog.md) | Spec riset `F-…-S` dan vonis `F-…-V` |
| 3 | [KEPUTUSAN-TERVERIFIKASI.md](KEPUTUSAN-TERVERIFIKASI.md) | Keputusan tertutup/sebagian/OPEN hasil verifikasi kode, termasuk daftar "Keputusan yang masih OPEN" |

Aturan lahir kartu:

- Tiap kartu **wajib** memuat minimal satu ID di judul atau body:
  ID aturan (`GL-BR-*`, `INV-BR-*`, `PUR-BR-*`, `SAL-BR-*`,
  `FIN-BR-*`, `PROJ-BR-*`, `WO-BR-*`, `HR-BR-*`, atau `AC-*`) dari
  sumber 1, **atau** ID spec/vonis (`F-…-S` / `F-…-V`) dari sumber 2.
- Kartu tanpa ID dari tiga sumber itu **tidak sah**: jangan dibuat,
  jangan di-spawn, jangan dikerjakan. Kembalikan ke sumbernya —
  minta BUSINESS menulis spec atau ACCOUNTANT memberi vonis dulu
  (lihat §3 dan §5).
- Status `Terpasang` di INDEKS-ATURAN bukan pekerjaan. Jangan buat
  kartu dari baris `Terpasang` kecuali ada ID `AC-*` terkait yang
  belum terbukti oleh test (pekerjaan QA, §4 langkah 4).
- Bila INDEKS-ATURAN bertentangan dengan kode terbaru, kode dan test
  yang berjalan menang — perbarui indeks pada PR yang sama (§4).

## 2. Urutan prioritas antrean

Ambil dari atas. Jangan lompat ke antrean bawah selama antrean atas
masih punya item yang bisa digerakkan oleh peranmu.

### (a) `OPEN-keputusan` ditutup dulu — oleh peran vonis, tanpa kartu implementasi

Baris `OPEN-keputusan` di INDEKS-ATURAN dan daftar OPEN di
KEPUTUSAN-TERVERIFIKASI **bukan** bahan kartu builder. Penutupnya
adalah keputusan tertulis, bukan kode:

- **ACCOUNTANT** — vonis untuk keputusan jurnal, akuntansi, dan
  pajak (mis. sisa `FIN-BR-*`, posting akuntansi, parameter
  statutori/payroll, pajak).
- **BUSINESS** — vonis/keputusan untuk keputusan workflow dan
  perilaku bisnis non-akuntansi (mis. sisa `INV-BR-*`, `PUR-BR-*`,
  `SAL-BR-*`, `PROJ-BR-*`, `WO-BR-*`, `HR-BR-*` yang bersifat alur).

Selama keputusan masih OPEN: **tidak ada kartu implementasi** untuk
ID itu. Kartu implementasi baru boleh lahir setelah keputusan
tertulis masuk ADR di [ADRs/](ADRs/) atau diperbarui di
KEPUTUSAN-TERVERIFIKASI, dan status baris terkait di INDEKS-ATURAN
berubah pada commit/PR yang sama.

### (b) `Belum` prioritas P0

Sesudah (a) tidak lagi memblokir lane-mu, ambil baris `Belum` yang
masuk risiko **P0** menurut [TEST-STRATEGY.md](TEST-STRATEGY.md) §3:

> **P0:** stok, pembayaran, hutang/piutang (AP/AR), faktur, payroll
> posting, permission, audit, data migration.

Baris `Belum` di luar P0 menunggu di bawah (c)/(d).

### (c) `Sebagian`

Baris `Sebagian`: penegakan menyeluruh belum terbukti. Pekerjaannya
adalah menutup celah penegakan atau membuktikan dengan test — bukan
menulis ulang fitur dari nol. Urutkan tetap dengan risiko P0 → P1 →
P2 dari TEST-STRATEGY §3.

### (d) Riset backlog — spec baru hanya dari BUSINESS dan ACCOUNTANT

Spec (`F-…-S`) dan vonis (`F-…-V`) baru di
`docs/erp-research-backlog.md` hanya ditulis oleh:

- **BUSINESS** — penulis spec dan riset.
- **ACCOUNTANT** — vonis atas spec (uang, jurnal, pajak).

Riset bersifat **read-only terhadap kode**: riset tidak mengubah
kode dan **tidak langsung melahirkan kartu builder**. Kartu builder
baru lahir setelah spec punya vonis yang dibutuhkan (§5) dan masuk
rantai §4.

## 3. Lane peran

Satu kartu = satu owner lane. Lintas lane lewat LEAD, bukan saling
mengambil kartu.

| Peran | Lane | Bukan lane-nya |
| --- | --- | --- |
| **LEAD** | Kontrak lintas domain, dependency antar-kartu, urutan merge, konflik file inti lintas domain. Pemegang gerbang merge bersama CEO (§4) | Menulis ulang pekerjaan lane lain tanpa koordinasi |
| **BACKEND** | Inti `INV`/`PUR`: stok, ledger, FIFO, receipt, PO, vendor bill/AP, hook dan service inti | UI/status dokumen; vonis akuntansi |
| **FRONTEND** | UI dan status dokumen: halaman, form, tampilan status/draft/posted, label status | Mengubah aturan posting/ledger di belakang UI |
| **ACCOUNTANT** | `FIN` dan akunting `SAL`: jurnal, AP/AR akuntansi, pembayaran, pajak; **vonis** untuk semua keputusan jurnal/pajak (§2a) | Menulis spec workflow non-akuntansi |
| **BUSINESS** | Spec `SAL`/`HR` dan riset backlog (`F-…-S`); keputusan workflow (§2a) | Vonis jurnal/pajak; kode inti |
| **QA** | Vonis per `AC-*`: `LOLOS` / `MINTA UBAH`, selalu terikat SHA yang diuji (§4) | Mengubah kode fitur untuk meloloskan vonisnya sendiri |

Kartu yang menyentuh dua lane dipecah mengikuti rantai §5, dengan
kontrak antar-lane ditetapkan LEAD sebelum kartu inti dibuka.

## 4. Loop tertutup per paket

Satu paket selesai hanya bila seluruh loop ini berputar. Tidak ada
status "selesai" di tengah loop.

1. **Putusan** — keputusan tertulis ada: ADR di
   [ADRs/](ADRs/), baris KEPUTUSAN-TERVERIFIKASI, atau vonis
   `F-…-V` di backlog. Tanpa putusan, berhenti di §2a.
2. **Kartu ber-ID** — kartu dibuat dari sumber §1, memuat ID
   aturan/spec, owner lane §3, parents/gate (kartu atau putusan
   yang harus selesai lebih dulu), dan `AC-*` yang akan divonis QA.
3. **PR** — berisi kode **dan** perubahan status dokumen dalam
   commit/PR yang sama: bila status ID berubah
   (`Belum`/`Sebagian`/`OPEN-keputusan` → status baru), baris ID itu
   di INDEKS-ATURAN diperbarui di PR ini juga. PR tanpa pembaruan
   indeks untuk ID yang statusnya berubah = loop tidak tertutup.
4. **QA per `AC-*`** — QA memberi vonis `LOLOS` atau `MINTA UBAH`
   per `AC-*` yang tercantum di kartu, **terikat exact-head SHA**
   PR yang diuji. Vonis untuk SHA lama tidak berlaku untuk head
   baru. `MINTA UBAH` mengembalikan kartu ke owner lane, bukan
   membuka kartu baru.
5. **Merge** — hanya LEAD/CEO yang merge, sesudah QA `LOLOS` dan
   CI head hijau (§5).
6. **INDEKS terbit status baru** — sesudah merge, status di
   INDEKS-ATURAN di `main` adalah status baru dari langkah 3.
   Inilah sumber antrean putaran berikutnya (§2).

Feeder dan dispatcher:

- **Feeder** hanya boleh membuat kartu dari INDEKS-ATURAN /
  `docs/erp-research-backlog.md` yang ber-ID (§1), dengan **parents
  gate** terisi: putusan §4.1 sudah ada dan kartu pendahulu dalam
  rantai §5 sudah selesai.
- **Dispatcher / auto-pecut** hanya boleh spawn pekerjaan bila ada
  kartu `ready` ber-ID dengan parents gate terpenuhi. Tidak ada
  kartu ready ber-ID = tidak ada spawn. Membuat pekerjaan dari
  perintah lisan, tebakan, atau "agar bot tidak menganggur" dilarang.

## 5. Larangan anti-banjir

- **Satu spec = satu rantai pendek.** Satu `F-…-S` maksimal dipecah
  menjadi rantai:

  `spec → vonis → inti → UI → audit`

  (vonis oleh ACCOUNTANT bila menyentuh uang/jurnal/pajak; audit =
  vonis QA per `AC-*`). Tahap yang memang tidak ada isinya dilewati,
  bukan dibuatkan kartu kosong.
- **Tidak ada kartu sync/konfirmasi mekanis terpisah.** Konfirmasi,
  sinkronisasi status, dan pemberitahuan antar-peran masuk sebagai
  **komentar di kartu yang sedang merge**, bukan kartu baru.
- **Verifikasi head CI cukup di PR.** Bukti CI dicatat sebagai
  exact-head SHA di PR (dan dirujuk vonis QA §4.4). Jangan membuat
  kartu baru hanya untuk "memverifikasi CI" atau "mengecek head".
- Satu ID aturan yang dikerjakan satu kartu tidak dipecah lagi
  menjadi kartu-kartu mikro per file/commit. Bila rantai §5 di atas
  tidak cukup, LEAD yang memutuskan pemecahan — dengan alasan
  tertulis di kartu induk.

## 6. Kondisi berhenti per peran

Berhenti membuat pekerjaan baru itu hasil yang sah, bukan kegagalan.

- Bila antrean ID untuk lane-mu habis (tidak ada item §2 yang bisa
  digerakkan peranmu, atau semua tersisa terblokir `OPEN-keputusan`
  / parents gate): laporkan **`lane habis`** di board, lalu
  **berhenti membuat pekerjaan baru**. Jangan mengarang kartu,
  jangan mengambil lane lain, jangan menurunkan ambang §1.
- Pengecualian read-only: riset **BUSINESS** (spec) dan
  **ACCOUNTANT** (vonis) boleh lanjut secara read-only ke
  `docs/erp-research-backlog.md` sesudah `lane habis` — tetap tanpa
  melahirkan kartu builder di luar rantai §4–§5.
- Peran selain BUSINESS/ACCOUNTANT tidak punya pengecualian
  read-only itu: `lane habis` berarti berhenti dan menunggu kartu
  ready ber-ID dari feeder (§4).
- Antrean terisi lagi hanya lewat loop §4: putusan baru menutup
  `OPEN-keputusan`, atau status INDEKS-ATURAN terbit baru sesudah
  merge. Bukan lewat inisiatif peran yang kehabisan lane.
