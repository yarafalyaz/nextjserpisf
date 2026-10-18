# Laporan Eksekusi Hermes — Audit & Hardening ERP Ironsmith Fabrication

**Repo:** `github.com/yarafalyaz/nextjserpisf` · **Branch kerja:** `hermes/ironsmith-audit` (HEAD `main` = `9176b4f4`) · **Bahasa UI/dok:** Indonesia

## A. Baseline

| Item | Hasil |
|---|---|
| Commit HEAD | `9176b4f4` (feat hpp proyek) |
| Branch | `hermes/ironsmith-audit` (baru, dari `main`) |
| Worktree | bersih kecuali `reports/` untracked |
| `npx tsc --noEmit` | 0 error |
| `npm run lint` | bersih |
| Migrasi terakhir | `20261019000100_vendor_bill_project` |
| CI | `.github/workflows/ci.yml`: lint → unit → e2e-setup (MariaDB 10.11) → E2E 4 shard; `TZ=Asia/Jakarta` |
| DB integrasi lokal | kontainer `silengkap-e2e-db` (MariaDB 10.11, `yara_erp`, port 3310) |

## B. Register temuan

| ID | Severity | File/baris | Status | Akar masalah | Perbaikan | Tes regresi |
|---|---|---|---|---|---|---|
| P0-1a | P0 | `sales.actions.ts:710,719,722` | FIXED (`033e2a25`) | create buat DP `draft` lalu panggil received+confirmed dalam tx yang sama — tak ada tahap verifikasi terpisah | create catat draft saja; confirm = received+confirmed atomik via tombol existing | `down-payment-threshold` 4/4 (terfalsifikasi) |
| P0-1b | P0 | `down-payment.hook.ts:448-449,489` | FIXED (`033e2a25`) | DP pertama langsung buat invoice `posted` + panggil `onSalesInvoicePosted` (revenue/COGS/stock-out) dalam tx yang sama | Invoice hanya bila CONFIRMED ≥50% (sen-integer), lahir DRAFT; posting manual | `down-payment-threshold` + `down-payment-multi` 9/9 |
| P0-1c | P0 | `sales.actions.ts:690-697` + grep `0.5/50%/threshold` nihil | FIXED (`033e2a25`) | Satu-satunya cap kumulatif = 100% grandTotal; ambang 50% tak ada di `src` | Ambang `ceil(grandTotal/2)` sen; draft/cancelled tak dihitung | `down-payment-threshold` (draft tak dihitung) |
| P0-2a | P0 | `purchase.actions.ts:1003,1024` | FIXED (`987e3a72`) | `createVendorBill` simpan `draft` lalu panggil `onVendorBillPosted` dalam tx sama | Draft murni; confirm satu-satunya titik pengakuan | purchase +1 (create tanpa jurnal) |
| P0-2b | P0 | `aging-reports-data.ts:117-118,153-154`, `document-status.ts:10-11` | FIXED (`987e3a72`) | Laporan AP filter posted/partial/paid sementara GL akui draft → selisih AP vs GL | Draft tanpa jurnal → filter laporan kini benar | purchase +1 |
| P0-2c | P0 | `purchase.actions.ts:1178` vs `:1331-1332` | FIXED (`987e3a72`) | `balanceDue=grandTotal-withholding` saat confirm, tapi update bayar pakai `grandTotal-nextPaid` → sisa palsu, tak pernah lunas sekali bayar | Sisa & batas alokasi = NETO − terbayar | purchase +1 (balanceDue 900rb) + `payables-withholding` 4/4 (terfalsifikasi) |
| P0-2d | P0 | `aging-reports-data.ts:101,126`, `payables-summary.ts:71` | FIXED (`987e3a72`) | Laporan pakai grandTotal-paidAmount, abaikan withholding | Aging/summary/ringkasan pakai neto | `payables-withholding` 4/4 |
| P0-3 | P0 | `inventory.actions.ts:182-274`, `approval-workflow.service.ts:68-80`, `stock-adjustment.hook.ts:224-231` | FIXED (`502fc723`) | Adjustment tanpa approval eksplisit; `assertApproved` lolos bila tanpa record; hook isi approvedBy = pemroses | create request + process assert (pola Expense/Asset); hook tanpa self-approve | inventory +2, baseline selaras (terfalsifikasi) |
| P0-4 | P0 | `Dockerfile:59` | FIXED (`68fbeea9`) | `CMD npx prisma db push && node server.js` — tiap boot prod ubah skema; CI sudah `migrate deploy` | CMD hanya `node server.js`; layanan `migrate` sekali-jalan + image pin `${IMAGE_TAG}`; tag build tanggal-SHA | `deployment-safety` 3/3 (terfalsifikasi) |
| P1-1 | P1 | `sales-return.hook.ts:121-169`, `stock-adjustment.hook.ts:172-200` | FIXED (`44e21889`) | Retur jual: `SalesReturnItem` tanpa kolom serial/batch; layer FIFO tanpa `batchNumber`; serial diambil dari `used` terbaru bukan fisik kembali. Adjustment IN batch-tracked tanpa identitas lot (`itemBatch`/`batchNumber` 0 rujukan). Transfer sudah OK | Kolom identitas + wajib tracked; hook revive serial disebut saja; layer+lot batch eksplisit; form kolom Serial/Batch | retur 7, adjustment +2 (terfalsifikasi), drift 0 |
| P1-2 | P1 | `manufacturing.actions.ts` `completeProductionOrder` vs `:1251` | FIXED (`bc7fa5a1`) | `completeWorkOrder` panggil gate QC; `completeProductionOrder` nol rujukan QC — release FG tanpa cek inspeksi/NCR | Gate PO sendiri + WO induk (dalam tx); opt-in sama | qc +3, manufacturing +2 (terfalsifikasi) |
| P1-3 | P1 | `manufacturing.actions.ts:1077-1096`, `schema.prisma:1996` | FIXED (`3730b481`) | Genealogi satu record final: `outputQty=orderQty` + serial final + `outputBatch=documentNo` + biaya slice final (urutan 4 lalu 6: qty 10, serial 6 terakhir, biaya slice 6). Costing per-release sudah proporsional | Kolom `released_cost` + agregat serial/batch/biaya semua release | manufacturing +1 (terfalsifikasi), drift 0 |
| P1-4 | P1 | `schema.prisma:1788-1814`, `manufacturing.actions.ts:666-805` | FIXED (`df1402f2`) | Intra-jalur aman (atomic claim, idempoten, `completeWorkOrder` tak konsumsi ulang). Celah antar-jalur: `MaterialIssue` tanpa `productionOrderId`; material bisa keluar via MI (WO) dan `issueMaterial` (PO tertaut) tanpa guard silang | Guard dua arah: PO tolak bila MI jalan; MI tolak bila PO sudah konsumsi (klaim ke draft) | manufacturing +2, inventory +1 (terfalsifikasi) |
| P1-5 | P1 | `inventaris/opname/*`, `stock-reconciliation.ts`, `schema.prisma` | FIXED (`72d6f328`) | Opname single-pass → satu draft adjustment; tanpa sesi/snapshot/recount/freeze. Model Stocktake/Remnant/Offcut/Scrap nol | Sesi bertahap (snapshot→recount→approve independen→posting live-basis) + remnant/scrap + 2 halaman | finalize 5 + sesi 3 + remnant 3 (terfalsifikasi), drift 0 |
| P1-6 | P1 | `payroll-statutory.service.ts:1-42`, `schema.prisma:2373-2418` | FIXED (`516df6e7`) | Tarif 2024 hardcoded, tanggungan 0; tanpa ruleset `effectiveFrom`; `Payroll` tanpa snapshot; `Employee` tanpa jumlah tanggungan. Angka 2026 butuh konfirmasi akuntan | Ruleset berperiode + snapshot slip + dependents; single/bulk satu mesin; halaman aturan; angka 2026 NEEDS CONFIRMATION | rules 7 + hrm +1 + aksi 5 (terfalsifikasi), drift 0 |
| P1-7 | P1 | `sales-invoice-posting.service.ts:90`, `accounting.hook.ts` `deleteJournalByReferenceTx` | FIXED (`90311278`) | Period lock + reverseJournal umum OK. Void/edit faktur HAPUS `stockMove`/baris jurnal (bukan reversal); serial tak dipulihkan; TOCTOU close-vs-posting | Move → `reversed`; jurnal → reversal entry idempoten + lock periode asal; serial pulih; re-post lewati REVERSED | posting.service 6 + journal-reversal 3 (terfalsifikasi) |
| P1-8 | P1 | `idempotency.ts:57-68` | FIXED (`276916de`) | Reclaim key expired via findUnique+update — dua request bersamaan sama-sama lolos | `updateMany` bersyarat atomik; kalah → duplikat | idempotency +1 race (terfalsifikasi) |
| P2-1 | P2 | `e2e/purchase-crud.spec.ts` | FIXED (`bb51d5ca`) | Tanpa rantai PO→GR→bill→payment dengan asersi jurnal/stok DB | `purchase-chain.spec.ts`: tombol sungguhan + movement IN, layer FIFO, jurnal seimbang, alokasi, bill paid sisa 0 | E2E 2 passed DB nyata |
| P2-2 | P2 | `e2e/sales-flow.spec.ts`, `penjualan-posting-faktur.spec.ts` | FIXED (`0456c2e2`) | Posting hanya asersi status UI; tanpa asersi jurnal/stok DB; tanpa rantai DP→invoice→payment→return | `sales-chain.spec.ts`: posting + bayar lunas + retur sebagian; jurnal AR+COGS seimbang, movement OUT, paid, stok 10→8→9 | E2E 2 passed DB nyata |
| P2-3 | P2 | sampel actions/api | NOT REPRODUCED (sampel) | `requirePermission` per aksi; upload auth+CSRF; cron fail-closed. Sweep penuh belum | — | — |
| P2-4 | P2 | `storage.ts`, `docker-compose.prod.yml` | FIXED (`eddb1cde`) | Tanpa magic-byte (MIME client saja); `db` publish 3309 + password default di repo | assertMagicBytes sebelum tulis; port DB internal; password wajib `:?` | storage +2, deploy-guard +2 (terfalsifikasi) |
| P2-5 | P2 | `README.md:21` vs `package.json:5-6` vs `Dockerfile:2` | FIXED (`c59e8229`) | Node 20+ vs engines ^26 vs node:26 mismatch. `db push` npm script tersisa tapi tak di startup | README → 26+; script db:push dihapus | deploy-guard +2 |
| R-2 | Risiko | `crm.actions.ts` `updateTicket` + `schema-usage.test.ts` SEED_ONLY_COLUMNS | FIXED (`43880238`, branch kerja) | `CrmTicket.firstResponseAt/resolvedAt` hanya diisi skrip seed `seed-hrm-crm-e2e.ts` — alur produk tak pernah menulisnya, sehingga SLA tiket di DB nyata selalu NULL | `updateTicket` isi otomatis di server: keluar dari `open` → `firstResponseAt`, masuk `resolved/closed` → `resolvedAt` (sekali, tak dioverwrite); komentar tak menyentuh | `crm.actions.test.ts` +2 (terfalsifikasi: cabut blok → 1 MERAH, pulihkan → 24/24 HIJAU) |
| R-3 | Risiko | `vendor-price.actions.ts` `parseNumber` + form `minQty` `inputMode="decimal"` | FIXED (`37a32c9e`, branch kerja) | Parser lokal hanya ganti koma→titik: `Number("1.000")` = 1 tanpa error — minQty 1000 tersimpan sebagai 1, keunikan (vendor,item,minQty) rusak diam-diam | Normalisasi id-ID selaras `parseMoneyAmount` (titik ribuan, koma desimal) | `vendor-price.actions.test.ts` 4/4 baru (terfalsifikasi: cabut normalisasi → 2 MERAH, pulihkan → HIJAU) |
| R-4 | Risiko | `parse-money.ts` `parseLocaleNumber` + `vendor-price.actions.ts` `parseNumber` | FIXED (`53a0567f`, branch kerja) | Salinan normalisasi id-ID lokal (warisan R-3) — salinan ganda menyimpang seiring waktu | `parseLocaleNumber(raw, fallback)` di `parse-money.ts`; `parseMoneyAmount` delegasi; `parseNumber` lokal jadi delegasi satu baris | `parse-money` +2 (terfalsifikasi: fallback→null memerahkan 1 tes, pulihkan → 14/14 HIJAU) |
| R-5 | Risiko | `vendor-price-form.tsx` `inputMode="decimal"` | FIXED (`d9de19dc`, branch kerja) | Input Minimal Jml mentah: "1.000" tampil tanpa pemisah; nilai mentah sampai ke server (hanya selamat karena R-3/R-4). Terakhir dari `grep inputMode="decimal"` di `src` — kini nol | `CurrencyInput` + hidden input angka polos; parse server tak berubah | vendor-price 4/4 + parse-money 10/10 + form-field-wiring 2/2; E2E `operational-crud` fill `#minQty` pola sama dengan `#price` |
| R-1 | Risiko | `accounting.hook.ts` 11 hook + `expense.hook.ts` + `inventory-transfer.hook.ts` + `purchase-return.hook.ts` | FIXED (`25cfff10`) | Rekomendasi audit rekonsiliasi §6: skip idempotensi diam — pemanggil tak bedakan "sudah diproses" vs "baru diproses" di log produksi | 26 cabang catat console.info (dokumen + nomor jurnal); guard `idempotency-logging` 3/3 berarah dua | guard 3/3 + hook terkait 76/76 (terfalsifikasi) |

