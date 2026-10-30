# ROUND5-FINHR

Audit read-only keuangan/HR/CRM. Larangan dipatuhi: `src/actions/hrm.actions.ts` dan `prisma/schema.prisma` tidak dipakai sebagai dasar temuan.

## Ringkasan

Total temuan yang dipertahankan: 8.

- `CONFIRMED`: 5.
- `PLAUSIBLE`: 3.

Distribusi severity:

- `HIGH`: 4.
- `MEDIUM`: 4.
- `LOW`: 0.

## Temuan

### 1. `deleteJournal` dapat menghapus jurnal yang sudah POSTED lewat race status

- Klasifikasi: `CONFIRMED`.
- Severity: `HIGH`.
- File:line:
  - Lookup dan cek status di luar transaksi: `src/actions/finance.actions.ts:1909-1912`.
  - Hapus entri, attachment, dan jurnal tanpa lock atau recheck status: `src/actions/finance.actions.ts:1916-1922`.

Bukti singkat:

- Status hanya dibaca sekali sebelum transaksi.
- Di dalam transaksi, kode langsung `journalEntry.deleteMany` dan `journal.delete`.
- Tidak ada `FOR UPDATE`, recheck `status`, atau period lock.

Skenario angka:

1. Jurnal J-100 masih `DRAFT`, total Rp10.000.000.
2. Request A `deleteJournal(J-100)` membaca J-100 sebagai `DRAFT` di :1909.
3. Request B `postJournal(J-100)` commit; J-100 menjadi `POSTED`.
4. Request A lanjut dan menghapus J-100 beserta entri GL dari periode yang sudah diposting.

Dampak: riwayat GL terhapus permanen, bukan direverse. Neraca/GL berubah tanpa jurnal lawan dan tanpa jejak rekonsiliasi.

Fix terkecil:

- Buka transaksi lebih dulu, kunci baris jurnal `FOR UPDATE`, lalu baca ulang dan tolak bila bukan `DRAFT`.
- Bila jurnal punya tanggal transaksi, jalankan `assertPeriodOpen(journal.transactionDate, tx)` sebelum hapus.

Regression test:

- Test konkurensi: baca jurnal `DRAFT`, ubah menjadi `POSTED`, lalu jalankan delete di tx; assert delete gagal dan row + entries masih ada.
- Test biasa: delete jurnal `POSTED` gagal, delete jurnal `DRAFT` sukses.

---

### 2. Void petty cash dihitung ulang sesudah `createPettyCash`/`updatePettyCash`, sehingga rantai aktif bergeser dan transaksi sah dapat ditolak

- Klasifikasi: `CONFIRMED` sebagai inkonsistensi rantai terhadap kontrak void.
- Severity: `HIGH`.
- File:line:
  - Default `recalcPettyCashChain` tidak mengeluarkan void/deleted: `src/actions/finance.actions.ts:1074`.
  - `createPettyCash` memakai `recalcPettyCashChain(tx, { guardNegative: true })` tanpa `excludeVoid`: `src/actions/finance.actions.ts:1257`.
  - `updatePettyCash` juga memakai `recalcPettyCashChain(tx, { guardNegative: true })` tanpa `excludeVoid`: `src/actions/finance.actions.ts:2496`.
  - Jalur void justru memakai `excludeVoid: true` dan menyebut void dibekukan: `src/actions/finance.actions.ts:2030-2045`.

Bukti singkat:

- `deletePettyCash` menegaskan void/deleted dibekukan sebagai snapshot historis dan tidak ditulis ulang.
- Namun `createPettyCash` dan `updatePettyCash` menghitung ulang semua record, termasuk void/deleted.
- Hasilnya, balance void yang harusnya beku ikut mengubah running balance aktif.

Skenario angka:

1. `IN` Rp100.000, balance Rp100.000.
2. `OUT` Rp30.000 lalu di-void. Rantai aktif benar tetap Rp100.000.
3. Buat `OUT` Rp80.000.
4. Recalc non-exclude menghitung `100.000 - 30.000(void) - 80.000 = -10.000`, lalu `guardNegative` menolak transaksi sah.

Varian lain: create/update sesudah void dapat menulis ulang `balanceBefore`/`balanceAfter` record sesudah void dengan basis yang salah.

Fix terkecil:

- Ubah call `createPettyCash` dan `updatePettyCash` menjadi `recalcPettyCashChain(tx, { guardNegative: true, excludeVoid: true })`.
- Samakan definisi chain aktif dengan hook expense: hanya `status: "posted", deletedAt: null` yang ikut rantai.

