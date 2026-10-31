# Round 8 — Rantai Jual-Beli (temuan agen audit, read-only)

Hasil audit agen rantai jual-beli sesi 4 (2026-10-31). Status
CONFIRMED/PLAUSIBLE seperti dilaporkan agen; triase main session dari
kode nyata menentukan vonis akhir sebelum fix.

## Temuan

### R8-JB-01 — HIGH, CONFIRMED — Alokasi kredit abaikan returnCredit
**Status: SELESAI 2026-10-31** — fix yang sama dengan R8-KEU-02 di
`ROUND8-KEUANGAN.md` (loader kanonis dalam tx alokasi).
`customer-credit.service.ts:97-101` `owing = grandTotal − paidAmount`
(bandingkan `createSalesPayment` sales.actions ±2090 yang neto
returnCredit). Faktur Rp100jt lunas-by-retur bisa dialokasi kredit
Rp100jt lagi → manfaat ganda; jurnal Dr 210102/Cr Piutang yatim.

### R8-JB-02 — HIGH, CONFIRMED — Alokasi kredit terima faktur draft
**Status: SELESAI 2026-10-31** — gate status `["posted","partial"]` di
`allocateCreditToInvoice` (lihat R8-KEU-02).
Hanya `cancelled` ditolak (`customer-credit.service.ts:87-88`); draft
Rp50jt dialokasi → jurnal piutang mendahului pengakuan; jalur hapus
draft tidak mengembalikan `CustomerCredit.allocatedAmount` → kredit
hangus permanen. Pasangan keuangan inti R8-KEU-02.

### R8-JB-03 — MEDIUM, CONFIRMED — Relief AP: GL penuh vs subledger capped
**Status: SELESAI 2026-10-31** — tanpa migrasi, tanpa model/akun baru.
Keputusan main session (konsisten vonis 155-S: `balanceDue` kanonis
sisi beli): relief retur kini disebar ke SEMUA bill terbuka PO
(`posted`/`partial`, `balanceDue > 0`), tertua dulu, dengan prioritas
bill yang terhubung ke GR/GR-line baris retur bila tautan
`goodsReceiptItemId` ada; bill lunas tidak lagi menelan relief.
GL tetap Dr Hutang penuh (retur memang menggugurkan kewajiban);
kelebihan relief di atas total bill terbuka tidak dibuatkan
VendorCredit — tidak ada model/akun kredit vendor di repo dan akun
klaim supplier `110508` khusus garansi, jadi tidak dipakai.
`accounting.hook.ts:2349-2355` Dr Hutang `totalAmount` penuh vs
`:2470` `reliefSen = min(totalAmount, balanceDue)`; bill sumber
dipilih latest-by-id non-cancelled (`:2449-2462`), bukan bill dari GR
yang diretur → retur tertuju bill salah (cth bill A Rp100jt belum
bayar vs bill B lunas: relief 0, GL turun Rp100jt, aging A tetap
Rp100jt).

### R8-JB-04 — MEDIUM, CONFIRMED — Reversal bayar vendor hapus relief retur
**Status: SELESAI 2026-10-31** — `reverseVendorPayment` dan
`confirmVendorPayment` tidak lagi menghitung ulang `balanceDue` dari
kop (`grandTotal − withholding − paidAmount`); keduanya menggeser
`balanceDue` tersimpan PERSIS sebesar alokasi (reverse: tambah,
confirm: kurang), status dari sisa operasional + toleransi Rp1.
Guard statis 155-S yang mengunci formula kop diperbarui sadar ke
aturan baru. Batas tercatat: laporan aging/AP-summary masih memakai
formula kop per kontrak 155-S (bukan `balanceDue`) — perubahan basis
laporan butuh vonis tersendiri, tidak dicampur ke fix ini.
`purchase.actions.ts:2078-2098` `nextBalance = netPayable − nextPaid`
dari grandTotal, mengabaikan relief; bill Rp100jt lunas → retur
relief Rp40jt → reverse bayar → balanceDue kembali Rp100jt penuh,
vendor bisa ditagih ulang.

