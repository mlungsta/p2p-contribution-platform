-- Step 3.5 additional immutability and safety guardrails

-- Prevent deletes on core financial records
CREATE OR REPLACE FUNCTION prevent_financial_record_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Deletion is not allowed on financial records table: %', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_delete_contribution_offers ON contribution_offers;
CREATE TRIGGER trg_prevent_delete_contribution_offers
BEFORE DELETE ON contribution_offers
FOR EACH ROW EXECUTE FUNCTION prevent_financial_record_delete();

DROP TRIGGER IF EXISTS trg_prevent_delete_recipient_requests ON recipient_requests;
CREATE TRIGGER trg_prevent_delete_recipient_requests
BEFORE DELETE ON recipient_requests
FOR EACH ROW EXECUTE FUNCTION prevent_financial_record_delete();

DROP TRIGGER IF EXISTS trg_prevent_delete_matches ON matches;
CREATE TRIGGER trg_prevent_delete_matches
BEFORE DELETE ON matches
FOR EACH ROW EXECUTE FUNCTION prevent_financial_record_delete();

DROP TRIGGER IF EXISTS trg_prevent_delete_proofs_of_payment ON proofs_of_payment;
CREATE TRIGGER trg_prevent_delete_proofs_of_payment
BEFORE DELETE ON proofs_of_payment
FOR EACH ROW EXECUTE FUNCTION prevent_financial_record_delete();

-- Prevent updates to terminal/finalized matches
CREATE OR REPLACE FUNCTION prevent_terminal_match_update() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('CONFIRMED','RESOLVED','COMPLETED','CANCELLED','EXPIRED') THEN
    RAISE EXCEPTION 'Terminal matches are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_terminal_match_update ON matches;
CREATE TRIGGER trg_prevent_terminal_match_update
BEFORE UPDATE ON matches
FOR EACH ROW EXECUTE FUNCTION prevent_terminal_match_update();

-- Prevent accepted proof mutations
CREATE OR REPLACE FUNCTION prevent_accepted_proof_update() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'ACCEPTED' THEN
    RAISE EXCEPTION 'Accepted proof records are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_accepted_proof_update ON proofs_of_payment;
CREATE TRIGGER trg_prevent_accepted_proof_update
BEFORE UPDATE ON proofs_of_payment
FOR EACH ROW EXECUTE FUNCTION prevent_accepted_proof_update();