Regression test:

- Seed chain `IN 100.000`, `OUT 30.000 void`, lalu create `OUT 80.000`; assert sukses dan balance aktif akhir Rp20.000.
- Assert record void tidak berubah `balanceBefore`/`balanceAfter`-nya.

---

### 3. Writer RAB tidak mengambil project `FOR UPDATE`, sehingga item dapat masuk sesudah budget dikunci

- Klasifikasi: `CONFIRMED`.
- Severity: `HIGH`.
- File:line:
  - `loadBudgetProject` hanya membaca project tanpa lock: `src/actions/project.actions.ts:812-826`.
  - `assertBudgetUnlocked` hanya memvalidasi hasil baca tersebut: `src/actions/project.actions.ts:828-830`.
  - `setProjectContractFromQuotation`: `src/actions/project.actions.ts:912-914`.
  - `setProjectContractManual`: `src/actions/project.actions.ts:970-972`.
  - `createProjectBudgetItem`: `src/actions/project.actions.ts:1014-1016`.
  - `updateProjectBudgetItem`: `src/actions/project.actions.ts:1042-1043`.
  - `deleteProjectBudgetItem`: `src/actions/project.actions.ts:1068-1069`.
  - `lockProjectBudget` mengambil project `FOR UPDATE`: `src/actions/project.actions.ts:1081-1089`.

Bukti singkat:

- `lockProjectBudget` mengunci baris project.
- Writer lain tidak mengambil lock yang sama; mereka hanya membaca `budgetLockedAt` dari snapshot tx.
- Karena itu writer dapat lolos dengan snapshot `budgetLockedAt = null`, lalu commit sesudah lock commit.

Skenario angka:

1. RAB total Rp100.000.000, belum terkunci.
2. Request A `createProjectBudgetItem` senilai Rp50.000.000 membaca `budgetLockedAt = null`.
3. Request B `lockProjectBudget` commit; anggaran dianggap terkunci Rp100.000.000.
4. Request A commit; item Rp50.000.000 masuk tanpa proposal revisi/log revisi.

Hasil akhir efektif Rp150.000.000, tetapi `budgetLockedAt` dan `budgetRevisionNo` seolah anggaran masih final Rp100.000.000.

Fix terkecil:

- Tambahkan varian locking dari `loadBudgetProject`: `SELECT id FROM projects WHERE id = ... FOR UPDATE` sebelum membaca `budgetLockedAt`.
- Terapkan untuk semua writer budget/kontrak, bukan hanya `lockProjectBudget`.

Regression test:

- Test konkurensi dua tx: tx1 lolos assert sebelum lock, tx2 `lockProjectBudget` commit, tx1 create item harus dibatalkan/gagal.
- Test urutan serial: create item sesudah lock tetap gagal dengan error budget terkunci yang sama.

---

### 4. `convertLead` tidak mengecek ulang status/deletedAt di dalam tx terkunci

- Klasifikasi: `CONFIRMED`.
- Severity: `MEDIUM`.
- File:line:
  - Precheck status convertible dan `customerId`: `src/actions/crm.actions.ts:223-231`.
  - Lock lead di dalam tx, tetapi fresh read hanya memilih `customerId`: `src/actions/crm.actions.ts:242-249`.
  - Customer dibuat dan lead dipaksa `status: "won"`: `src/actions/crm.actions.ts:250-264`.

Bukti singkat:

- `FOR UPDATE` hanya menutup race dua convert bersamaan.
- Status dan `deletedAt` tidak divalidasi ulang sesudah row lock didapat.
- Transisi status lain atau soft-delete yang commit sebelum lock terambil tidak menghentikan konversi.

Skenario:

1. Lead L1 status `qualified`, belum punya customer.
2. Request A `convertLead` lolos precheck :223-231, lalu tersendat sebelum/di luar tx.
3. Request B mengubah lead menjadi `lost` atau soft-delete.
4. Request A mengambil lock, hanya melihat `customerId` masih null, lalu membuat Customer baru dan mengembalikan lead ke `won`.

Hasil: customer lahir dari lead non-convertible/terhapus dan riwayat transisi CRM lewat jalur tak terjaga.

Fix terkecil:

- Sesudah `FOR UPDATE`, baca ulang `{ status, customerId, deletedAt }`.
- Ulangi cek `CONVERTIBLE_STATUSES` dan `deletedAt` di dalam tx.

Regression test:

- Test konkurensi: precheck sukses, status lead diubah ke `lost`/soft-deleted sebelum tx convert memegang lock; assert convert gagal dan tidak ada Customer baru.
- Test normal: lead `qualified` aktif tetap dapat dikonversi sekali.

---

### 5. Plafon potongan disiplin 50% dihitung di luar tx dan tidak dihitung ulang di dalam tx

- Klasifikasi: `CONFIRMED` sebagai celah race/konkurensi.
- Severity: `MEDIUM`.
- File:line:
  - Existing dan aggregate dibaca di luar tx: `src/lib/services/disciplinary-deduction.service.ts:124-148`.
  - Di dalam tx hanya idempotency yang dicek ulang: `src/lib/services/disciplinary-deduction.service.ts:178-184`.

Bukti singkat:

- Plafon per periode dihitung dari aggregate `alreadyApplied` snapshot.
- Apply konkuren untuk keputusan berbeda, karyawan sama, periode sama, membaca snapshot yang sama.
- Jurnal memakai `referenceType: DISC09_REFERENCE_TYPE`, `referenceId: decision.id` di `src/lib/services/disciplinary-deduction.service.ts:186-192`, jadi guard jurnal juga tidak menutup agregat lintas-keputusan dalam satu periode.

Skenario angka:

1. `periodPay` karyawan Rp10.000.000, plafon 50% = Rp5.000.000.
2. Keputusan D1 dan D2 masing-masing Rp4.000.000 untuk periode yang sama.
3. Dua apply konkuren sama-sama membaca `alreadyApplied = 0`.
4. Keduanya lolos cap; total penerapan menjadi Rp8.000.000, melebihi plafon Rp5.000.000.

Fix terkecil:

- Di dalam tx, kunci baris employee/decision scope atau hitung ulang aggregate sesudah mengambil lock serialisasi per `(employeeId, period)`.
- Tolak/gunakan sisa plafon berdasarkan aggregate hasil recheck, bukan snapshot luar-tx.

Regression test:

- Test konkurensi dua `applyDisciplinaryDeduction` untuk dua keputusan berbeda, karyawan/periode sama; assert total applied tidak melebihi Rp5.000.000 dari contoh di atas.
- Test serial: apply kedua sesudah cap habis ditolak.

---

## Pelengkap

### 6. `onPayrollPaid` menutupi mismatch gross vs komponen via self-heal, dan kaki gaji dapat menjadi debit negatif

- Klasifikasi: `PLAUSIBLE`.
- Severity: `HIGH`.
- File:line:
  - Self-heal `entries[0].debit = creditTotal - otherDebit`: `src/lib/hooks/accounting.hook.ts:3400-3416`.
  - Header dipaksa `totalDebit = totalCredit = creditTotal`: `src/lib/hooks/accounting.hook.ts:3418-3428`.

Bukti singkat:

- Bila stored gross tidak sama dengan komponen kredit, kode tidak menolak jurnal; ia menimpa debit gaji dari total kredit.
- Bila debit lain (mis. PKWT) melebihi total kredit, `entries[0].debit` hasil `safeAdd(creditTotal, -otherDebit)` dapat negatif.
- Karena jurnal dibuat langsung lewat `tx.journal.create`, tidak ada validasi entri negatif setara guard jurnal umum.

Skenario angka:

1. Kredit net + statutory hanya Rp6.000.000.
2. Kaki debit PKWT pada `entries[1..]` sebesar Rp9.000.000.
3. `entries[0]` awal dari gross Rp10.000.000.
4. Setelah self-heal: `entries[0].debit = 6.000.000 - 9.000.000 = -3.000.000`.
5. Header tetap ditulis balance Rp6.000.000/Rp6.000.000.

Ini masih `PLAUSIBLE` karena belum dibuktikan kombinasi stored gross/PKWT itu lahir dari jalur generate slip sah.

Fix terkecil:

- Tolak bila hasil self-heal kurang dari 0 atau mismatch melebihi toleransi sen.
- Atau fail-closed: jangan self-heal; throw bila `debitSum !== creditTotal`.

Regression test:

- Unit test `onPayrollPaid` dengan entries di mana PKWT debit melebihi credit total; assert throw dan tidak ada journal/payment side effect.
- Test normal: slip standar tetap posting jurnal balance tanpa entri negatif.

---

### 7. Akrual PKWT menerima amount closing negatif dan mencampurnya ke jurnal agregat

