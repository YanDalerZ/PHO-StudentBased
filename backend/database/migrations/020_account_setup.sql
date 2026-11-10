ALTER TABLE USERS
    ADD COLUMN password_setup_pending BOOLEAN NOT NULL DEFAULT FALSE,
    ADD CONSTRAINT users_pending_setup_inactive CHECK (NOT password_setup_pending OR NOT is_active);

ALTER TABLE SUPPORT_ACCOUNT_NOTIFICATIONS
    ADD COLUMN setup_required BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN setup_token_hash TEXT UNIQUE,
    ADD COLUMN setup_expires_at TIMESTAMPTZ,
    ADD COLUMN setup_completed_at TIMESTAMPTZ,
    ADD CONSTRAINT support_setup_token_pair CHECK (
        (setup_token_hash IS NULL) = (setup_expires_at IS NULL)
        AND (setup_token_hash IS NULL OR (setup_required AND setup_completed_at IS NULL))
    );
