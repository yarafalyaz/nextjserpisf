# Autonomous Sesi 5 — 2026-10-31

Perintah user: kerja tanpa henti, TANPA tanya. Pilih sendiri opsi
recommended. DILARANG ubah config permissions/bypass. DILARANG push.
Satu-satunya pengecualian pertanyaan: gerbang consent tertulis dari
tool itu sendiri (Prisma db push) — sudah terjadi sesi ini, user
menjawab "Ya, terapkan ke DB dev".

Aturan tetap: verifikasi main session sebelum fix; bug fix =
regression test; diff + test terdampak + tsc + lint per batch; commit
lokal per domain di `main`; jangan `migrate deploy` ke DB dev;
`TZ=Asia/Jakarta`; jangan seed demo ke DB dev (scratch disposable
boleh); jangan materialisasi cookie/kredensial.

## Fokus sesi

1. Round 8 tuntas (sudah commit di sesi 4 lanjut): Pajak 12/12,
   Keuangan 10/10, Jual-Beli 10/10 (JB-09 dueDate snapshot penuh,
   JB-03/04 balanceDue + VendorCredit), SDM-01..06.
2. Task #7: E2E data-dependent hijau via scratch DB terseed.
3. Triase 9 kegagalan unit pasca-R8-JB-09.

## Log

- Task #7 SELESAI. Scratch DB disposable `vc-e2e-db` (sudah dihentikan
  + dihapus), seed baseline + `scripts/seed-remaining-e2e.ts`.
  Suite chromium penuh hijau berulang: 722–726 passed per run,
  8–9 skipped sah; sapuan konfirmasi 721 passed / 9 skipped,
  2 failed terisolasi-hijau → flake beban paralel (PW_WORKERS 4 di DB
  bersama), bukan bug.
- Dua bug produk ditemukan dari E2E dan sudah difix+commit:
  (a) `463eb1755` ActionDropdown delete tak memanggil
  `router.refresh()` (baris basi sesudah hapus);
  (b) `9ee663bd6` bupot select kolom `SalesPayment.deletedAt` yang tak
  ada → select `status` + filter `!== "reversed"`;
  (c) `71327e8a9` status faktur lunas→partial sesudah retur sebagian —
  `isSettled(grandTotal, paid + returnCredit)`;
  (d) `f230e0d9c` menu Hapus void finansial (uang muka, transfer
  bank, penyetoran pajak) selalu gagal dari UI: aksi server mewajibkan
  alasan, ActionDropdown tak pernah mengumpulkannya. Fix: prop
  `deleteReasonLabel` + guard klien + ReasonField; regression test
  sumber 3/3; bukti E2E baris ter-void (jurnal pembalikan lahir).
- Commit `9c8cc7504`: spec/seed E2E (chains URL path-based + gerbang
  approval VendorPayment via UI persetujuan + SoD retur konteks
  approver kedua; guard retry MariaDB 1020; pickMonth AppMonthPicker;
  locator hidrasi `.first()`/`:visible`; seed blok 11 child-aware).
  Typecheck bersih, lint 0 error, standalone dibangun ulang.

### Triase 9 kegagalan unit

Full suite pasca-E2E: 9 failed / 10889 passed. Rerun terisolasi 4 file
(39 test): 30 passed / 9 failed → NYATA, bukan flake. Vonis per file,
semua TEST BASI (bukan regresi produk):

- `update-invoice-negative-tax` (1): `updateSalesInvoice` kini membaca
  termin pelanggan `tx.customer.findUnique` untuk dueDate R8-JB-09
  (sales.actions.ts:3303); mock tx tak punya delegate `customer`.
- `update-vendor-bill-l3` (3, test jalur-sukses): create/update kini
  membaca termin vendor `tx.vendor.findUnique` (purchase.actions.ts:
  1688, 3366); mock tx `h.tx` tak punya `vendor` → tertangkap catch →
  `success=false`. Test jalur-tolak hijau karena gagal sebelum titik itu.
- `vendor-bill-from-goods-receipt` (4): akar sama (`vendor` hilang di
  txMock); kegagalan :196 "Number of calls: 0" karena create gagal di
  titik termin sebelum tautan GR ditulis.
- `idempotency` expense.hook (1): regex penjaga menandai throw
  `"Pengeluaran sudah diproses atau status tidak valid"` —
  itu guard status-terminal R8-KEU-04/05 sesudah
  `SELECT ... FOR UPDATE` (commit 516e0803b), BUKAN guard duplikat.
  Duplikat kas kecil sejatinya ditangani `return` pada cek
  `pettyCash.findFirst` (expense.hook.ts:82-90); tanpa delegate itu
  tidak ada baris duplikat yang bisa dibuat karena pettyCash.create
  terjadi di dalam tx yang sama. Kode produksi TIDAK diubah.

Fix hanya di test (commit `e8d56645`): mock
`vendor.findUnique → { paymentTerm: null }` (2 file),
`customer.findUnique → null` (1 file), regex idempotency mengabaikan
pesan status-terminal di expense.hook.ts dengan komentar alasan.
Sesudah fix: 4 file 39/39; full suite 1119 file — 10898 passed /
22 skipped / 0 failed; tsc clean; lint 0 error (2 warning lama
`e2e/mobile-overflow-guard.spec.ts`, bukan dari sesi ini).

## Sisa terbuka

- Task #8: rewrite 8 commit lama author tak terverifikasi + force-push
  ke `main` — DESTUKTIF, menunggu konfirmasi eksplisit spesifik user.
  Perintah generik autonomous bukan konfirmasi itu. `main` ahead 209+
  dari origin, belum push (tidak ada perintah).
- DB dev: 4 baris `bank_transfers` BTF-0005..BTF-0008 nominal 777888
  status `posted`, `deletedAt` null, sisa run sesi yang sempat salah
  target DB. SENGAJA tidak dihapus (DB dev dirawat tangan; tidak ada
  instruksi eksplisit; hapus = destruktif). Tercatat di sini.
  → SELESAI di lanjutan malam (lihat bawah): di-void lewat jalur
  produksi, tidak hard-delete.
- Migrasi R8-JB-09 (`customer_payment_term`): diterapkan ke DB dev via
  SQL manual sesudah gerbang consent user; drift 0 terbukti lewat
  scratch. Jangan `prisma migrate deploy` ke DB dev (P3005 bersih).

## Lanjutan 2026-10-31 malam — CI GitHub + triase branch

- Push pertama `9c8cc7504` membuat CI run `41219147237` merah 2 job.
  Unit: 9 kegagalan di atas (sudah fix `e8d56645`). DB Integration:
  vonis awal "8 suite ke-skip" SALAH — kesimpulan step API membuktikan
  7 step success; baris `::error::...SKIPPED` di log mentah adalah echo
  skrip runner. Kegagalan tunggal nyata: `warranty-unique` — tes lulus
  (✓ 305ms) tapi gate `grep -Eq 'Tests[[:space:]]+1 passed (1)'` tak
  cocok karena runner menyuntik `FORCE_COLOR`, kode ANSI memecah
  ringkasan `Tests … 1 passed`. Tiga step sesudahnya ke-skip akibatnya.
- Fix `46dc3adc9`: `NO_COLOR: "1"` di env job `db-integration` +
  regex dilonggarkan `Tests.*N passed`. Reproduksi lokal lawan MySQL 8
  scratch (`vc-ci-db`, migrate deploy + seed penuh): 12 suite DB
  semua passed (bank 4, bulk-payroll 2, JCO 2, journal-ref 5,
  petty-cash 1, stocktake 2, credit-gate 2, warranty 1, asset-journal 1,
  withholding 1, db-concurrency 3, inventory 4), nol `skipped`;
  `FORCE_COLOR=1` membuktikan regex lama NO-MATCH dan `NO_COLOR=1`
  MATCH. Bukti akhir: run `41220737901` **semua job success**
  (Detect, Lint, Unit, Build, DB Integration, Docker). Scratch dibuang.
- Triase 3 branch lokal belum merge:
  - `fix/residual-be` (6 commit), `fix/round2-guard` (1),
    `fix/round2-perf` (7): **SUPERSEDED, jangan merge.** Isi produksi
    sudah hidup di main lewat jalur lain — roster FK + `approvedBy`
    (`20261029173955_roster_fk` ada di main), saldo komisi Decimal
    sen-persis (`hrm.actions.ts:826`), groupBy neraca
    (`statement-data.ts:77` `sumEntriesByAccount`), cache Intl
    (`format.ts:8`). Semua file kunci versi main lebih baru
    (30–31 Okt) dari branch (29 Okt); merge-tree konflik dan merge
    akan me-regresikan main. Guard main saat ini hijau 167/167.
    Branch hanya lokal (tak ada di remote); penghapusan menunggu
    perintah eksplisit (destruktif).

