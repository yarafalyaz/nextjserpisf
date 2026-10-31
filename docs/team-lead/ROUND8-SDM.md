# Round 8 — SDM/Payroll (temuan agen audit, read-only)

Hasil audit agen payroll sesi 4 (2026-10-31). Dedupe: Round 5 temuan
#5–#8 dan Round 6 workflow/notif dikeluarkan. Status CONFIRMED/
PLAUSIBLE seperti dilaporkan agen; triase main session dari kode
nyata menentukan vonis akhir sebelum fix.

## Temuan

### R8-SDM-01 — HIGH, CONFIRMED — Koreksi slip paid: restore pinjaman tak dipotong ulang
**Status: SELESAI 2026-10-31** — terverifikasi dari kode nyata.
`correctPaidPayroll` memulihkan sisa pinjaman lalu slip koreksi
langsung `paid` dengan jurnal `onPayrollPaid` mengkredit Piutang
Karyawan `loanDeduction` yang sama, tetapi subledger tidak pernah
dipotong ulang: karyawan membayar ganda dan GL piutang negatif.
Fix: sesudah pemulihan, alokasi yang sama dikurangi kembali PERSIS
(invers per alokasi, bukan alokasi segar -- allocator segar atas
saldo terpulihkan bisa memilih bucket lain dan saldo akhir
menyimpang, terbukti oleh test pertama yang gagal). Test existing
yang mengunci perilaku salah (E-HRCR-2/2b berharap 1.500.000)
diperbarui sadar ke neto nol.
`src/actions/hrm.actions.ts:3410-3440` (restore), `:3454-3490` (slip
koreksi dibuat langsung `paid`, `loanDeduction` disalin utuh),
`:3548` (`onPayrollPaid` saja — tanpa amortisasi pinjaman; hook
jurnal `accounting.hook.ts:3095-3466` tidak menyentuh `EmployeeLoan`
sama sekali). Skenario: sisa pinjaman Rp1.000.000 sesudah terpangkas
Rp500.000 oleh slip S. Koreksi S → sisa dipulihkan Rp1.500.000, tapi
jurnal koreksi tetap kredit Piutang Karyawan Rp500.000. GL piutang
neto terpotong sekali (Rp500.000), subledger bilang utang penuh
lagi. Slip normal berikutnya memotong lagi dari Rp1.500.000 →
karyawan membayar ekstra Rp500.000, saldo GL piutang jadi negatif
Rp500.000. Test existing `hrm-payroll-correction.test.ts:262,315-316`
hanya assert restorasi — perilaku ini terkunci sebagai "benar".

### R8-SDM-02 — MEDIUM, CONFIRMED — Slip asal + koreksi dobel di agregator BPJS/PPh21
**Status: SELESAI 2026-10-31** — `computeBpjsForPeriod` dan
`computePph21ForPeriod` kini menyingkirkan slip asal yang sudah
punya koreksi (`correctsPayrollId` menunjuk asal, dalam set baca
yang sama). Slip lama tanpa kolom tidak berubah perilaku (kolom
sudah ada sejak HR-BR-005). Agregator tidak diekspor, jadi
regression berupa guard statis di suite koreksi.
`src/actions/hrm.actions.ts:1578-1599` (agregator BPJS se-masa hanya
menyingkirkan `cancelled/canceled`), `:1638-1649` (slip se-tahun
untuk masa final); nol referensi `correctsPayrollId` di luar
`correctPaidPayroll` sendiri. Slip asal tetap `paid` selamanya (by
design HR-BR-005), slip koreksi juga `paid` nominal penuh. Skenario:
slip Des paid gross Rp10jt, PPh21 Rp400rb; koreksi terbit Des juga.
Hitung ulang final Desember: `grossYear` dan `priorWithheld` memuat
Rp20jt/Rp800rb untuk pekerjaan Rp10jt → PKP tahunan kelebihan
Rp10jt, karyawan kurang/lebih potong di masa final, tak pernah
rekonsiliasi. BPJS se-masa: basis kumulatif dobel → slip berikutnya
under-deduct.

