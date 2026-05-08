-- Step 5: Ledger invariants + audit enforcement model support

CREATE TYPE "LedgerSourceEntityType" AS ENUM ('MATCH','DISPUTE','MANUAL_ADJUSTMENT','CONTRIBUTION_OFFER','RECIPIENT_REQUEST');

ALTER TABLE ledger_transactions DISABLE TRIGGER trg_prevent_posted_ledger_transaction_update;

ALTER TABLE ledger_transactions
  ADD COLUMN correlation_id text,
  ADD COLUMN source_entity_type "LedgerSourceEntityType",
  ADD COLUMN source_entity_id text,
  ADD COLUMN idempotency_key text,
  ADD COLUMN reversal_of_transaction_id text;

UPDATE ledger_transactions
SET
  correlation_id = COALESCE(correlation_id, CONCAT('legacy-corr-', id)),
  source_entity_type = COALESCE(source_entity_type, 'MANUAL_ADJUSTMENT'::"LedgerSourceEntityType"),
  source_entity_id = COALESCE(source_entity_id, CONCAT('legacy-source-', id)),
  idempotency_key = COALESCE(idempotency_key, CONCAT('legacy-idem-', id));

ALTER TABLE ledger_transactions
  ALTER COLUMN correlation_id SET NOT NULL,
  ALTER COLUMN source_entity_type SET NOT NULL,
  ALTER COLUMN source_entity_id SET NOT NULL,
  ALTER COLUMN idempotency_key SET NOT NULL;

ALTER TABLE ledger_transactions
  ADD CONSTRAINT ledger_transactions_idempotency_key_unique UNIQUE (idempotency_key),
  ADD CONSTRAINT ledger_transactions_reversal_of_transaction_id_unique UNIQUE (reversal_of_transaction_id),
  ADD CONSTRAINT ledger_transactions_reversal_of_fk
    FOREIGN KEY (reversal_of_transaction_id) REFERENCES ledger_transactions(id) ON DELETE SET NULL;

CREATE INDEX ledger_transactions_correlation_id_idx ON ledger_transactions(correlation_id);
CREATE INDEX ledger_transactions_source_entity_idx ON ledger_transactions(source_entity_type, source_entity_id);

ALTER TABLE ledger_transactions ENABLE TRIGGER trg_prevent_posted_ledger_transaction_update;
