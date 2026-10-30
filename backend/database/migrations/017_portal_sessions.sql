-- Apply before deploying session-aware backend. Existing JWTs without a session ID
-- will require a fresh login. No patient data is stored in these tables.
CREATE TABLE PORTAL_SESSION_POLICY (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    inactivity_minutes SMALLINT NOT NULL DEFAULT 15 CHECK (inactivity_minutes IN (5, 10, 15)),
    updated_by INT REFERENCES USERS(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO PORTAL_SESSION_POLICY (id, inactivity_minutes) VALUES (1, 15);

CREATE TABLE PORTAL_SESSIONS (
    id UUID PRIMARY KEY,
    user_id INT NOT NULL REFERENCES USERS(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    CHECK (last_activity_at >= created_at)
);
CREATE INDEX portal_sessions_user_active_idx ON PORTAL_SESSIONS (user_id, created_at DESC)
    WHERE revoked_at IS NULL;
