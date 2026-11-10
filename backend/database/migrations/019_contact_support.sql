CREATE TABLE SUPPORT_REPORTS (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    reply_email TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('login', 'technical', 'access', 'other')),
    description TEXT NOT NULL,
    page_or_module TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved')),
    resolution_notes TEXT,
    reviewed_by INTEGER REFERENCES USERS(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX support_reports_queue_idx ON SUPPORT_REPORTS (status, created_at DESC, id);

CREATE TABLE SUPPORT_ACCOUNT_REQUESTS (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    work_email TEXT NOT NULL CHECK (work_email = lower(work_email)),
    contact_no TEXT NOT NULL,
    job_title TEXT NOT NULL,
    school_or_office TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    decision_note TEXT,
    decided_by INTEGER REFERENCES USERS(id),
    decided_at TIMESTAMPTZ,
    created_user_id INTEGER UNIQUE REFERENCES USERS(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((status = 'approved') = (created_user_id IS NOT NULL)),
    CHECK ((status = 'pending') = (decided_at IS NULL))
);
CREATE UNIQUE INDEX support_one_pending_email_idx ON SUPPORT_ACCOUNT_REQUESTS (work_email) WHERE status = 'pending';
CREATE INDEX support_account_queue_idx ON SUPPORT_ACCOUNT_REQUESTS (status, created_at DESC, id);

CREATE TABLE SUPPORT_ACCOUNT_NOTIFICATIONS (
    request_id UUID PRIMARY KEY REFERENCES SUPPORT_ACCOUNT_REQUESTS(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'accepted', 'delivered', 'failed')),
    attempt_count INTEGER NOT NULL DEFAULT 0,
    attempted_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    error_code TEXT,
    provider_id UUID,
    send_generation INTEGER NOT NULL DEFAULT 1
);
