# API CONTRACTS --- ERP ISF

**Status:** Kontrak baseline konseptual. Route, DTO, auth, dan naming
harus mengikuti repository aktual.

## 1. Aturan kontrak

-   API adalah kontrak antar frontend/domain, bukan cermin langsung
    struktur tabel.
-   Semua input divalidasi di server.
-   Permission diperiksa pada setiap operasi terlindungi.
-   Mutasi kritis memakai operasi eksplisit: create/update draft,
    approve, post, cancel/reverse.
-   Jangan izinkan client mengirim saldo akhir sebagai sumber kebenaran.
-   Format error konsisten dan tidak membocorkan stack trace.
-   Pagination/filter/sort harus memiliki schema yang terdokumentasi.
-   Perubahan breaking harus dikoordinasikan dan diuji.
-   Idempotency key atau mekanisme deduplication diperlukan untuk
    posting sensitif.

## 2. Pola endpoint konseptual

Contoh berikut adalah pola, bukan route final: - `GET /items` ---
list/filter/pagination. - `POST /items` --- create master item. -
`GET /inventory/balances` --- saldo berdasarkan filter. -
`GET /inventory/ledger` --- histori movement. -
`POST /inventory/receipts` --- membuat draft receipt. -
`POST /inventory/receipts/{id}/post` --- posting receipt. -
`POST /inventory/adjustments` --- membuat draft adjustment. -
`POST /inventory/adjustments/{id}/approve` --- approval. -
`POST /inventory/adjustments/{id}/post` --- posting adjustment. -
`POST /purchase-orders` --- create PO draft. -
`POST /supplier-bills/{id}/post` --- posting tagihan. -
`POST /supplier-payments/{id}/post` --- posting pembayaran. -
`POST /quotations` --- create quotation. -
`POST /customer-payments/{id}/post` --- posting pembayaran/DP. -
`POST /invoices/{id}/post` --- posting invoice. -
`POST /work-orders/{id}/material-issues` --- membuat issue material
draft/command sesuai kontrak. Route aktual wajib diselaraskan dengan
pola yang sudah ada.

## 3. Response dan error

Tetapkan satu envelope konsisten jika sesuai standar proyek. Error
setidaknya menyampaikan: - kode error stabil; - pesan yang dapat
dipahami; - field errors bila validasi gagal; - request/correlation ID
bila tersedia. Jangan mengirim SQL, stack trace, token, atau secret ke
client.

## 4. Pagination

Kontrak list harus mendefinisikan: - parameter page/limit atau cursor; -
default dan maksimum limit; - sort fields yang diizinkan; - filter yang
didukung; - bentuk metadata total/next cursor; - perilaku ketika filter
tidak valid.

## 5. Posting dan idempotency

Untuk setiap operasi posting: - validasi status saat ini; - validasi
permission; - validasi saldo dan business rules; - cegah
double-submit/retry; - commit perubahan atomik; - kembalikan identitas
transaksi hasil posting; - jika sudah posted, kembalikan hasil yang aman
atau error stabil tanpa efek ganda. Strategi idempotency dan HTTP status
final harus mengikuti konvensi repository.

## 6. Kontrak lintas domain

-   Purchasing → Inventory: receipt/return movement.
-   Sales → Inventory: invoice stock issue/return.
-   Projects/Work Orders → Inventory: material issue/return.
-   Purchasing/Sales → Finance: bill/invoice/payable/receivable.
-   Payments → AP/AR: allocation dan outstanding update.
-   Work Orders/Timesheet → Project costing/Payroll sesuai policy.
-   Semua domain → Audit: aksi bisnis penting.

## 7. Perubahan kontrak

PR yang mengubah DTO, endpoint, event, atau semantik status harus
menyertakan: - alasan dan requirement ID; - consumer yang terdampak; -
contoh request/response; - test perubahan; - strategi
kompatibilitas/migrasi jika diperlukan.
