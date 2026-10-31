# Round 8 — Keuangan Inti (temuan agen audit, read-only)

Hasil audit agen keuangan inti sesi 4 (2026-10-31). Status
CONFIRMED/PLAUSIBLE seperti dilaporkan agen; triase main session dari
kode nyata menentukan vonis akhir sebelum fix. Domain ini sama dengan
dua kegagalan integrasi jurnal di log sesi 4 — triase keduanya masuk
antrean S4-B bersama dokumen ini.

## Temuan

### R8-KEU-01 — HIGH, CONFIRMED — Refund kredit parsial kedua selalu gagal P2002
**Status: SELESAI 2026-10-31.** Fix: jurnal refund memakai
`referenceType: "CustomerCreditRefund"` (sebelumnya
`"CustomerCredit"`) sehingga refund parsial kedua tidak bertabrakan
dengan unique `active_reference_key`; refund pertama yang sudah
terlanjur di-reverse manual tetap bebas. Regression: test
"R8-KEU-01: refund parsial kedua memakai referenceType refund
sendiri" + ekspektasi test refund normal diperbarui.
`src/lib/services/customer-credit.service.ts:347-367` — jurnal refund
selalu `referenceType:"CustomerCredit", referenceId: creditId`,
status `POSTED`.
`prisma/migrations/20261023170000_journal_active_reference_unique_f127v/migration.sql:40-49`
+ `prisma/schema.prisma:4546-4557` — unique generated
`active_reference_key` untuk jurnal non-REVERSED non-deleted per
(referenceType, referenceId). Skenario: kredit Rp3.000.000 → refund
Rp1.000.000 (kunci A) sukses → refund sisa Rp2.000.000 (kunci B, lolos
claim idempotency) → `journal.create` tabrak unique → tx rollback.
Diulang berapa kali pun gagal. Sisa kredit tidak bisa dikembalikan
sampai jurnal pertama di-reverse manual. Test
`customer-credit.service.test.ts` mock Prisma penuh — constraint DB
tidak pernah ditegakkan, celah tidak tertangkap.

### R8-KEU-02 — HIGH, CONFIRMED — Alokasi kredit abaikan returnCredit + terima faktur belum posted
**Status: SELESAI 2026-10-31.** Fix di `allocateCreditToInvoice`:
(1) gate status `["posted","partial"]` sama seperti
`createSalesPayment` (draft/cancelled ditolak definitif);
(2) `owing = grandTotal − paidAmount − returnCredit` lewat loader
kanonis `loadReturnCreditByInvoiceIdWithClient` dalam tx yang sama.
Regression: test draft ditolak; skenario returnCredit tercakup oleh
loader yang sama dengan suite STOK-02 (mock `salesReturn` kosong →
0, jalur beban penuh teruji di suite recalc).
`src/lib/services/customer-credit.service.ts:88,98-101` — `owing =
grandTotal - paidAmount`, returnCredit tidak dikurangkan; hanya
status `cancelled` ditolak. `src/lib/reports/return-credit.ts:108-134`
— loader returnCredit kanonis dipakai `createSalesPayment`, tidak
dipakai di sini. `src/lib/hooks/sales-payment.hook.ts:29` — recalc
skip draft; `src/actions/sales.actions.ts:1253-1277` — `postInvoice`
claim draft→posted tanpa recalc pembayaran. Skenario A: faktur
Rp100 lunas oleh retur completed (paidAmount 0, returnCredit 100,
status paid) → owing terhitung 100 → alokasi kredit 100 posting
Dr 210102/Cr Piutang kedua kali, AR negatif. Skenario B: alokasi ke
faktur draft (panel UI menawarkan non-cancelled,
`penjualan/uang-muka/[slug]/page.tsx:84-85`) → payment + jurnal POSTED
lahir, recalc skip → paidAmount tetap 0 → `postInvoice` posting
Dr Piutang penuh di atas kredit yang sudah masuk. Kredit terpakai,
faktur tampil belum terbayar. Pasangan R8-JB-01/R8-JB-02.