## C. Perubahan berkas

| Commit | Berkas | Tujuan |
|---|---|---|
| `68fbeea9` | `Dockerfile` | CMD tanpa `db push` |
| `68fbeea9` | `docker-compose.prod.yml` | layanan `migrate` + pin `${IMAGE_TAG}` |
| `68fbeea9` | `scripts/build-amd64.sh` | tag immutable tanggal-SHA |
| `68fbeea9` | `src/__tests__/deployment-safety.test.ts` | penjaga (baru, terfalsifikasi) |
| `033e2a25` | `src/actions/sales.actions.ts` | create draft saja; confirm 2-tahap atomik |
| `033e2a25` | `src/lib/hooks/down-payment.hook.ts` | ambang 50% + invoice draft + paymentDate aktual |
| `033e2a25` | `src/lib/hooks/__tests__/down-payment-threshold.test.ts` | 4 tes ambang (baru, terfalsifikasi) |
| `033e2a25` | `src/lib/hooks/__tests__/down-payment-multi.test.ts` | selaras perilaku baru |
| `987e3a72` | `src/actions/purchase.actions.ts` | draft murni; sisa & batas alokasi neto |
| `987e3a72` | `src/lib/reports/aging-reports-data.ts` + `payables-summary.ts` + `ar-ap-summary-data.ts` | sisa neto di 3 laporan |
| `987e3a72` | `src/actions/__tests__/purchase.actions.test.ts` | +2 tes (tanpa jurnal; balanceDue neto) |
| `987e3a72` | `src/lib/reports/__tests__/payables-withholding.test.ts` | 4 tes skenario dokumen (baru, terfalsifikasi) |
| `502fc723` | `src/actions/inventory.actions.ts` | request saat create + assert saat process |
| `502fc723` | `src/lib/hooks/stock-adjustment.hook.ts` | tanpa self-approve |
| `502fc723` | `src/actions/__tests__/inventory.actions.test.ts` + `src/lib/hooks/__tests__/stock-adjustment-baseline.test.ts` | +2 tes & selaras (terfalsifikasi) |
| `bc7fa5a1` | `src/lib/services/qc.service.ts` | gate generik + PO |
| `bc7fa5a1` | `src/actions/manufacturing.actions.ts` | gate di completeProductionOrder |
| `bc7fa5a1` | `src/lib/services/__tests__/qc.service.test.ts` + `src/actions/__tests__/manufacturing.actions.test.ts` | +5 tes (terfalsifikasi) |
| `3730b481` | `prisma/schema.prisma` + `prisma/migrations/20261019000200_*` | kolom `released_cost` |
| `3730b481` | `src/actions/manufacturing.actions.ts` | akumulasi + agregat genealogi |
| `3730b481` | `src/actions/__tests__/manufacturing.actions.test.ts` | +1 agregat (terfalsifikasi) |
| `276916de` | `src/lib/utils/idempotency.ts` + `__tests__/idempotency.test.ts` | reclaim atomik + tes race |
| `df1402f2` | `src/actions/manufacturing.actions.ts` + `inventory.actions.ts` | guard silang dua arah |
| `df1402f2` | `src/actions/__tests__/manufacturing.actions.test.ts` + `inventory.actions.test.ts` | +3 tes (terfalsifikasi) |
| `44e21889` | `prisma/schema.prisma` + `prisma/migrations/20261019000300_*` + `20261019000400_*` | kolom identitas retur+adjustment |
| `44e21889` | `src/actions/sales.actions.ts` + `sales-return.hook.ts` + `stock-adjustment.hook.ts` + form + halaman ubah | identitas eksplisit |
| `44e21889` | `sales-return-uom.test.ts` + `stock-adjustment-baseline.test.ts` | 9 tes (terfalsifikasi) |
| `90311278` | `src/lib/hooks/accounting.hook.ts` | `reverseJournalsByReferenceTx` + idempoten aktif |
| `90311278` | `src/lib/services/sales-invoice-posting.service.ts` | move reversed + serial pulih |
| `90311278` | `sales-invoice-posting.service.test.ts` + `journal-reversal.test.ts` | 9 tes (terfalsifikasi) |
| `516df6e7` | `prisma/schema.prisma` + `prisma/migrations/20261019000500_*` | ruleset + snapshot + dependents |
| `516df6e7` | `payroll-statutory.service.ts` + `hrm.actions.ts` + `master.actions.ts` + skema + form + halaman aturan + nav | mesin berperiode |
| `516df6e7` | `payroll-statutory-rules.test.ts` + `hrm.actions.test.ts` + `hrm-statutory-rules.test.ts` | 13 tes (terfalsifikasi) |
| `72d6f328` | `prisma/schema.prisma` + `prisma/migrations/20261019000600_*` + `20261019000700_*` | sesi opname + remnant |
| `72d6f328` | `stocktake-finalize.ts` + `inventory.actions.ts` + halaman sesi/sisa + nav + slug | alur bertahap |
| `72d6f328` | `stocktake-finalize.test.ts` + `inventory.actions.test.ts` | 11 tes (terfalsifikasi) |
| `eddb1cde` | `storage.ts` + `docker-compose.prod.yml` | magic-byte + compose |
| `eddb1cde` | `storage.test.ts` + `deployment-safety.test.ts` | 4 tes (terfalsifikasi) |
| `c59e8229` | `README.md` + `package.json` + `deployment-safety.test.ts` | Node konsisten + tanpa db:push |
| `bb51d5ca` | `e2e/purchase-chain.spec.ts` + seed blok 12 + tambah GR | rantai beli E2E (2 passed DB nyata) |
| `0456c2e2` | `e2e/sales-chain.spec.ts` + seed akun retur E2E-4100 | rantai jual E2E (2 passed DB nyata) |
| (uncommitted) | `docs/HERMES-EXECUTION-REPORT.md` | laporan ini |

## D. Migrasi/perbaikan data

(belum ada)

## E. Laporan tes

- Baseline unit: _berjalan setelah verifikasi_ (`PASS`/`FAIL`/`NOT RUN` jujur).

## F. Risiko tersisa

- Semua P0 belum terverifikasi → belum ada klaim.

## G. Aksi berikutnya

1. Terima hasil 3 verifikator → isi register.
2. P0-1 → P0-4 sesuai urutan dokumen.
