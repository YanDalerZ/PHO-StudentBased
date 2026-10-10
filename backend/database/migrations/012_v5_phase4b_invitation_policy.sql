-- Phase 4B Milestone 5: one non-secret public registration policy overlay.
-- NULL overrides retain the validated deployment baseline. Policy edits affect
-- subsequent requests; issued invitation rows keep their own expiry and cap.
CREATE TABLE REGISTRATION_PUBLIC_POLICY (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    origin_override VARCHAR(200),
    rate_window_ms_override INT CHECK (rate_window_ms_override BETWEEN 1000 AND 86400000),
    rate_limit_per_ip_override INT CHECK (rate_limit_per_ip_override BETWEEN 1 AND 10000),
    rate_limit_per_invitation_override INT CHECK (rate_limit_per_invitation_override BETWEEN 1 AND 100000),
    max_body_bytes_override INT CHECK (max_body_bytes_override BETWEEN 1024 AND 262144),
    privacy_notice_override TEXT CHECK (CHAR_LENGTH(BTRIM(privacy_notice_override)) BETWEEN 20 AND 4000),
    retention_notice_override TEXT CHECK (CHAR_LENGTH(BTRIM(retention_notice_override)) BETWEEN 10 AND 1000),
    contact_override VARCHAR(300) CHECK (CHAR_LENGTH(BTRIM(contact_override)) BETWEEN 3 AND 300),
    max_expiry_days INT NOT NULL DEFAULT 7 CHECK (max_expiry_days BETWEEN 1 AND 7),
    max_submission_limit INT NOT NULL DEFAULT 100 CHECK (max_submission_limit BETWEEN 1 AND 100),
    updated_by INT REFERENCES USERS(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO REGISTRATION_PUBLIC_POLICY (id) VALUES (1);