### R8-KEU-03 — SELESAI 2026-10-31 — Purchase advance tanpa idempotency
`src/actions/purchase-advance.actions.ts:40-138` — tidak ada
pembacaan `idempotencyKey`; nomor dokumen + sequence selalu segar di
luar tx. `pembelian/uang-muka/_components/purchase-advance-form.tsx:56-80`
— FormData tanpa key; tombol hanya disable selama `isPending`.
Skenario: submit → timeout jaringan → submit ulang / tab kedua /
replay langsung → advance baru + jurnal POSTED Dr Uang Muka/Cr Kas
baru tiap kali. Pembanding: `bank-transfer.actions.ts:42,79-83` dan
`tax-payment.actions.ts:37,82-86` pasang `checkIdempotency` dalam
tx; jalur ini satu-satunya money creator tanpa pola itu. Bonus:
action hanya cek eksistensi 2 akun (`:60-68`), tanpa tipe/status —
akun salah tipe/nonaktif lolos lewat direct call. Schema
`finance.schemas.ts:382-408` hanya tolak advanceAccount ==
paymentAccount.
Perbaikan: form create mengirim `idempotencyKey` persisten per sesi form
dan menggantinya setelah sukses; action memeriksa kunci di awal tx via
`checkIdempotency`, memeriksa akun aktif/non-deleted `reportGroup BANK`
untuk pembayaran, dan `type ASSET` untuk uang muka, serta mengecek slug
dalam tx lewat `nextSlugWithClient`. Regression di
`purchase-advance-validation.test.ts` (klaim key, throw sebelum create,
akun nonaktif/wrong-group/wrong-type).

### R8-KEU-04 — SELESAI 2026-10-31 — deleteExpense race: jurnal POSTED yatim
`src/actions/finance.actions.ts:1960-1966` — status dibaca di luar
tx; `:1979` — `tx.expense.delete` tanpa syarat, tanpa lock baris,
tanpa recheck. Skenario: delete baca status `draft` → concurrent
`approveExpense` + `markExpensePaid` commit (jurnal POSTED Dr Beban/
Cr Kas) → delete tetap hapus baris expense. Jurnal yatim, uang
terposting, sumber hilang. Jalur sama juga hapus expense yang
petty-cash sync-nya sudah commit.
Perbaikan: delete mengunci baris `FOR UPDATE`, membaca ulang status di
dalam tx, dan hanya menghapus lewat `deleteMany` bila status bukan
approved/paid. Regression di `finance.actions.test.ts`.

### R8-KEU-05 — SELESAI 2026-10-31 — approveExpense partial commit
`src/actions/finance.actions.ts:871-901` —
`onExpenseApprovedSyncPettyCash` jalan sebagai tx sendiri, flip
status `updateMany` sesudahnya di luar tx bersama.
`src/lib/hooks/expense.hook.ts:22-31` — hook lock + baca ulang
expense tapi tidak recheck status di dalam tx. Skenario: sync
commit (PettyCash OUT + chain recalc) → flip gagal (count 0 karena
reject/delete menyela) atau proses mati di antara → kas kecil
berkurang, expense tetap draft/rejected. Dedupe by referenceNo
cegah dobel saat retry, tapi state tidak konsisten.
Perbaikan: `approveExpense` kini mengunci baris, membaca ulang status,
menjalankan sinkron kas kecil, akrual klaim bila ada, dan flip status
dalam tx yang sama. Hook menerima `txClient` opsional (selaras pola tx
hook repo) dan menolak status di luar draft/pending/approved sebelum
menulis kas kecil. Workflow path sesudah commit tetap memakai hook
satu-argumen — guard status yang sama melindungi sinkron tertunda dari
expense terminal. Regression: order test + hook status test.

### R8-KEU-06 — SELESAI 2026-10-31 — Item rekonsiliasi dipakai ulang lintas draft
`src/actions/finance.actions.ts:1447-1457` — reuse check hanya dalam
recon yang sama. `prisma/schema.prisma:4915` —
`@@unique([bankReconciliationId, journalEntryId])` hanya komposit
per-recon, tidak global. Skenario: journalEntryId +
bankStatementLineId sama di-match di dua draft rekonsiliasi berbeda
→ keduanya `completeReconciliation` lolos. Dampak kontrol/state,
bukan double-post GL.
Perbaikan: pemakaian didefinisikan terhadap rekonsiliasi **completed**
(bukan kepemilikan draft): match menolak jurnal/baris yang sudah ada di
recon selesai; complete mengunci baris jurnal lalu baris koran (urutan
global konsisten) dan memeriksa ulang klaim global sebelum klaim
draft→completed. Item penyesuaian (kedua id null) tak tersentuh. Tidak
perlu migrasi: unique komposit tetap menjadi penegak per-recon, cek
global dari query terindeks. Regression: dua test di
`finance.actions.test.ts` (match + complete ditolak).

