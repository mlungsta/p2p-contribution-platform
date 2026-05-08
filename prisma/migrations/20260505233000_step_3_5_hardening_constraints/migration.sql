-- Step 3.5 hardening constraints

-- Monetary positivity checks
ALTER TABLE contribution_offers
  ADD CONSTRAINT contribution_offers_amount_minor_positive CHECK (amount_minor > 0),
  ADD CONSTRAINT contribution_offers_remaining_amount_minor_non_negative CHECK (remaining_amount_minor >= 0),
  ADD CONSTRAINT contribution_offers_remaining_lte_amount CHECK (remaining_amount_minor <= amount_minor);

ALTER TABLE recipient_requests
  ADD CONSTRAINT recipient_requests_amount_minor_positive CHECK (amount_minor > 0),
  ADD CONSTRAINT recipient_requests_remaining_amount_minor_non_negative CHECK (remaining_amount_minor >= 0),
  ADD CONSTRAINT recipient_requests_remaining_lte_amount CHECK (remaining_amount_minor <= amount_minor);

ALTER TABLE matches
  ADD CONSTRAINT matches_amount_minor_positive CHECK (amount_minor > 0);

ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_debit_non_negative CHECK (debit_amount_minor >= 0),
  ADD CONSTRAINT ledger_entries_credit_non_negative CHECK (credit_amount_minor >= 0),
  ADD CONSTRAINT ledger_entries_one_sided_entry CHECK (
    (debit_amount_minor = 0 AND credit_amount_minor > 0)
    OR (credit_amount_minor = 0 AND debit_amount_minor > 0)
  );

-- Active payer uniqueness at DB level
CREATE UNIQUE INDEX matches_one_active_match_per_payer
ON matches (sender_user_id)
WHERE status IN ('CREATED','ASSIGNED','AWAITING_PAYMENT','PROOF_UPLOADED','AWAITING_CONFIRMATION','DISPUTED');

-- Immutable posted ledger transactions and ledger entries
CREATE OR REPLACE FUNCTION prevent_posted_ledger_transaction_update() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'POSTED' THEN
    RAISE EXCEPTION 'Posted ledger transactions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_posted_ledger_transaction_delete() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'POSTED' THEN
    RAISE EXCEPTION 'Posted ledger transactions cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_ledger_entry_update_or_delete_for_posted_transaction() RETURNS trigger AS $$
DECLARE
  tx_status "LedgerTransactionStatus";
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO tx_status FROM ledger_transactions WHERE id = OLD.ledger_transaction_id;
  ELSE
    SELECT status INTO tx_status FROM ledger_transactions WHERE id = NEW.ledger_transaction_id;
  END IF;

  IF tx_status = 'POSTED' THEN
    RAISE EXCEPTION 'Ledger entries for posted transactions are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_posted_ledger_transaction_update ON ledger_transactions;
CREATE TRIGGER trg_prevent_posted_ledger_transaction_update
BEFORE UPDATE ON ledger_transactions
FOR EACH ROW EXECUTE FUNCTION prevent_posted_ledger_transaction_update();

DROP TRIGGER IF EXISTS trg_prevent_posted_ledger_transaction_delete ON ledger_transactions;
CREATE TRIGGER trg_prevent_posted_ledger_transaction_delete
BEFORE DELETE ON ledger_transactions
FOR EACH ROW EXECUTE FUNCTION prevent_posted_ledger_transaction_delete();

DROP TRIGGER IF EXISTS trg_prevent_posted_ledger_entry_update ON ledger_entries;
CREATE TRIGGER trg_prevent_posted_ledger_entry_update
BEFORE UPDATE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_entry_update_or_delete_for_posted_transaction();

DROP TRIGGER IF EXISTS trg_prevent_posted_ledger_entry_delete ON ledger_entries;
CREATE TRIGGER trg_prevent_posted_ledger_entry_delete
BEFORE DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_entry_update_or_delete_for_posted_transaction();

-- Ensure ledger posting invariant: debits == credits when posting transaction
CREATE OR REPLACE FUNCTION enforce_ledger_posting_balance() RETURNS trigger AS $$
DECLARE
  debit_sum bigint;
  credit_sum bigint;
BEGIN
  IF NEW.status = 'POSTED' AND OLD.status <> 'POSTED' THEN
    SELECT COALESCE(SUM(debit_amount_minor), 0), COALESCE(SUM(credit_amount_minor), 0)
      INTO debit_sum, credit_sum
    FROM ledger_entries
    WHERE ledger_transaction_id = NEW.id;

    IF debit_sum <> credit_sum THEN
      RAISE EXCEPTION 'Cannot post unbalanced ledger transaction: debits=% credits=%', debit_sum, credit_sum;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_ledger_posting_balance ON ledger_transactions;
CREATE TRIGGER trg_enforce_ledger_posting_balance
BEFORE UPDATE OF status ON ledger_transactions
FOR EACH ROW EXECUTE FUNCTION enforce_ledger_posting_balance();
