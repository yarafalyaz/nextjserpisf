-- AUD-R8-02: ikat idempotency key ke fingerprint payload operasi.
-- Replay dengan payload berbeda = konflik, bukan sukses palsu.
-- Kolom baru di tabel BARU R5 (bukan tabel produksi lama) — aman.
ALTER TABLE `financial_idempotency_keys`
  ADD COLUMN IF NOT EXISTS `payload_hash` VARCHAR(191) NULL AFTER `scope`;