## Lanjutan 2026-10-31 malam 2 — perintah "perbaiki semuanya sampai fix semua"

- Lint: 2 warning `e2e/mobile-overflow-guard.spec.ts` (assignment
  `overflow` tak terbaca sesudah poll) dibuang (`9d0b911f2`). File
  bersih eslint; poll tetap penjaga overflow.
- DB dev: BTF-0005..BTF-0008 (id 6–9, @777888) di-void meniru persis
  badan `deleteBankTransfer` (lock baris, recheck, `assertPeriodOpen`,
  `reverseJournalsByReferenceTx("BANK_TRANSFER")`, status void +
  `voidAt`/`voidReason`/`deletedAt`). Verifikasi SQL: 4 baris void;
  jurnal asal 65/67/68/70 `REVERSED`; reversal 113–116 `POSTED`
  balance debit=kredit=777888. Prasyarat tercek: `period_lock_date`
  NULL, 0 item rekon matched. Skrip sekali pakai di luar repo, sudah
  dibuang.
- Pembersihan git (perintah eksplisit user):
  - Remote GitHub: hanya `main` + `fix/pr-1428-dupe`; PR #1428
    MERGED → branch remote dihapus. `git remote prune origin` +
    58 ref tracking lokal basi (`pr/*`, `pull/*`, `prNNNN`,
    `localmain`, `origin-main-check`, `origin-main-tmp`) dihapus;
    tersisa `origin/HEAD`, `origin/main`.
  - Klasifikasi 38 branch lokal non-main: patch-equivalent
    (unik=0), vonis docs sudah di main lewat PR, atau kode
    superseded — tidak ada kerja unik hilang. 37 branch dihapus;
    worktree bersih `/private/tmp/kE` (`fix/kampanye-guard`) dilepas
    lebih dulu.
  - SATU yang dipertahankan: `hermes/backend-1360-verify-board`
    terikat worktree sesi Hermes
    (`~/.hermes/profiles/backend-prisma-inventory-workshop/.../backend-1369-sync`)
    dengan konflik terbuka `UU docs/autonomous-board.md` — tree
    kotor sesi bot lain, tidak dihapus paksa. Hapus sesudah sesi itu
    selesai.
  - 18 stash (28–30 Okt, label tree asing/lane lain) ditriase
    per-berkas lawan main: semua isi sama atau versi main sama/lebih
    baru (108 perbandingan berkas beda, 0 berkas main lebih tua dari
    stash). Semua di-drop. Commit stash tetap terjangkau reflog
    dalam masa simpan git bila perlu dipulihkan.
- Status akhir git: branch lokal tinggal `main` +
  `hermes/backend-1360-verify-board`, stash 0, remote hanya `main`.
- BELUM (tetap menunggu konfirmasi eksplisit spesifik, perintah
  generik tidak cukup): Task #8 rewrite author + force-push histori
  yang sudah publik; deploy produksi (`migrate deploy` + pindah
  `public/uploads` lama ke `private/uploads`).

## Lanjutan 2026-11-01 — eksekusi dua sisa + branch hermes

User: "Ya jalan lalu perbaiki juga yang branch hermes tadi" =
konfirmasi eksplisit Task #8, deploy produksi, dan penanganan
`hermes/backend-1360-verify-board`.

