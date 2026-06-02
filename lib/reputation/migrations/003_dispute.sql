-- 003_dispute.sql: Add disputed columns to outcome_rows

ALTER TABLE outcome_rows ADD COLUMN IF NOT EXISTS disputed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE outcome_rows ADD COLUMN IF NOT EXISTS disputed_reason TEXT;