- Klasifikasi: `PLAUSIBLE`.
- Severity: `MEDIUM`.
- File:line:
  - Closing amount `amount = event.amount - priorAccrued`: `src/lib/services/pkwt-compensation.service.ts:286-292`.
  - Hanya `amount === 0` yang dilewati: `src/lib/services/pkwt-compensation.service.ts:293`.
  - Amount negatif ikut `rows` dan `totalAmount`: `src/lib/services/pkwt-compensation.service.ts:294-304`.
  - Jurnal agregat memakai total rows: `src/lib/services/pkwt-compensation.service.ts:323-326`.

Bukti singkat:

- Tidak ada guard `amount < 0`.
- Row negatif dapat menurunkan total jurnal agregat dan membuat subledger karyawan melampaui nominal event.

Skenario angka:

1. Event A closing amount seharusnya -Rp500.000 karena prior accrual sudah melebihi nominal event.
2. Event B amount +Rp1.500.000.
3. Jurnal agregat menjadi Rp1.000.000 dan tetap balance.
4. Subledger A negatif; total akrual A melampaui nominal event tanpa error.

Ini `PLAUSIBLE` karena jalur perubahan basis/event yang membuat `priorAccrued > event.amount` belum dibuktikan penuh dari semua caller/UI.

Fix terkecil:

- Tambahkan `if (amount < 0) throw ...` sebelum row dimasukkan.
- Bila koreksi memang diinginkan, pisahkan sebagai reversal eksplisit, bukan baris akrual negatif diam-diam.

Regression test:

- Unit test closing accrual dengan `priorAccrued > event.amount`; assert throw dan tidak ada journal/accrual baru.
- Test normal: closing positif tetap akrual ke nominal event.

---

### 8. Klaim reimbursement dapat disetujui dengan akun beban placeholder/nonaktif/non-EXPENSE

- Klasifikasi: `PLAUSIBLE`.
- Severity: `MEDIUM`.
- File:line:
  - Placeholder akun dipilih hanya `type: "EXPENSE"`, `orderBy: { id: "asc" }`, tanpa filter aktif/deleted: `src/actions/reimbursement.actions.ts:130-143`.
  - Claim dibuat dengan placeholder tersebut: `src/actions/reimbursement.actions.ts:195-216`.
  - `setReimbursementClaimAccounts` hanya memeriksa akun ada: `src/actions/reimbursement.actions.ts:267-273`.
  - Approve klaim hanya memeriksa bukti, nominal bukti, dan SoD: `src/actions/finance.actions.ts:834-859`.
  - Sesudah guard itu, approve lanjut ke sinkronisasi/jurnal klaim: `src/actions/finance.actions.ts:861-874`.

Bukti singkat:

- Komentar desain menyatakan keuangan wajib menetapkan akun final sebelum approve.
- Tetapi `setReimbursementClaimAccounts` tidak memvalidasi `type`, `isActive`, atau `deletedAt`.
- `approveExpense` tidak menegakkan bahwa akun sudah diganti dari placeholder atau masih valid.

Skenario angka:

1. Klaim Rp250.000 dibuat; placeholder memilih akun `EXPENSE` pertama berdasarkan id.
2. Keuangan tidak mengganti akun, atau memilih akun kas/nonaktif lewat payload manual.
3. Approve lolos guard bukti/SoD.
4. Akrual memakai accountId klaim, sehingga beban bisa masuk akun yang salah/nonaktif.

Ini `PLAUSIBLE` karena validasi UI/picker dan kontrak J-RB1 di luar potongan yang dibaca bisa saja sudah membatasi pilihan, tetapi action sendiri tidak fail-closed.

Fix terkecil:

- Di `setReimbursementClaimAccounts`, validasi account beban bertipe `EXPENSE`, aktif, dan tidak deleted; validasi akun bayar sebagai kas/bank aktif.
- Di approve klaim, fail-closed bila accountId belum valid/final menurut aturan yang sama.

Regression test:

- Test `setReimbursementClaimAccounts` dengan akun non-`EXPENSE`, nonaktif, dan deleted; assert ketiganya ditolak.
- Test approve klaim yang masih memakai placeholder tidak valid; assert gagal sebelum jurnal dibuat.

---

## Catatan non-temuan

- Recurring expense tidak ditulis sebagai temuan ganda karena klaim atomik dan period gate sudah ada di jalur cron/manual yang dibaca; pola skip-backlog adalah kebijakan terdokumentasi, bukan bukti bug.
- Project PL variance negatif tidak ditulis sebagai bug karena builder proyek memang menampilkan variance/overrun sebagai sinyal, bukan menyembunyikannya.

Path laporan: `docs/team-lead/ROUND5-FINHR.md`.