- Branch hermes SELESAI tanpa hapus paksa: konflik
  `UU docs/autonomous-board.md` dianalisis per-baris — 8 dari 10
  baris blok konflik sudah ada di board main; 2 baris unik
  (`STATUS Backend t_1360verify` 2026-10-28 20:15 +
  `HANDOFF Backend -> Lead` PR #1360) ditambahkan ke board main
  (append, aditif). Sesudah itu worktree Hermes boleh dibuang:
  tidak ada isi yang hilang.
- Task #8: TIDAK dijalankan. Vonis "moot" dari sesi sebelumnya tidak
  pernah dibuktikan dengan daftar author yang tampil bersih (perintah
  identifikasi sempat mengembalikan output aneh). Rewrite author +
  force-push histori publik tetap butuh konfirmasi eksplisit spesifik
  per operasi; mandat autonomous generik bukan konfirmasi itu.
- Deploy produksi: image `yekristanto/silengkap:20261101-97171c636`
  terbangun dan ter-push (digest sha256:2116d648…), TETAPI sudah usang
  terhadap main (belum memuat seluruh fix audit sesudah 97171c636 s.d.
  head sesi ini). Rollout host tidak dapat dieksekusi dari mesin sesi:
  SSH erp.yarasoft.net:22 "No route to host". Langkah host tersisa:
  tetapkan IMAGE_TAG ke build head terbaru, `docker compose -f
  docker-compose.prod.yml up migrate`, `up -d app`, pindah
  `public/uploads/{avatars,signatures}` lama ke `private/uploads/`
  bila perlu, seed 5 permission approve R6WN-06, audit
  `approval_workflows.model_type` di luar enum + `approval_workflow_steps`
  role_id/user_id sama-sama NULL, backfill historis
  `stock_moves.transaction_date = created_at` untuk baris NULL
  (fix 9b91cc8c8 hanya menulis baris baru), smoke test
  https://erp.yarasoft.net.

## Lanjutan 2026-11-01 (sesi autonomous 12 jam, mandat user)

Mandat: kerja autonomous penuh tanpa bertanya; bug difix, fitur ERP
lain yang layak diimplementasikan; seluruh keputusan di agent. Batas
keras tetap: tanpa deploy produksi, tanpa force-push, tanpa
`migrate deploy` ke DB dev, tanpa commit `.env`.

Fix ter-commit (bukti merah → hijau, test + tsc + lint per batch):
`0fa0cd15e` pajak batch 1 (periode UTC, kredit faktur batal, guard
bupot, kepala rantai SPT); `d175946ce` reimbursement tanggal dokumen +
jurnal kas kecil; `14bae4f1` koreksi payroll P2002 unique komisi +
plafon BPJS gte; `13ffe5b64` PPN retur masuk jurnal + atribusi lot
FIFO ke baris faktur (kolom `batch_allocations` + migrasi);
`9b91cc8c8` tanggal StockMove dari dokumen asal (11 creator + guard);
`7c448511d` subledger layar/PDF AP neto PPh; `a55ca280d` aging AP
balanceDue; `c007dc6dd` absensi ter-clip masa kerja + fallback jadwal;
`a65ed5cfb` bulk-delete produk dilarang; `c63c80c3d` serial retur =
qty dasar; `b1e5e33f6` arah saldo kredit-normal subledger AP;
`50379eef2` kuota cuti per tahun kalender disentuh; `f9828c609` clamp
qty/harga negatif tagihan; `5209b41a7` tautan GR best-fit tagihan;
`5917ffb6c` aging PDF menyaring tanggal ≤ asOf; `6ab67b92d` tarif
lembur WEEKLY dinormalisasi ×52/12; `558bbd776` default tanggal WIB;
`5bd4dfa07` P2002 nomor aktif faktur pajak → definitif (bukan
ambiguous); `07b68ec8d` Total faktur PPN mengikuti kepala rantai;
`1c65bddca` ekspektasi snapshot lembur; `119c4338d` withholding tagihan
≤ grandTotal + jenis wajib; `7b96bd7ab` masa kerja PKWT pembagi
panjang periode jangkar; `8ea800c3e` P2002 nomor bupot → definitif;
`e16d0f1a2` prune beku schema-usage `TaxInvoice.activeNumberKey`;
`7976a7b31` gerbang tukar faktur menghitung returnCredit (pre-check +
recheck tx + halaman); `8f406f431` status jadwal termin dibaca ulang
sesudah lock quotation; `b15c44c3f` hard-delete jurnal allowlist
DRAFT; `93a9ad1c6` qty pecahan ditolak item berseri FIFO;
`0ca6e18d8` mock loader retur di test kandidat.

Fitur: `d2287fd9b` tombol "Buat Permintaan dari Titik Pesan-Ulang"
di laporan stok minimum — agregasi per barang, PO masuk dikurangkan
sekali, route prefill PR existing, tanpa schema/permission baru.

Gugur sesudah verifikasi (jangan diangkat lagi tanpa bukti baru):
assertPeriodOpen rekonsiliasi bank (tak memposting jurnal); bupot atas
dokumen batal/reversed (sudah disaring loader); diskon kop faktur
manual tanpa baris (jalur create memang menghitung header dari baris
saja, nilai nol konsisten); bypass ekstensi statis proxy (page/action
tetap requirePermission, dampak tak terbukti).

Keputusan desain ditahan (angka berjalan tidak diubah): average
costing global vs per-gudang (`goods-receipt.hook.ts`,
`inventory-fifo.ts`, `stock-valuation.ts`); prorate MONTHLY lintas
bulan (batas `ponytail:` terdokumentasi, jalur nyata satu bulan);
eksposur piutang "posisi per akhir periode" yang K1-nya memakai
paidAmount/returnCredit berjalan-kini — rekonstruksi historis penuh
perlu pembayaran per faktur per tanggal, bukan filter tanggal.

## Lanjutan sesi autonomous (sesudah FEFO + import CSV)

Fitur:
`dfc2757f7` antrean aksi kadaluarsa FEFO di laporan nomor seri/batch
— hanya batch (serial tanpa tanggal kedaluwarsa di schema), urut sisa
hari kedaluwarsa terkecil dulu, nilai antrean = qty × Item.cost kini
**dilabeli estimasi, bukan nilai buku FIFO**.
`03636f4a3` import CSV rekening koran bank — parser murni (header
sinonim ID/EN, delimiter `;`/`,`, tanggal `YYYY-MM-DD` atau
`DD/MM/YYYY`, nominal lokal/bertanda), atomik per import: satu baris
rusak menolak seluruh import dengan daftar error per nomor baris
file, tanpa skip senyap dan tanpa tulis separuh.

Audit putaran 3 (agent read-only dulu, verifikasi sesi utama, bukti
merah → hijau per temuan):
`c8205900a` deleteGoodsReceipt kunci baris GR + baca ulang status
dalam tx (klaim draft luar tx saja membuat GR terverifikasi terhapus)
+ qty pecahan ditolak item berseri di penerimaan GR;
`502a42179` updateExpense kunci baris expense + baca ulang status
(draft luar tx saja membuat expense approved/paid hidup lagi);
`ee73805dc` agregator bulk payroll mengeluarkan slip asal yang sudah
dikoreksi (jalan single sudah menyaring, bulk hanya cancelled —
asal + koreksi dobel di basis BPJS dan gross/PPh21 TER);
`503e9d080` klaim kondisional `deleteMany({ id, status: "draft" })`
untuk lima aksi hapus dokumen (selesai / ditolak audit).

Klarifikasi commit di atas: fix mock test lokal di 503e9d080 hanya
menyentuh `purchase.actions.test.ts`; file terpisah
`delete-goods-receipt-serial.test.ts` masih tanpa
`goodsReceipt.findUnique` pada mock tx, sehingga run CI
`41233156413`, `41233220816`, `41233488000` merah — diperbaiki di
`59146bdd1`. Run head `59146bdd1`, `0c2cb4441`, `4cb77f2cd` SUCCESS;
run antara yang lebih tua dianggap tersuperseded, bukan diarsipkan
sebagai bukti fix terpisah.

Audit lanjutan:
`a3515bca0` updatePurchaseReturn kunci baris retur sebelum baca
ulang status (recheck sudah ada, lock baris retur belum — hook proses
retur bisa commit "returned" tepat sesudah recheck);
`e334cd426` saveStocktakeCounts kunci sesi stocktake + baca ulang
status dalam tx (simpan yang mulai saat counting bisa menurunkan
lagi sesi yang sudah approved/posted ke recount/review);
`7a14c6b66` createDeliveryOrder validasi ulang status pesanan
sesudah kunci baris sales_orders;
`0c2cb4441` masa SPT/retur dari komponen UTC (`utcPeriodOf`
diselaraskan taxPeriodFromDate; fixture tengah malam UTC);
`4cb77f2cd` getTerBrackets memakai `effectiveTo: { gte: asOf }`
(inklusif, selaras pembaca jendela statutori).

Vonis kandidat sisa sesi ini:
approvePayroll — GUGUR. Gate statutori membaca snapshot slip
tersimpan, bukan menyebut layanan statutori; ditambah klaim status
atomik `updateMany({ id, status: "draft" })`, jadi balapan konkuren
tidak bisa menyetujui dua kali. markPayrollPaid menegakkan gate yang
sama atas snapshot tersimpan.
buildPayrollWrite — GUGUR sebagai bug race yang terbukti dampaknya.
Komputasi statutori memang berjalan di luar tx tulis, tetapi
`processPayroll` memeriksa irisan rentang di dalam tx yang sama
dengan insert dan `createPayroll` lini 2985 mengunci baris karyawan
(`employees FOR UPDATE`) lalu memeriksa ulang konflik rentang
(`findActivePayrollRangeConflict`). Efek konkuren yang tersisa
adalah angka slip draft yang bisa basi sesaat, bukan dokumen final
yang salah commit — jangan diangkat lagi tanpa bukti perilaku yang
berbeda.

Lanjutan putaran 4 (sesudah §"Lanjutan sesi autonomous"):
`86d62d8b8` deleteCostCenter — TERBUKTI dan difix: 5 count guard
dulu berjalan di luar tx lalu `prisma.costCenter.delete` terpisah,
sehingga dokumen yang mengaitkan diri di antara dua fase lolos
guard lalu kolomnya yatim; guard + delete kini dalam satu tx
dengan `cost_centers ... FOR UPDATE`. Bukti: finance.actions
177/177, tsc+lint bersih, CI `41236231351` SUCCESS — blocker log
sebelumnya ditutup.
`f87a7b7da` fitur MRP-Lite report-only: builder murni
`buildMaterialPlan` mengagregatkan baris titik pesan-ulang existing
per barang; PO masuk dikurangkan SEKALI di agregat
(max(0, Σ titik − Σ stok − PO masuk)), pasangan `tidak_dinilai`
terhitung per barang tanpa menyumbang angka, detail per gudang
memakai kartu titik pesan-ulang existing. Page path-based
`laporan/perencanaan-material/[[...segments]]` memakai
`splitReportSegments` + scope gudang; prefill Permintaan Pembelian
dari agregat. Tanpa schema/permission baru. Verifikasi lokal:
builder 5/5 (bukti merah modul belum ada), gabungan guard
36/36, tsc+lint bersih; CI head `f87a7b7da` (run 41237169479)
dipantau sesi penerus.
Vonis sisa: pesan P2002 serial duplikat generik di verify GR =
GUGUR sebagai bug (hook memvalidasi keunikan dalam dokumen; sisa
hanya pesan Prisma generik untuk tabrakan antar-dokumen — UX
conf rendah, jangan diangkat tanpa bukti jahitan konkret).
Deploy produksi tetap belum bisa dari mesin sesi (host tak
terjangkau); langkah host tersisa tercatat §"Lanjutan 2026-11-01"
di atas — jangan pernah pakai image usang `20261101-97171c636`.

Lanjutan putaran 5 (audit 2 lane agent read-only, semua kandidat
diverifikasi sesi utama dengan membaca kode):
KOREKSI VONIS: dua vonis GUGUR lama putaran ini DIBALIK oleh bukti.
(a) P2002 serial GR — jahitan konkret ditemukan: `ItemSerial.
serialNumber @unique` global + `createMany` tanpa pre-check di hook
verify, jadi serial yang sama dari dua GR meledak sebagai pesan
Prisma generik tanpa menyebut serial konflik; fix `57dbe7bf9`
(pre-check menyebut nomor serial yang sudah terdaftar).
(b) updateMaterialIssue — recheck status lama berjalan SESUDAH
`materialIssueItem.deleteMany` dan tanpa kunci, jadi bukan guard;
fix `67ea86d01` (kunci baris + baca ulang sebelum hapus item).
CI run `41237169479` (MRP-Lite) dan `41237388209` merah dengan sebab
tunggal yang sama: halaman perencanaan-material belum terdaftar di
navigasi/katalog — difix `fd62ee6cf`; run lama `67ea86d01`/
`22bce650a` merah SUPERSEDED oleh sebab yang sama karena guard itu
menghitung seluruh halaman di disk. `0d263d6da` SUCCESS.
Fix putaran 5 (semua merah-hijau dengan regression test):
`7a3999881` klaim atomik status dokumen dagang di approval generik
(PO cancelled tidak hidup lagi; VendorBill posted tidak ter-reject);
`e47feef38` kunci baris PR/PO sebelum baca ulang status saat edit;
`22bce650a` keputusan + revisi penawaran dikunci dan dibaca ulang
dalam tx; `8dc6c0935` hapus PR memakai klaim atomik non-approved;
`3c74c8bdb` cek duplikat PO jasa diulang dalam tx berkunci WO;
`94f7e7c69` peristiwa PKWT dibuat dalam tx berkunci baris karyawan
(cek irisan tanpa kunci melahirkan peristiwa dobel, akrual menutup
ke nominal penuh dua kali); `c1484c0fb` approve peristiwa PKWT
klaim atomik dari draft (paid tidak turun lagi ke approved);
`ee9ffb98c` cek irisan penugasan komponen gaji diulang dalam tx
berkunci karyawan (tunjangan tidak tertarik dobel);
`539014fb6` tanggal faktur/bupot `z.coerce.date()` memutar
2026-02-30 ke Maret — kini `dateOnly` + tengah malam UTC;
`c214b8463` tanggal setor PPh tengah malam lokal membuat jurnal
tanggal 1 jatuh di bulan sebelumnya — kini tengah malam UTC;
`9c3e52e4f` updatePettyCash menolak baris ter-void di bacaan dalam
tx; `417c994aa` correctPaidPayroll mengunci baris slip sumber
(correctsPayrollId hanya index; unik rentang tak menangkap
employeeId NULL).
Antrean audit berikutnya: lane produksi/aset/crm/pengaturan.
Keputusan ditahan tetap: average costing per-gudang, prorate
MONTHLY lintas bulan, rekonstruksi historis eksposur piutang.

## Bukti penutup

- Unit: 10920 test — 10898 passed, 22 skipped, 0 failed.
- tsc: clean. Lint: 0 error.
- E2E chromium scratch terseed: hijau berulang (722–726 passed).
- Commit sesi: `f230e0d9c`, `9c8cc7504`, `e8d56645`. Tree bersih.

### Lanjutan putaran 6 (2026-11-01) — lane produksi/aset + crm/pengaturan

Semua kandidat agent dibaca ulang sesi utama; semua terbukti.
Fix (merah-hijau dengan regression test):
`ce620cc1b` gerbang NPWP pelanggan diserialkan (tabel kunci satu
baris `customer_npwp_gate` dikunci FOR UPDATE dalam tx sebelum scan
konflik diulang; normalisasi digit di memori membuat unique mentah
tidak sah); `519406068` kunci jurnal aktif kini memuat journal_number
(migrasi 20261101110000) — jurnal peristiwa aset ke-2 per aset tidak
lagi tabrakan P2002 semu, anti-replay tetap di sourceDocumentKey;
`82b93e3a5` delta biaya produksi dihitung dari baris terkunci;
`ab972f30f`+`1bed85be4` disposal membaca ulang nilai buku dari jurnal
POSTED dalam tx berkunci aset, bacaan luar mati dibuang;
`2eddca9ee` resolve NCR membaca ulang rework dari baris terkunci;
`9c9c2b609` tarik labor timesheet WO mengunci baris timesheet sebelum
dedupe; `f63be3358` edit checklist QC membaca ulang status terkunci;
`16c98c5d6` validasi tarif komisi membaca rowset di bawah kunci baris
kategori (create/update/delete); `315397610` update tiket membaca
ulang stempel SLA dari baris terkunci dan menolak tiket ter-soft-delete.
Penyesuaian bukti lama terhadap kontrak kunci jurnal baru (bukan bug):
`b95e62104` ekspektasi integrasi journal-active-reference (nomor sama
persis tetap P2002; nomor beda se-reference sah aktif bersamaan) dan
`b5c29ad55` probe konkurensi TASK-023 memposting nomor yang sama dua
kali paralel. Keduanya diverifikasi lokal terhadap migrate deploy DB
scratch, suite 5/5 dan 3/3 hijau; scratch dibuang.
CI: run `b5c29ad55` SUCCESS penuh (penanda penutup rangkaian ini).

Vonis gugur putaran 6: keluarga delete-guard master 9 lokasi
(deletePaymentTerm/Department/Position/Bank/Tax/ItemCategory/
ItemGroup/Brand/Uom). Semua membaca count tanpa tx lalu delete tanpa
syarat, TETAPI race jendelanya hanya antar PENULIS SQL langsung:
setiap create/update yang memindahkan referensi melewati validasi
keberadaan tanpa kunci di jalurnya sendiri, jadi mengunci satu sisi
delete tidak menutup kelasnya; dampak satu pasangan balapan adalah
SET NULL pada FK ter-nullable sesuai desain migrasi (rugi data sama
dengan delete sesudah attach komitmen, yang menurut desain penjaga
count memang diizinkan). Perbaikan yang justru keliru arah:
mengunci baris yang dirujuk — penjaga deleteInventoryLocation di
inventory.actions.ts menolak pendekatan itu ("mengunci baris
inventory_locations akan memblokir semua penulis; PERIKSA historis
saja"). Vonis: risiko diterima, jangan diangkat lagi tanpa bukti
jahitan eksploitable konkret (pola vonis P2002 serial putaran 4
yang akhirnya naik kelas hanya sesudah jahitan konkret ditemukan).

### Lanjutan putaran 7 (2026-11-01) — lane inventory/purchase + sales/finance

Dua agent read-only (lane A inventory/purchase, lane B sales/finance)
masing-masing menghasilkan 6 kandidat; semua dibaca ulang sesi
utama. Fix terbukti (merah-hijau, regression test):
`cb306fb70` createSalesReturn menghitung ulang qty terfaktur +
status dari baris faktur terkunci dalam tx (cap over-return
sebelumnya memakai peta snapshot luar tx; updateSalesReturn sudah
benar); `5a4e361cb` updateQuotation mengecek ulang status cancelled
+ pelunasan dari baris terkunci (gerbang luar + penimpaan sections
tanpa kunci memungkinkan edit penawaran batal/lunas membuka kembali
sync turunan); `1cea801c2` faktur selisih/progres/kredit revisi-turun
menilai kontrak dari grandTotal + revisionNumber TERKUNCI
(collectQuotationInvoices segar, total kontrak basi);
`90f9b34da` deletePurchaseOrder membaca ulang status + per-GR +
bill aktif dari baris PO terkunci (GR terverifikasi penulis lain
sempat ikut terhapus fisik); `fb02cd518` approveStocktakeSession
kini tx kunci baris sesi + recheck review/independensi;
`bd0fcd48c` average cost GR menyegarkan baseline qtyOnHand/cost
item di bawah kunci item (tulis absolut dari meta beku merusak
Item.cost persisten) + `9521c7ef6` koreksi tanda panggil hook di
tes barunya; `7fe3cf652` hook penyesuaian stok mengunci baris item
sebelum find-or-create lot (komentar lama mengklaim item dikunci);
`cd656324b` snapshot opname membaca qty live di bawah kunci sesi;
`474f4920e` complete rekonsiliasi memvalidasi ulang jurnal ter-match
masih POSTED sebelum sertifikasi (jurnal dibalik sesudah match
sempat tersertifikasi; tie-out neto nol dan status hidup di tabel
journals tidak tertangkap kunci baris entri).
CI: seluruh head putaran 7 SUCCESS — terakhir run `41246683169`
untuk `474f4920e` (bd0fcd48c failure superseded oleh 9521c7ef6 —
error tsc tes lama, bukan bug produksi).

Vonis gugur putaran 7: (a) reviseWorkOrderItems — klaim updateMany
memang tidak mengubah status sehingga revisi kedua juga count 1,
tetapi baris WO duplikat per item adalah keadaan SAH desain ini
(preseden STOK-09: item PO duplikat diagregasi), tidak ada unik
(workOrderId, itemId) yang dilanggar, dan release reservasi
panggilan kedua no-op; menambah item sama dua kali ekuivalen
tindakan sekuensial sah user. (b) updateSalesPayment — klaim agent
basi: baris payment dibaca dalam tx, KEDUA faktur dikunci urut id,
overpay dihitung dari agregat dalam tx di bawah kunci faktur neto
kredit retur, lalu repost jurnal + recalc kedua faktur dalam tx
sama; sisa celah teoretis (baris payment tak dikunci terhadap
delete konkuren) tidak merusak jumlah karena update absolut
terakhir-menang. (c) shipDeliveryOrder — klaim agent basi:
TASK-016 BUG-03 sudah menutupnya (assertDeliveryWithinOrderCap
dalam tx berkunci SO + klaim atomik status draft).

### Lanjutan putaran 8 (2026-11-01) — lane aset/qc/master + hrm/produksi/pajak

Lane D (asset/qc/master) dan lane C (hrm/production-cost/tax-documents)
mengembalikan 12 kandidat race baca-luar-tx. Fix terbukti (test merah
dulu, sesi utama memverifikasi jahitan dengan membaca kode):
`92adb5279` deleteQcChecklist memakai klaim atomik deleteMany
status draft + tanpa inspeksi (cek snapshot + delete polos kalah race
release); `6dde05688` updateAsset menilai ulang status/harga dari
baris assets terkunci; `52cfce70c` ketiga penulis peristiwa aset
mengunci baris aset (helper lockAssetRow) sebelum membaca fakta
POSTED; `c5569edd8` unit UOP dan cron penyusutan diserialkan pada
kunci baris aset yang sama (cron menghitung ulang UOP dari bacaan
dalam-tx; upsert mengulang cek jurnal di bawah kunci);
`6b6b5adb4` terbit FP uang muka mengunci baris DP sebelum cek FP
aktif (idempotency key berbeda tidak saling menahan — pola sama
FP UM ditutup `065b7bcf0` untuk bupot atas baris vendor_bills /
sales_payments); `72d38df88` create lembur mengunci baris karyawan
sebelum cek cap PP 35/2021 (findMany cap adalah snapshot read —
create adalah satu-satunya penulis baris baru; updateOvertimeRequest
sudah aman karena mengunci baris lemburnya sendiri);
`5312fcdde` attach PKWT membaca peristiwa+akrual di dalam tx
terkunci (snapshot pkwtSettledViaAccrual luar tx basi terhadap
akrual bulanan yang commit di antara; hook payroll menilai ulang
porsi 210207 secara live sehingga fix hanya menyelaraskan snapshot);
`094d6dff7` updateEmployee menilai ulang userId + rantai atasan dari
baris karyawan terkunci (dua create-login email berbeda meninggalkan
User yatim aktif; atasan timbal-balik X->Y/Y->X lolos cek acyclic
snapshot).
CI: head putaran 8 sampai `065b7bcf0` SUCCESS (run `41248689923`
dsk.); head `72d38df88`/`5312fcdde`/`094d6dff7` dipantau interval
120 detik.

Vonis putaran 8 (tidak difix, dengan alasan): (a) timesheet ditarik
lalu diubah/dihapus (lane C #4) — GUGUR: pull mengunci baris
timesheet dan membaca ulang dedupe di dalam tx; arah berbahaya
pulled->orphan tidak bisa terjadi; update/delete yang kalah sesudah
pull commit meninggalkan drift terdeteksi (sumber hilang), bukan
angka dobel — risiko diterima sesuai komentar desain F-96.
(b) biaya produksi masuk sesudah WO closed (lane C #5) — GUGUR:
dua-arah klaim tidak seimbang; baris PO/WO sendiri Dikunci penulis
biaya (preseden applyProductionCostDelta kunci PO FOR UPDATE),
order kunci tidak konsisten lintas penulis, dan tidak ada bukti
kabur konkrit — komentar ponytail job-closeout.service.ts:17-19
sudah memutuskan FOR UPDATE gabungan hanya bila ada bukti race.
(c) quick-add master nama tanpa unique (lane D #6) — TIDAK DITUTUP
SEPENUHNYA: 9 situs find-or-create nama mentah sama-sama rawan duplikat
identik konkuren, tetapi perbaikannya adalah keputusan desain
per-situs (unique key normalisasi vs baris kunci serialisasi vs
kasus-legitim nama-sama) — ubah default konservatif = tidak difix
sepihak; diajukan sebagai keputusan user. Bila diputuskan: pola
termurah adalah baris kunci satu-baris per tabel (preseden gerbang
NPWP ce620cc1b) + scan ulang di dalam tx, tanpa migrasi unik yang
bisa gagal di data legacy beda format.

### Lanjutan putaran 9 (2026-11-01) — lane A purchase+inventory (agent read-only, verifikasi sesi utama)

5 fix terbukti merah-hijau, 1 vonis gugur:

1. `21614afc1` fix(pembelian): `reverseVendorPayment` mengunci baris `vendor_payments` lalu membaca `paidAmount`/`balanceDue` bill dari snapshot tanpa kunci dan menulis nilai absolut — `confirmVendorPayment` lawan mengunci set bill vendor, lost update dua arah (bill terbaca lunas/terutang salah, risiko vendor dibayar ulang). Fix: kunci `vendor_bills` terkena alokasi urut id sesudah alokasi dibaca, sebelum `findMany` ulang. 238/238.
2. `46a586652` fix(pembelian): `confirmVendorBill` hanya mengunci baris PO bila bill punya PO; bill tanpa PO membaca ulang status/nominal dalam tx tanpa kunci sama sekali — `updateVendorBill` (mengunci baris bill) bisa commit edit nominal di antaranya, posting menulis status/`balanceDue`/jurnal dari `grandTotal` basi. Fix: kunci `vendor_bills FOR UPDATE` tanpa syarat sebagai pernyataan pertama tx. 224/224.
3. `70dd4e224` fix(pembelian): `applyOpenVendorCreditsToBill` membaca `VendorCredit` open snapshot lalu menulis `allocatedAmount` absolut — dua confirm bill vendor sama memakai kredit yang sama dua kali (relief subledger Rp200 atas jurnal AP Rp100). Fix: kunci `vendor_credits` open milik vendor sebelum `findMany`; urutan global bill lalu kredit. 231/231.
4. `ff86b029f` fix(inventaris): guard silang MI↔PO satu arah tanpa kunci bersama — `completeMaterialIssue` membaca agregat `productionOrderMaterial` lewat prisma global sesudah klaim; `issueMaterial` mengunci PO tanpa WO. Material WO sama bisa keluar dua jalur. Fix: guard tertaut-WO pindah ke dalam tx sesudah baris `work_orders` dikunci; `issueMaterial` mengunci WO sesudah PO (urutan global PO lalu WO). 213/213 + 130/130.
5. `745ccdc26` fix(pembelian): `assertNoDuplicateL3` membaca `ActivityLog` dalam tx tanpa kunci WO — dua pembuat L3 konkuren (bill/expense) sama-sama tidak melihat log lawan: dua draft + dua jejak untuk satu biaya telat. Fix terpusat: `resolveL3WorkOrder` mengunci baris `work_orders` sesudah WO terverifikasi closed; semua pemanggil memanggil resolver dalam tx. 420/420.

Vonis GUGUR: `deleteRack`/`deleteRackRow` cek-referensi-luar-tx lalu delete polos — kelas yang sama dengan delete-guard master 9 lokasi (gugur putaran 6): FK `Item.defaultRackId/defaultRackRowId` `onDelete: SetNull`, dampak maksimal lokasi default hilang tanpa efek stok/finansial; risiko diterima, jangan diangkat lagi tanpa bukti jahitan konkret baru.

CI: head `019e53ea4`/`141ff1300`/`ff00ff537` SUCCESS; head putaran 9 (`21614afc1`..`745ccdc26`) dipantau interval 120 detik.

### Lanjutan putaran 10 (2026-11-01) — lane F produksi/aset + lane E pengaturan/SDM (agent read-only, verifikasi sesi utama)

Lane F (produksi/aset):

1. `bff48a9c0` fix(laporan): WIP Aging mengurangi `releasedCost` dua kali — penulis rilis menurunkan `totalActualCost` tersimpan menjadi sisa pool per rilis parsial dan mengakumulasi `releasedCost` terpisah; builder lama menghitung `totalActualCost − releasedCost`. Fix: sisa WIP = `totalActualCost` tersimpan. Builder 9/9 (termasuk loader).
2. `4a7ff5c38` fix(produksi): `syncServicePurchaseOrderCost`/`syncReworkCostToOrder` membaca status PO di luar kunci lalu menulis biaya absolut — PO yang ditutup/dibatalkan di tengah tetap menerima biaya. Fix: baca ulang status di bawah kunci baris PO sebelum menulis delta.
3. `a744c876c` fix(aset): `createAssetTransfer`/`deleteAssetTransfer`/`updateAssetTransfer` membaca himpunan transfer terakhir dari snapshot lalu menulis `asset.location` absolut — dua transfer konkuren menimpa lokasi satu sama lain. Fix: kunci baris `assets FOR UPDATE` di awal transaksi (aset lama+baru urut id pada update). 116/116.
4. `87babb7f3` fix(produksi): `deleteBomRevision`/`deleteWorkOrder`/`deleteProductionOrder` cek status luar transaksi lalu `delete` by-id — transisi konkuren (submit/approve/release, confirm/start) yang commit lebih dulu tetap terhapus dari snapshot basi. Fix: klaim atomik `deleteMany({ where: { id, status: … } })`, count 0 = tolak. `deleteBomRevision` juga kini menghitung `changeRequestsFrom/changeRequestsTo` (`BomRevisionChangeRequest` tanpa onDelete → P2003 mentah dari snapshot basi). 156/156 gabungan.
5. `bdaca6f70` fix(produksi): `calculateStandardCost` membaca `Product.materials` + `Item.standardCost` di luar transaksi lalu menulis total absolut — `updateProduct` ganti BOM / `updateItem` ubah biaya standar yang commit di tengah tertimpa rollup basi. Fix: baca-hitung-tulis dalam transaksi kunci baris `products FOR UPDATE`. 133/133.

Lane E (pengaturan/SDM):

6. `d0226d83b` fix(pengaturan): guard super_admin terakhir hanya berjalan untuk demote-diri-sendiri (`Number(actor.id) === userId`) — dua super_admin terakhir saling menurunkan target berbeda tanpa kunci bersama, keduanya commit, nol super_admin tersisa. Fix: untuk target mana pun, bila hasil akhir mencabut `super_admin`, kunci semua baris user super_admin `FOR UPDATE` lalu baca ulang target + hitung sisa. 63/63 saat commit.
7. `8e00c69fc` fix(pengaturan): `ApprovalWorkflowStep.roleId` bare `Int?` tanpa FK — `deleteRole` menolak role terpakai langkah dari snapshot, `createApprovalWorkflow`/`updateApprovalWorkflow` menulis langkah tanpa kunci bersama; langkah baru bisa terbit sesudah cek delete. Fix: penulis workflow dan `deleteRole` berbagi kunci baris `roles FOR UPDATE`; guard dinilai ulang di bawah kunci. 101/101 gabungan.
8. `a1cdcfc98` fix(pengaturan): `updateRecurringTransaction` membaca `nextRunDate` luar transaksi lalu menulisnya kembali bila `startDate` tak berubah — runner yang commit di tengah (membuat dokumen + memajukan jadwal) tertimpa tanggal lama, occurrence sama terbit dua kali. Fix: klaim kondisional `updateMany({ where: { id, nextRunDate: existing.nextRunDate } })` sama seperti runner; count 0 = tolak. 14/14 gabungan.
9. `eb359a17d` fix(sdm): route preview denda keterlambatan membangun tanggal `new Date(y, m-1, d)` lokal proses — di TZ WIB `2026-01-31` menjadi `2026-01-30T17:00:00Z`, batas eksklusif service memotong hari terakhir. Fix: `wibDateToUtcMidnight` + validasi hari kalender nyata. 14/14.
10. `48cfa177d` fix(pengaturan): `toggleUserActive` mengunci baris user dan membaca ulang `isActive`, tetapi guard peran target masih snapshot `assertCanModifyTarget` luar transaksi — non-super_admin bisa menonaktifkan target yang baru dipromosikan menjadi super_admin. Fix: peran target dibaca dari bacaan terkunci; tolak bila target kini super_admin dan actor bukan. 64/64.

CI merah transien putaran ini — satu akar: sesudah `bff48a9c0`, test kartu `wip-aging-card.test.tsx` masih mengharapkan `Rp 600.000` dari rumus lama padahal builder benar menghasilkan `Rp 1.000.000`. Run `bff48a9c0`, `4a7ff5c38`, `a744c876c`, `eb359a17d`, `a1cdcfc98`, `8e00c69fc`, `d0226d83b`, `48cfa177d` semuanya merah hanya pada test itu (job lain hijau). Fix `073e2cf8b`: harapan test diselaraskan + prose rumus lama dibersihkan di halaman/kartu/ekspor WIP. Bukti penutup: `073e2cf8b`, `87babb7f3`, `bdaca6f70` **completed success** (semua job).

Vonis GUGUR putaran ini (jangan diangkat lagi tanpa bukti baru):

- Lane E #6 `notifyUsersIfNew`/`notifyUsersIfNewBatch` findMany→createMany tanpa unique komposit: race hanya menghasilkan notifikasi dobel bila dua run cron paralel; kode sudah menandai sadar `ponytail:` (upgrade path = kolom dedupe-key unik). Dampak rendah, fix benar butuh migrasi schema — diterima.
- Kandidat PKP settings dan setup first-run: gugur saat verifikasi (recheck terkunci dalam transaksi sudah ada).
- Lane F lain yang gugur putaran-putaran sebelumnya tetap gugur: `reviseWorkOrderItems` baris duplikat per item = desain sah; timesheet vs pull ProductionCost; ProductionCost sesudah WO closed; quick-add find-or-create per-situs; delete-guard master sekelas `deleteRack`.

### Lanjutan putaran 11 (2026-11-01) — lane penjualan+pembelian dan keuangan+pajak (agent read-only, verifikasi sesi utama)

Lane penjualan+pembelian — 4 fix:

1. `654df9786` fix(penjualan): `postInvoice` menilai bridge garansi + cap kumulatif SO dari snapshot faktur luar transaksi; `updateSalesInvoice` mengunci baris yang sama dan bisa mengganti `salesOrderId` selama status masih draft/approved — cap dinilai atas SO lama sementara hook posting membaca baris segar. Fix: kunci baris faktur `FOR UPDATE` di awal tx, baca ulang segar, nilai ulang status, pakai baris terkunci untuk bridge/cap/nomor. 10/10 + 215/215.
2. `9e7fa91ca` fix(pembelian): `deleteGoodsReceipt` menghitung ulang `received_qty` + status PO dari snapshot tanpa kunci PO; verify/create GR sibling mengunci baris PO — GR terverifikasi yang commit di tengah tak terlihat snapshot, `received_qty` tertimpa kurang, status mundur ke `ordered`, `cancelPurchaseOrder` lalu lolos atas PO berstok masuk. Fix: kunci PO sesudah kunci GR (urutan GR lalu PO) sebelum rekomputasi. 11/11 + seluruh suite actions 3139 passed.
3. `139d2101a` fix(penjualan): `issueSalesLateFee` menghitung basis denda dari snapshot faktur tanpa kunci (pembayaran faktur yang commit di tengah membuat saldo lunas ikut didenda); `reverseSalesLateFee` membaca dokumen + daftar pembayaran tanpa kunci lawan `paySalesLateFee` yang mengunci (pembayaran bersamaan tak ikut dibalik, dokumen `reversed` ber-`paidAmount > 0`, GL drift). Fix: kunci `sales_invoices` sebelum baca faktur; kunci `sales_late_fees` sebelum baca dokumen. 15/15.
4. `f64ca481d` fix(pembelian): gerbang status PR di `createPurchaseOrder` membaca baris PR plain dalam tx; dua create konkuren dari PR sama sama-sama lolos dari snapshot sama (hook status memang mengunci PR, tetapi hanya sesudah PO lahir). Fix: kunci baris PR sebelum gerbang dibaca. Cap kumulatif qty PR terhadap PO draft TIDAK diubah — keputusan desain bisnis. 225/225.

CI lane penjualan+pembelian: `654df9786`, `9e7fa91ca`, `139d2101a`, `f64ca481d` **completed success**.

Lane keuangan+pajak — 5 fix (sesi sama, dicatat di sini supaya satu putaran utuh):

5. `8f84833d3` fix(keuangan): `postYearEndClosing` membaca `systemSetting` lewat `findFirst` sebelum `assertPeriodOpen` mengambil kunci — snapshot REPEATABLE READ terbentuk di bacaan pertama, poster kedua tetap membaca anti-dobel basi (`existing=null`), jurnal penutup dobel; sabuk P2002 mati sejak kunci unik aktif memuat `journal_number`. Fix: kunci `system_settings FOR UPDATE` sebagai bacaan pertama tx, bulan fiskal dari baris terkunci. 16/16.
6. `dca49169f` fix(pajak): `issueTaxInvoice` tanpa kunci dokumen sumber — dua terbit konkuren (nomor + key beda) sama-sama create, cermin nomor kepala tertimpa; FP pelunasan membaca Sigma FP UM dari snapshot tanpa kunci quotation. Fix: kunci `sales_invoices`/`vendor_bills` tertaut; kunci `quotations` sebelum Sigma FP UM; `issueDownPaymentTaxInvoice` mengunci `quotations` sesudah DP. Urutan DP → quotation kedua jalur. 38/38.
7. `7af667d88` fix(keuangan): `onExpenseApprovedSyncPettyCash` hanya mengunci baris expense sendiri lalu menulis ulang saldo absolut seluruh rantai dari snapshot — dua approval expense berbeda menimpa baris bersama, cek negatif atas rantai tak lengkap. Fix: gap-lock `petty_cash FOR UPDATE` sesudah kunci expense (penulis rantai finance sudah memakai kunci sama). 16/16.
8. `27ed9074a` fix(pajak): `createTaxAssessment` memanggil `assertPeriodOpen` tanpa tx sebelum create (tutup-periode di antaranya lolos) dan nomor ketetapan tanpa cek dupe (dua baris bernomor sama, eksposur register dobel). Fix: gerbang periode di dalam tx + cek nomor sesudah gap-lock `tax_assessments`. 15/15 gabungan.
9. `ecacaad0b` fix(keuangan): `deleteCheque` update tak bersyarat dari snapshot — baris baru ter-soft-delete lawan ditimpa diam-diam dengan sukses palsu. Fix: klaim `updateMany({ where: { id, deletedAt: null } })`, count 0 ditolak. 19/19.

Vonis GUGUR putaran ini (jangan diangkat lagi tanpa bukti baru):

- Lima kandidat awal agent penjualan+pembelian gugur saat verifikasi sesi utama: `deletePurchaseOrder` sudah transaksi kunci PO + nilai ulang semua guard; `deletePurchaseReturn` sudah klaim `deleteMany` status draft; `updateServiceOrderItem`, `deleteServiceOrder`, `updateAssignDriverLogisticsJob` mengacu model `ServiceOrder`/`LogisticsJob` yang TIDAK ADA di schema maupun kode (halusinasi agent — pelajaran: kandidat wajib dibuktikan terhadap schema dulu).
- Sapuan delete polos sesi utama lintas modul (aset, project, finance, hrm, master): semua lokasi bernilai sudah berkunci/klaim/guard-di-bawah-kunci; sisa kelas count-then-delete master dangkal (SetNull) — kelas yang sama dan sudah berulang kali divonis diterima risikonya.
- Kandidat agent yang dibuang agent sendiri terkonfirmasi: `JournalService.reverseJournal` tak reachable produksi; `deleteProfitCenter` tanpa penulis konkuren.

### Lanjutan putaran 12 (2026-11-01) — lane inventaris+produksi dan SDM+aset+pengaturan (agent read-only, verifikasi sesi utama)

Sepuluh kandidat agent, kesepuluh terverifikasi terhadap kode+schema dan difix:

1. `998e3e0e3` fix(produksi): gate QC `assertQcCleared` membaca NCR/inspeksi plain sementara pencipta inspeksi/NCR (`createQcInspection`/`createNonconformance`) tidak berbagi kunci — serah terima bisa lolos sesaat sebelum NCR open commit. Fix: `lockQcReferenceRow` mengunci baris `work_orders`/`production_orders`/`goods_receipts FOR UPDATE`; gate dan kedua pencipta memakai kunci sama. 183/183.
2. `df94a3b49` fix(produksi): cleanup yatim `syncServicePurchaseOrderCost` membuang baris yang baru membeku pada bacaan terkunci yang sama karena filter memakai snapshot awal. Fix: `frozenIds` = completed awal + `newlyFrozen` segar. 266/266.
3. `4dc2f3c93` fix(produksi): `createBomRevision` menulis baris revisi dari material produk yang dibaca luar tx; `updateProduct` yang commit di tengah tak terlihat. Fix: sumber baris revisi dibaca ulang lewat `tx.product.findUniqueOrThrow` sesudah kunci produk. 134/134 + 194/194.
4. `99e162057` fix(produksi): cek nama stasiun aktif (unik antar baris aktif, keputusan Q-LP-5 tanpa partial-unique di MySQL) membaca snapshot — dua create nama sama sama-sama lolos. Fix: gap-lock `SELECT id FROM work_centers FOR UPDATE` sebagai bacaan pertama helper. 9/9.
5. `48e6b03bc` fix(aset): cron penyusutan hanya membaca ulang status segar untuk metode UOP; metode lain memakai snapshot — aset ter-dispose di tengah tetap terdepresiasi dari nilai basi. Fix: semua metode menilai `freshAsset`/`freshJournals` sesudah kunci baris aset. 138/138 gabungan.
6. `9180592e6` fix(sdm): `markPayrollPaid`/`correctPaidPayroll` membaca daftar pinjaman aktif tanpa kunci lalu amortisasi absolut — dua pembayaran slip karyawan sama bisa mengonsumsi cicilan dua kali. Fix: kunci `employee_loans ... FOR UPDATE` per karyawan sebelum baca. Suite actions 3151 passed saat itu.
7. `f102a0992` fix(sdm): keputusan kontrak PKWT (submit/approve/reject/apply) menilai guard dari snapshot luar tx; apply dobel bisa menulis segmen bukan yang disetujui, `contractEndDate` mundur last-writer-wins, konversi menelan perpanjangan. Fix: kunci baris `employees` + baris-baris `contract_decision_requests` karyawan, seluruh guard (SoD, kumulatif PKWT, arah tanggal, status PKWT berjalan) dinilai ulang di bawah kunci, klaim transisi tetap kondisional. 29/29; 3 regression merah tanpa fix.
8. `78404de28` fix(sdm): `moveApplicantStage` memakai `stage` snapshot luar tx; `hireApplicant` mengunci baris yang sama dan set `hired` — tahap final bisa tertimpa `rejected` dari snapshot basi. Fix: peek luar diperkecil `{ id }`, kunci `job_applicants FOR UPDATE`, tahap + `fromStage` riwayat dari bacaan segar. 9/9.
9. `95f50e3ca` fix(sdm): transisi ulasan kinerja `update` absolut dari status terbaca; finalisasi konkuren tertimpa submit self/manager. Fix: klaim `updateMany` bersyarat status (`not: "finalized"` untuk submit; status terbaca untuk finalize), count 0 ditolak. 16/16 gabungan; 5/5 test klaim merah tanpa fix.
10. `dd8c00644` fix(sdm): `approveAttendanceCorrection` membandingkan snapshot terhadap bacaan tx tanpa kunci baris absensi — snapshot REPEATABLE READ bisa mendahului commit `updateAttendance`, tulis koreksi menimpa edit manual terbaru. Fix: kunci baris `attendances` (employeeId+date) sesudah klaim koreksi, sebelum cek konflik EC-1. 18/18 + 25/25.

CI: kesepuluh head putaran 12 **completed success**.

Vonis GUGUR putaran ini (jangan diangkat lagi tanpa bukti baru):

- `deleteAsset` vs `disposeAsset`: delete dangkal tanpa penulis konkuren bernilai.
- Rantai disiplin dobel: kalah prioritas, klaim yang ada menahan.
- PKWT accrual: terhalang unique constraint + `assertPeriodOpen` dalam tx.
- `correctPaidPayroll` assertPeriodOpen luar tx: penegakan otoritatif sudah di dalam tx.
- `generateAssetFiscalYearRows`: `@@unique([assetId, taxYear])` + `skipDuplicates` menahan.
- `updateRole` vs `deleteRole`: P2025/delete menang secara aman.
- Komponen gaji dobel aktif: master-data dobel, bukan race tulis.

### Lanjutan putaran 13 (2026-11-01) — lane laporan+API+auth (agent read-only, verifikasi sesi utama)

Enam kandidat agent; tiga difix, satu difix sesudah verifikasi menemukan lawan nyata lain, satu menunggu pola sama, satu gugur:

1. `eab780289` fix(inventaris): konsumsi reservasi WO tertimpa dua penyelesaian MI konkuren — klaim `completeMaterialIssue` hanya serial per dokumen, bukan per WO; hook MI membaca reservasi aktif plain. Fix: kunci baris `stock_reservations` aktif (WO+item+gudang) `FOR UPDATE` sebelum `findMany` di `consumeReservationsForMaterialIssueTx`. 14/14 + 209/209.
2. `bcbb2160a` fix(api): DELETE lampiran meng-unlink berkas sebelum klaim — lampiran temp yang barusan diklaim dokumen oleh submit konkuren (`referenceId 0 → nyata`) ikut ter-unlink, berkas bukti dokumen hilang. Fix: `deleteMany` terikat `{id, uploadedBy, referenceType, referenceId}` terbaca dulu; unlink hanya sesudah klaim menang. 61/61 gabungan.
3. `1933c582e` fix(sdm): persetujuan lembur dihitung ulang konkuren — cek idempotensi `calculatedValue > 0` dari snapshot luar; dua pemanggil lolos dan nilai+penyetuju pertama tertimpa. Fix: klaim akhir `updateMany` bersyarat `calculatedValue: null`; kalah klaim dengan nilai sudah terisi = no-op sukses idempotent. 180/180 gabungan.
4. `6a934593a` fix(keuangan): cron transaksi berulang menulis draft ke periode tertutup — `generateDocument` memanggil `assertPeriodOpen(date)` tanpa tx (findFirst tanpa kunci) sementara tutup-periode mengunci `system_settings FOR UPDATE`; penutupan di antara cek dan create melahirkan draft jebakan dan jadwal maju di tx yang sama. Jalur manual `runRecurringNow` sudah meneruskan tx. Fix: teruskan client tx klaim lewat `RecurringDb` (`$queryRaw` opsional). 27/27 gabungan; 2 regression merah tanpa fix.
5. `37e34789a` fix(api): verifikasi/terbit foto cek snapshot lalu `update` absolut — verifikator/penerbit konkuren kedua menimpa atribusi pertama (jejak BR-PHOTO-06/08 salah). Fix: klaim `updateMany { id, verifiedBy: null }` / `{ id, publishedBy: null }`, count 0 ditolak. 12/12; 2 regression merah tanpa fix.

Vonis GUGUR putaran ini (jangan diangkat lagi tanpa bukti baru):

- Batas gagal-login per-email dilewati burst konkuren: `peekRateLimit` sebelum bcrypt adalah desain disengaja (hanya kegagalan tercatat, login sukses tak mengunci pengguna sah); bcrypt cost-12 adalah backpressure CPU alami dan limit per-IP `proxy.ts` menahan satu sumber. Menghitung percobaan sebelum verifikasi mengubah semantik lockout tanpa bukti eksploitasi konkret — gugur.

Catatan CI lima head putaran 13: `eab780289` dan `bcbb2160a` **completed success**; `1933c582e` dan `37e34789a` **completed failure** dengan akar tunggal test basi pihak ketiga (`approval.actions.test.ts` masih mengharapkan perilaku pra-klaim pada persetujuan lembur) — produksi benar, tertutup oleh `9dfa33c66` di bawah.

### Lanjutan putaran 13 (2026-11-01) — lane master+pengaturan (agent read-only, verifikasi sesi utama)

Enam fix:

1. `3f7aa0404` fix(pengaturan): `updateUserRoles` menilai ulang guard super_admin di bawah kunci baris `users` — dua edit peran konkuren bisa sama-sama melewati cek "super_admin terakhir" dari snapshot luar dan mencabut peran satu sama lain. 24/24 gabungan.
2. `02bd28414` fix(master): cek duplikat `CustomerPriceList` terserialisasi per item — find-then-create tanpa unique constraint menghasilkan baris harga dobel untuk pasangan (item, tier) yang sama.
3. `a2d8db9f1` fix(master): cek duplikat varian kendaraan terserialisasi per model — pola sama pada varian (model, nama varian).
4. `32fe8c929` fix(master,keuangan): `updateAccount`/`updateCostCenter` menolak siklus induk di bawah kunci baris — walk rantai induk (pola `updateItemCategory` existing) kini di dalam tx terkunci, menutup race induk-saling-tukar.
5. `e29a881f2` fix(aset): `updateAssetBrand` mengunci baris brand sebelum diff model — diff dari snapshot basi menimpa perubahan model konkuren.
6. `cb4bf5641` fix(pengaturan): `createRole`/`updateRole` memetakan P2002 nama peran dobel ke error form, bukan error boundary mentah.

CI: keenam head **completed failure** dengan akar tunggal yang sama seperti putaran 13 awal — test basi klaim lembur `approval.actions.test.ts` (diharapkan menimpa, produksi mengklaim nilai pertama). Tertutup oleh `9dfa33c66` test(sdm): selaraskan harapan klaim lembur workflow dengan klaim nilai pertama — CI **completed success** terverifikasi.

### Putaran 14 (2026-11-01) — lane penjualan/pembelian/pajak/laporan (agent read-only, verifikasi sesi utama)

Tujuh fix:

1. `3e4863a91` fix(penjualan): denda piutang tidak mendenda sisa yang lunas lewat retur — basis denda menjadi `grandTotal − paidAmount − returnCredit`; action memuat kredit retur sesudah kunci baris faktur. 35/35 gabungan.
2. `a4ee313ae` fix(penjualan): alokasi DP lanjutan mengunci baris faktur sebelum membaca pembayaran — `paidAmount` tak lagi tertimpa alokasi konkuren. 50/50 suite hook DP.
3. `ccf561c9f` fix(laporan): histori proses hanya menghitung dokumen recognised (`RECOGNISED_AR_STATUSES`/`AP_STATUSES`, `deletedAt: null`) dan sisa kanonis (AR neto `returnCredit`, AP `VendorBill.balanceDue`). 20/20 gabungan.
4. `22f5b64f3` fix(laporan): sisa tagihan pekerjaan dikurangi kredit retur pada `job-billing-summary`. 45/45 gabungan.
5. `af8a8f560` fix(penjualan): edit penawaran mengunci baris faktur (`quotation_id … ORDER BY id FOR UPDATE`) sebelum menilai pelunasan. 199/199.
6. `3052458ed` fix(pembelian): tandai/batalkan transfer vendor memakai klaim kondisional `updateMany` (`transferredAt` null/bukan-null), `updated` dari count klaim, pesan kosong jujur. 10/10.
7. `7f8b6322b` fix(pajak): `createTaxPayment` menilai ulang jenis pajak dan akun di dalam tx (kunci `withholding_tax_types FOR UPDATE`, baca ulang `isActive`/`deletedAt`). 17/17 + 5/5.

CI: ketujuh head **completed success**.

Vonis GUGUR putaran ini (jangan diangkat lagi tanpa bukti baru):

- `completeReconciliation` mensertifikasi scope basi: kode aktual sudah berkunci baris induk, gate status, tie-out GL, gate cakupan baris koran, klaim kondisional `status: "draft"`. Sisa lubang hanya jendela snapshot mikro; menutupnya butuh protokol kunci di semua penulis jurnal/baris koran — tidak proporsional.

### Putaran 15 (2026-11-01) — lane produksi/inventaris + CRM/proyek/aset (agent read-only, verifikasi sesi utama)

Delapan fix:

1. `cf8cf3bf8` fix(produksi): start WO konkuren tidak lagi over-reserve stok yang sama — dua WO berbeda tak pernah berbagi kunci klaim; service kini mengunci baris `items` terurut lalu membaca ulang reservasi aktif lawan sebagai LOCKING READ (snapshot REPEATABLE READ tak disegarkan kunci). On-hand 100, dua WO butuh 80 → reservasi kedua terpotong 20 + shortage 60. 16/16 service; merah tanpa fix (`expected 80 to be 20`).
2. `5d1f8e811` fix(inventaris): pulihan void faktur mewarisi umur FIFO dan expiry lot asal (STOK-09) — layer pulihan lahir tanpa `sourceCreatedAt` (berumur dari tanggal void) dan lot lahir ulang tanpa `expiryDate`. Metadata perjalanan kini disimpan di JSON `batchAllocations` existing (tanpa migrasi); COGS penjualan berikut tak lagi mengambil lot lebih muda dulu. 51/51 + 390/390 terkait.
3. `5924f0c4f` fix(aset): `declining_balance` tanpa tarif kategori di-skip `no-basis`, bukan fallback garis lurus berlabel saldo menurun (buku 120jt sempat tersusut 2jt/bln garis lurus). 12/12.
4. `c5b5542a6` fix(garansi): odometer lapor klaim tidak lagi memundurkan registry kendaraan — penulis `lastOdometerKm` satu-satunya di repo menimpa mentah; registry kini hanya maju lewat klaim kondisional `updateMany` (klaim sendiri tetap tercatat apa adanya, filosofi F-021). 47/47 gabungan.
5. `df1700215` fix(penjualan): konfirmasi DP menautkan Project dan WorkOrder dua arah — WO lahir tanpa `projectId`, Project tanpa `workOrderId`/`customerVehicleId`, sehingga P/L proyek membaca 0 untuk pendapatan/biaya WO. Urutan lahir dibalik dalam tx sama. 127/127 gabungan.
6. `00a2cde73` fix(aset): jurnal peristiwa perubahan aset (`ASSET_CHANGE_EVENT`) ikut nilai buku cron, disposal, dan laporan — `journalBookValue` membaca neto per akun (revaluasi/restatement/reklasifikasi) + kontra impairment terpisah; disposal membalik impairment eksplisit dan fail-closed tanpa akun. Tanpa ini disposal aset revaluasi mencatat laba semu dan menyisakan saldo yatim GL. 216/216 (12 file); merah tanpa fix 8 test.
7. `9dc6bd0f1` fix(aset): perubahan parameter berjalan aset (kategori/metode/masa manfaat/residu) wajib lewat peristiwa perubahan — `updateAsset` berizin `edit_assets` menulis langsung, melewati jalur F-115 berizin `manage_assets`. Banding di bawah kunci baris; echo sama tetap lolos. 125/125.
8. `05574a3b7` test(produksi): mock `$executeRaw` pada penjaga klaim start WO — penutup merah CI di bawah (test-only, produksi benar).

CI: head `cf8cf3bf8`, `5d1f8e811`, `5924f0c4f`, `c5b5542a6`, `df1700215` **completed failure** dengan akar tunggal `work-order-start-lock.test.ts` yang tidak punya mock `$executeRaw` untuk kunci reservasi baru dari fix 1 (tak dijalankan lokal putaran itu — penguat aturan: ubah service bersama wajib grep + jalankan semua file test pemanggil). Penerusnya `05574a3b7`, `00a2cde73`, `9dc6bd0f1` **completed success** — seluruh putaran 15 hijau di head terakhir.

Keterbatasan diterima putaran ini (dicatat, bukan ditunda diam-diam):

- Peristiwa reklasifikasi yang memindahkan kategori membuat akun kategori berjalan berbeda dari akun saat jurnal lampau ditulis; loader menilai akun kategori berjalan (pola existing). Akuntansi per-akun-lama butuh snapshot akun per peristiwa — di luar cakupan.
- Pasangan WO/Project yatim dari konfirmasi DP sebelum fix 5 tidak diperbaiki mundur (butuh keputusan data historis).