### R8-SDM-03 — MEDIUM, PLAUSIBLE — TOCTOU baris komponen draft vs klaim approve/paid
**Status: SELESAI 2026-10-31 (CONFIRMED dari kode nyata)** —
`recalcDraftPayrollFromLines` kini menulis lewat klaim atomik
`updateMany` berpredikat `status: "draft"`, dan kelima mutasi baris
(tambah/ubah nominal/hapus/komisi/PKWT) menjalankan mutasi + recalc
dalam SATU transaksi dengan kunci FOR UPDATE + baca ulang status --
pola yang sama dengan jalur komisi yang sudah benar. Varian recalc
menerima client transaksi opsional; agregator statutori tetap
membaca `prisma` global (cacat jendela sama seperti sebelum fix,
tidak diperlebar).
`src/actions/hrm.actions.ts:598-637` (`recalcDraftPayrollFromLines`:
cek `draft` di read lepas, lalu `payroll.update` tanpa syarat
status), `:657-691`, `:699-722`, `:724-740`, `:5915-5942` (semua
mutasi baris non-tx). Lawan banding yang benar: jalur komisi
`:759-802` (lock baris + re-read status dalam tx). Skenario: slip
draft net Rp4,5jt sedang di-approve; request paralel tambah baris
Rp2jt lolos cek basi → baris menempel di slip `approved`, `recalc`
menimpa total. Persetujuan atas angka lama; gerbang bayar hanya cek
plafon/anggaran → Rp2jt tak ter-review terbayar. Urutan terbalik:
baris menempel sesudah jurnal paid → slip ≠ jurnal.

### R8-SDM-04 — MEDIUM, PLAUSIBLE — updatePayroll cek draft basi dalam tx
**Status: SELESAI 2026-10-31 (CONFIRMED dari kode nyata)** — penulis
akhir `updatePayroll` kini `updateMany` berpredikat `status:
"draft"` dalam transaksi yang sama (klaim kalah = tolak), lalu baca
ulang baris untuk respons/log. Pola identik `approvePayroll`.
`src/actions/hrm.actions.ts:2917-2920` (cek), `:3065-3095` (tx hanya
lock baris karyawan + cek irisan rentang;
`tx.payroll.update({ where: { id } })` tanpa `status: "draft"`).
Lawan: klaim atomik `approvePayroll` `:3140-3146`. Skenario:
approver menyetujui slip gross Rp5jt; request edit paralel yang
mulai sebelum klaim menulis base Rp8jt sesudah klaim menang. Status
tetap `approved`, angka tersimpan Rp8jt → dibayar Rp8jt tanpa pernah
disetujui.

### R8-SDM-05 — MEDIUM, CONFIRMED — Tidak ada prorate gaji pokok
**Status: DITANGGUHI — butuh vonis bisnis** — terverifikasi: tidak
ada logika prorate; slip memakai `baseSalary` master penuh.
Keputusan menunda BUKAN kelalaian: denominator prorate (hari
kalender vs hari kerja vs /30 statutori) dan interaksi dengan basis
BPJS/PPh21/TER adalah keputusan kebijakan upah yang tidak boleh
diciptakan dari kode. Perlu vonis tertulis: (a) prorate join/resign
ya/tidak; (b) kenaikan gaji tengah periode: slip dibelah atau nilai
baru sebulan penuh; (c) slip mingguan berbeda rumus ya/tidak. Tanpa
itu, perilaku kini (sebulan penuh) minimal konsisten di semua slip.
Nol logika prorate di jalur payroll (grep `prorat*`: hanya laporan
target penjualan). `src/lib/services/salary-adjustment.service.ts:22-58`
menetapkan `baseSalary` master penuh; pemanggil `hrm.actions.ts:2356,2712`
menerapkannya sebelum slip dibangun, slip memakai pokok penuh tanpa
faktor hari. Skenario: masuk 16 Nov, pokok Rp6.000.000 → slip Nov
membayar Rp6.000.000 untuk setengah bulan (kelebihan ≈ Rp3.000.000).
Kenaikan Rp5jt→Rp6jt efektif 20 Nov → Nov dibayar penuh Rp6jt,
kelebihan ≈ Rp367rb. Bila kebijakan kontrak memang full-month, ini
by-design — tapi tak ada aturan tertulis di kode.