### R8-KEU-07 — MEDIUM, PLAUSIBLE — completeReconciliation percaya saldo input
`src/actions/finance.actions.ts:1313-1327` —
`statementBalance`/`bookBalance` disimpan apa adanya;
`:1682-1703` — formula closing hanya dari saldo tersimpan, tanpa
recompute GL, tanpa cek cakupan semua baris statement. Skenario:
buat recon saldo 0/0 + satu match kecil → status completed walau GL
bank beda jauh. Sertifikasi palsu.

### R8-KEU-08 — MEDIUM, PLAUSIBLE — updatePettyCash hard-delete jurnal
`src/actions/finance.actions.ts:1144-1158` — `deletePettyCashJournal`
hard-delete semua jurnal+entries ref PettyCash tanpa cek
status/periode/recon; `:2441-2451` guard POSTED dibaca di luar tx,
`:2498` delete di dalam tx tanpa recheck. Skenario: race dengan
posting/void/recon di antara guard dan delete → jurnal POSTED
terhapus fisik, bukan di-reverse. Jejak audit hilang.

### R8-KEU-09 — LOW, PLAUSIBLE — updateSalesPayment abaikan returnCredit (legacy)
`src/actions/sales.actions.ts:3596` — `remaining = grandTotal -
otherPaid`, returnCredit tidak dikurangkan; bandingkan
`createSalesPayment:2080-2098` yang benar. Skenario: faktur sudah
terpotong retur → edit pembayaran legacy → over-apply lolos → jurnal
repost terlalu besar. Hanya baris legacy tanpa jurnal.

### R8-KEU-10 — LOW, PLAUSIBLE — Refund PPN uang muka: drift rounding
`src/lib/tax/down-payment-vat.ts:285-306` — porsi PPN proporsional
`safeRound(...,2)` per refund parsial, tanpa residu di refund
penutup; bandingkan `computeAllocationNet:314-338` yang menyerap
residu sen saat kumulatif penuh. Skenario: banyak refund parsial →
total PPN ter-refund menyimpang beberapa sen dari PPN uang muka asal.

Catatan non-finding: toleransi settlement Rp1
(`SETTLEMENT_TOLERANCE_IDR`, FIN-BR-006) disengaja terdokumentasi.
Header reversal `finance.actions.ts:2302-2303` tidak tukar
totalDebit/totalCredit — bukan defect, jurnal POSTED selalu balance.

## Bersih (jangan audit ulang)
- Period lock: `assertPeriodOpen` lock baris `system_settings` FOR
  UPDATE (`period-lock.service.ts`), granularity hari; close/reopen
  periode tolak turunkan lock existing (`period-close.actions.ts`).
- Jurnal: `createJournal` balance epsilon + sign check +
  Serializable; `postJournal` claim DRAFT→POSTED atomik;
  `deleteJournal` recheck POSTED dalam tx FOR UPDATE (fix Round 5);
  `reverseJournal` service tukar header totals benar.
- Year-end closing: anti-double POSTED dalam tx, resolver retained
  earnings fail-closed, reversal claim POSTED→REVERSING atomik
  (`year-end-closing.service.ts`).
- Vendor payment: revalidasi bill di bawah lock, overpay guard,
  reversal restore per-alokasi; sales payment create: lock faktur +
  returnCredit + tolerance.
- Bank transfer / tax payment: idempotency + period dalam tx + void
  ber-reversal. Cheque register-only tanpa GL by design.
- Bank statement lines: urutan lock baris→header→setting→recon
  konsisten (R-12/R-15), recalc absolut.
- Soft-delete leak: AP aging filter `deletedAt: null`;
  journal/expense/pettyCash/vendorBill/vendorPayment/salesPayment/
  salesInvoice masuk `BULK_DELETE_REQUIRES_INDIVIDUAL`.
- Multi-currency/FX: tidak ada. Schema hanya
  `currencyCode/Symbol/Locale` default IDR di settings; tidak ada
  exchange-rate field di jalur finance.
- Fixed sejak Round 5–7: petty-cash void chain, gate akun klaim
  reimbursement fail-closed (`finance.actions.ts:836-845`), UI
  idempotency kredit (key persisten sessionStorage).
