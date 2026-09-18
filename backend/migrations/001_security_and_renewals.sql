ALTER TABLE contracts ADD COLUMN IF NOT EXISTS original_status TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS baseline_needs_review BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS renewal_cycle INTEGER NOT NULL DEFAULT 1;
-- Historical original statuses cannot be reconstructed. Flag affected Masters.
UPDATE contracts c SET original_status = c.status,
  baseline_needs_review = EXISTS (SELECT 1 FROM contracts child WHERE child.parent_contract_id = c.id)
WHERE original_status IS NULL;
UPDATE contracts SET original_end_date = end_date WHERE original_end_date IS NULL;

CREATE TABLE app_users (
 id SERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('admin','editor','viewer')),
 active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE auth_sessions (
 token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);
CREATE TABLE auth_attempts (
 bucket TEXT PRIMARY KEY, failures INTEGER NOT NULL DEFAULT 0,
 expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE contract_audit_log (
 id BIGSERIAL PRIMARY KEY, contract_id INTEGER NOT NULL,
 action TEXT NOT NULL, actor_id INTEGER, actor_name TEXT NOT NULL,
 before_data JSONB, after_data JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX contract_audit_history_idx ON contract_audit_log(contract_id, id DESC);
CREATE INDEX contracts_parent_latest_idx ON contracts(parent_contract_id, created_at DESC, id DESC);
CREATE INDEX contracts_end_date_idx ON contracts(end_date);
CREATE INDEX contracts_status_idx ON contracts(status);

-- NOT VALID avoids silently rewriting historical invalid records. New writes
-- are checked immediately; scripts/check-data.js reports legacy rows to repair.
ALTER TABLE contracts ADD CONSTRAINT contracts_name_check CHECK (length(btrim(contract_name)) > 0) NOT VALID;
ALTER TABLE contracts ADD CONSTRAINT contracts_type_check CHECK (contract_type IS NOT NULL AND contract_type IN ('Master','Amendment','Addendum')) NOT VALID;
ALTER TABLE contracts ADD CONSTRAINT contracts_status_check CHECK (status IS NOT NULL AND status IN ('Upcoming renewal','Negotiation in progress','Renewed','Expired/Not renewed')) NOT VALID;
ALTER TABLE contracts ADD CONSTRAINT contracts_amount_check CHECK (cost_amount IS NULL OR (cost_amount >= 0 AND cost_amount <= 9007199254740991)) NOT VALID;
ALTER TABLE contracts ADD CONSTRAINT contracts_dates_check CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date) NOT VALID;
ALTER TABLE contracts ADD CONSTRAINT contracts_parent_check CHECK (
 (contract_type = 'Master' AND parent_contract_id IS NULL) OR
 (contract_type IN ('Amendment','Addendum') AND parent_contract_id IS NOT NULL AND parent_contract_id <> id)
) NOT VALID;
-- Replace old ON DELETE SET NULL FK with RESTRICT: never orphan children.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT conname FROM pg_constraint
 WHERE conrelid='contracts'::regclass AND contype='f'
 AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='contracts'::regclass AND attname='parent_contract_id')]::smallint[]
 LOOP EXECUTE format('ALTER TABLE contracts DROP CONSTRAINT %I', r.conname); END LOOP;
END $$;
ALTER TABLE contracts ADD CONSTRAINT contracts_parent_fk FOREIGN KEY(parent_contract_id) REFERENCES contracts(id) ON DELETE RESTRICT NOT VALID;

ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS renewal_cycle INTEGER;
ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS due_date DATE;
-- Legacy rows stay intact with NULL cycle; new records have an enforced key.
CREATE UNIQUE INDEX notification_app_cycle_unique
 ON notification_log(contract_id, renewal_cycle, threshold_days)
 WHERE channel='app' AND renewal_cycle IS NOT NULL;
CREATE INDEX notification_app_recent_idx ON notification_log(sent_at DESC) WHERE channel='app';
CREATE TABLE notification_reads (
 notification_id INTEGER NOT NULL REFERENCES notification_log(id) ON DELETE CASCADE,
 user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 seen_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(notification_id,user_id)
);

CREATE OR REPLACE FUNCTION contract_before_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(71001);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.parent_contract_id IS NOT NULL THEN
   PERFORM 1 FROM contracts WHERE id=NEW.parent_contract_id AND contract_type='Master' FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Parent must be a Master' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.contract_type IS DISTINCT FROM OLD.contract_type
   AND EXISTS(SELECT 1 FROM contracts WHERE parent_contract_id=OLD.id) THEN
   RAISE EXCEPTION 'Master has sub-contracts' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' THEN
   NEW.original_end_date := NEW.end_date; NEW.original_status := NEW.status;
   NEW.renewal_cycle := 1;
 ELSIF NEW.end_date IS DISTINCT FROM OLD.end_date OR
   (OLD.status IN ('Renewed','Expired/Not renewed') AND NEW.status IN ('Upcoming renewal','Negotiation in progress')) THEN
   NEW.renewal_cycle := OLD.renewal_cycle + 1;
 ELSE NEW.renewal_cycle := OLD.renewal_cycle;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER contract_before_write_trigger BEFORE INSERT OR UPDATE OR DELETE ON contracts
 FOR EACH ROW EXECUTE FUNCTION contract_before_write();

CREATE OR REPLACE FUNCTION contract_audit_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO contract_audit_log(contract_id, action, actor_id, actor_name, before_data, after_data)
 VALUES (COALESCE(NEW.id,OLD.id), TG_OP,
   NULLIF(current_setting('app.actor_id',true),'')::integer,
   COALESCE(NULLIF(current_setting('app.actor_name',true),''),'database/system'),
   CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
   CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER contract_audit_trigger AFTER INSERT OR UPDATE OR DELETE ON contracts
 FOR EACH ROW EXECUTE FUNCTION contract_audit_write();
ALTER TABLE contracts ADD CONSTRAINT contracts_currency_check CHECK (cost_currency ~ '^[A-Z]{3}$') NOT VALID;
ALTER TABLE contracts ADD CONSTRAINT contracts_cycle_check CHECK (renewal_cycle > 0) NOT VALID;
ALTER TABLE notification_log ADD CONSTRAINT notification_cycle_check CHECK (
 channel IS DISTINCT FROM 'app' OR
 (renewal_cycle IS NOT NULL AND renewal_cycle > 0 AND due_date IS NOT NULL AND threshold_days IN (-1,7,30,60,90))
) NOT VALID;