### R8-SDM-06 — MEDIUM, CONFIRMED — Basis lembur dari gaji berjalan, tanpa lantai 75%
**Status: DITANGGUHI — butuh histori gaji bertanggal + vonis** —
skenario A (basis lembur tanggal Lampau) butuh gaji yang berlaku
PADA tanggal lembur; repo hanya menyimpan master berjalan +
`SalaryAdjustment` terjadwal, bukan snapshot as-of per tanggal,
jadi implementasi sekarang akan tetap menebak untuk lembur yang
mendahului kenaikan pertama. Skenario B (lantai 75% PP 36/2021)
butuh klasifikasi tunjangan tetap/tidak-tetap per komponen pada
tanggal lembur -- data master existing tidak menyimpannya secara
historis. Keduanya perlu keputusan desain data dulu, bukan patch.
`src/lib/services/overtime-approval.service.ts:48-51,58-62` (basis =
`Employee.baseSalary` berjalan + tunjangan tetap; tanpa lantai 75%
upah total PP 36/2021 Pasal 27). Skenario A (repricing): lembur
10 Sep saat pokok Rp4jt; pokok naik Rp5jt efektif 1 Okt; approval
5 Okt → 3 jam hari kerja (5,5 × 1/173) dibayar Rp158.960 bukan
Rp127.168 — kelebihan Rp31.792/kejadian. Skenario B (underpay):
upah total Rp10jt (pokok 4jt + tetap 1jt + tidak tetap 5jt); porsi
tetap 50% < 75% → basis statutori Rp7,5jt (Rp43.353/jam), kode
memakai Rp5jt (Rp28.902/jam) → 3 jam hari kerja kurang bayar
≈ Rp79.480.

## Bersih (jangan audit ulang)
- `markPayrollPaid` (`hrm.actions.ts:3158-3301`): klaim atomik
  approved→paid, `assertPeriodOpen`, plafon Pasal 65 + budget guard
  BR-LOAN-03 dievaluasi ulang atas angka tersimpan, amortisasi
  pinjaman + jurnal satu tx — gagal jurnal = rollback total.
- Potongan pinjaman: cap per-frekuensi `min(installment, remaining)`,
  alokasi tertua-dulu toleransi lunas Rp1, net difloor 0
  (`payroll-weekly.ts`, `employee-loan-repayment.ts`).
- Aktivasi pinjaman: hanya sesudah klaim atomik `pending -> active`,
  jurnal disbursement idempoten per referensi; repayment tunai &
  write-off: row lock, status/sisa dibaca ulang dalam tx, overpay
  > Rp1 ditolak.
- BPJS/PPh21: plafon kumulatif se-masa sekali, campuran slip legacy
  tanpa penanda agregat ditolak berisik, TER + hitung ulang final
  Desember/resign, ruleset fallback ditolak di build/approve/pay.
- Scope: `getHrScope` fail-closed, `assertHrEmployeeAccess` di semua
  getter/mutasi payroll-pinjaman-cuti-absensi; loader slip
  self-service exact-self, linkage tak ter-resolve → kosong.
- Cuti: create/update terkunci baris karyawan, kuota+overlap satu
  tx, pending terhitung used. Koreksi absensi: self-only, no
  self-approve, terkunci bila tanggal sudah masuk slip final.
- Lembur create/update: batas PP 35/2021 4 jam/hari + 18 jam/minggu
  ditegakkan dalam tx (`overtime-pay.service.ts:96-139`); approval
  klaim atomik; baris komisi: lock slip+payable, saldo dicap
  sen-persis, unik DB.
- Perbaikan Round 5 terverifikasi masih ada: kaki debit jurnal
  payroll negatif kini throw (`accounting.hook.ts:3414-3423`),
  akrual penutup PKWT negatif ditolak
  (`pkwt-compensation.service.ts:294-301`); `pkwtEventId` unik DB
  (`schema.prisma:4335`) menutup race double-attach.
- Penyesuaian gaji: approver scope-`all` saja, maker-checker, klaim
  atomik `menunggu`.
