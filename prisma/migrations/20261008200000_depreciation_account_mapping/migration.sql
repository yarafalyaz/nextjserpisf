-- Global depreciation account mappings on system_settings.
--
-- The depreciation cron and asset GL posting previously read these accounts
-- from process.env (DEPRECIATION_EXPENSE_ACCOUNT_ID /
-- ACCUMULATED_DEPRECIATION_ACCOUNT_ID), which meant a production deployment
-- that never set those env vars could not post depreciation at all — the cron
-- hard-failed with HTTP 500. They are now configurable via the UI
-- (Pengaturan → Mapping Akun) like every other GL mapping, and the env vars are
-- kept only as a last-resort fallback.
ALTER TABLE `system_settings`
  ADD COLUMN `depreciation_expense_account_id` INT NULL,
  ADD COLUMN `accumulated_depreciation_account_id` INT NULL;