### R8-JB-05 — MEDIUM, PLAUSIBLE — DP konversi awal: baris bayar penuh
**Status: SELESAI 2026-10-31** — baris `SalesPayment` konversi awal
kini sebesar porsi teralokasi (`journalSen`), bukan DP penuh;
kelebihan tetap menjadi `CustomerCredit`. Baris Rp0 untuk DP yang
kelebihannya seluruhnya jadi kredit DIPERTAHANKAN sebagai marker
idempotency (notes nomor DP) agar retry tidak membuat kredit ganda.
`down-payment.hook.ts:737-748`); cap hanya di jurnal + `paidAmount`
tertulis; `recalcCore` (`sales-payment.hook.ts:50-53,86-94`)
menjumlah baris payment TANPA cap grandTotal → pemicu recalc
kemudian menulis `paidAmount` Rp140jt > grandTotal Rp100jt, sisa
negatif, pembayaran sah ditolak. Jalur DP lanjutan sudah benar
(AUD-R3-04).

### R8-JB-06 — MEDIUM, CONFIRMED — Edit faktur lompat status + komisi hilang
**Status: SELESAI 2026-10-31** — varian yang terbukti dari kode nyata:
faktur konversi DP lahir draft dengan `paidAmount` terisi dan
snapshot komisi beku, tetapi `recalcCore` melewati draft dan akrual
komisi hanya lahir di sana saat status paid. Fix: `postInvoice`
memanggil `onSalesPaymentUpdated(invoiceId, tx)` sesudah
`onSalesInvoicePosted` dalam transaksi yang sama — recalc kanonis
menurunkan status bayar dari baris payment nyata dan mengakrual
komisi atas snapshot yang sudah dibekukan. Faktur biasa tanpa
pembayaran: recalc no-op (tetap posted).
`updateSalesInvoice` bisa memindahkan status ke paid tanpa jalur
pembayaran + snapshot komisi dibekukan tapi akrual komisi TIDAK
dipanggil (`sales.actions.ts:3381-3402`; accrue hanya di recalcCore/
jalur DP) → faktur konversi DP yang diedit lalu diposting: snapshot
ada, baris CommissionPayable tak pernah lahir, komisi hilang senyap.

### R8-JB-07 — MEDIUM, CONFIRMED — Persen diskon/pajak baris bill tak terbatas
**Status: SELESAI 2026-10-31** — persen di-clamp ke [0,100] di SATU
sumber hitung `computeBillLineAmounts` (pola `tax-invoice.ts`
creditablePercent), bukan ditolak: form lama yang menyimpan persen
wajar tak berubah; satu fix menutup create/update/confirm karena
semua lewat fungsi yang sama. Clamp dipilih atas penolakan —
inkonsistensi kop hasil clamp menjadi cakupan R8-JB-08, tidak
dicampur ke sini.
`purchase.schemas.ts` field `discountPercent`/`taxPercent` tanpa
`.min/.max`; `computeBillLineAmounts` tanpa clamp → diskon 150%
menghasilkan subtotal baris negatif; reachable penuh untuk bill
tanpa PO/kop manual (`createVendorBill:1580-1585`, confirm `:1918`).

### R8-JB-08 — LOW, CONFIRMED — Bill manual tanpa baris: kop dipercaya penuh
Kop form dipercaya penuh di create DAN confirm
(`purchase.actions.ts:1580-1585,1918-1923`); tanpa verifikasi
`grandTotal = subtotal − discount + tax` → jurnal AP dari angka
ketik bebas. By-design "kop manual" (komentar `:1342`) tapi tanpa
rekonsiliasi internal.

### R8-JB-09 — LOW, PLAUSIBLE — Due date tak diturunkan dari termin
Due date tak pernah diturunkan dari payment terms (sales `dueDate`
input bebas; vendor `terms` divalidasi format tapi dueDate tak
dihitung) → aging bisa 30 hari lebih awal. Tak ada helper
`computeDueDate` di repo; kesenjangan konsistensi, bukan regresi.

### R8-JB-10 — LOW, CONFIRMED — Komentar basi confirmVendorBill
**Status: SELESAI 2026-10-31** — komentar diperbaiki: GL posting
(`onVendorBillPosted`) jalan DI DALAM transaksi yang sama dengan
flip status, bukan sesudah commit.
Komentar `confirmVendorBill` (`purchase.actions.ts:1874-1876`)
menyatakan GL posting sesudah commit, padahal hook jalan DI DALAM
tx (`:1968-1969`); perilaku benar, komentar berisiko menyesatkan.

## Bersih (jangan audit ulang)
DP buat/konfirmasi caps + idempoten, pembayaran sales lock +
toleransi Rp1 + reversal beralasan, cap faktur vs SO & delivery
claim atomik, retur jual cap dalam tx + SoD, komisi basis DPP +
reversal ≤ akrual, credit gate, vendor bill/payment 3-way +
anti-overpay, void jurnal lawan, `resyncOnEdit` draft-only, harga
multi-sumber.
