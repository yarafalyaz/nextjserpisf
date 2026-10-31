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
`accounting.hook.ts:2349-2355` Dr Hutang `totalAmount` penuh vs
`:2470` `reliefSen = min(totalAmount, balanceDue)`; bill sumber
dipilih latest-by-id non-cancelled (`:2449-2462`), bukan bill dari GR
yang diretur → retur tertuju bill salah (cth bill A Rp100jt belum
bayar vs bill B lunas: relief 0, GL turun Rp100jt, aging A tetap
Rp100jt).

### R8-JB-04 — MEDIUM, CONFIRMED — Reversal bayar vendor hapus relief retur
`purchase.actions.ts:2078-2098` `nextBalance = netPayable − nextPaid`
dari grandTotal, mengabaikan relief; bill Rp100jt lunas → retur
relief Rp40jt → reverse bayar → balanceDue kembali Rp100jt penuh,
vendor bisa ditagih ulang.

### R8-JB-05 — MEDIUM, PLAUSIBLE — DP konversi awal: baris bayar penuh
Baris SalesPayment dibuat sebesar `vdp.amount` PENUH per DP
(`down-payment.hook.ts:737-748`); cap hanya di jurnal + `paidAmount`
tertulis; `recalcCore` (`sales-payment.hook.ts:50-53,86-94`)
menjumlah baris payment TANPA cap grandTotal → pemicu recalc
kemudian menulis `paidAmount` Rp140jt > grandTotal Rp100jt, sisa
negatif, pembayaran sah ditolak. Jalur DP lanjutan sudah benar
(AUD-R3-04).

### R8-JB-06 — MEDIUM, CONFIRMED — Edit faktur lompat status + komisi hilang
`updateSalesInvoice` bisa memindahkan status ke paid tanpa jalur
pembayaran + snapshot komisi dibekukan tapi akrual komisi TIDAK
dipanggil (`sales.actions.ts:3381-3402`; accrue hanya di recalcCore/
jalur DP) → faktur konversi DP yang diedit lalu diposting: snapshot
ada, baris CommissionPayable tak pernah lahir, komisi hilang senyap.

### R8-JB-07 — MEDIUM, CONFIRMED — Persen diskon/pajak baris bill tak terbatas
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
