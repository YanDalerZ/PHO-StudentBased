-- 1. Modify USERS table
CREATE TYPE portal_role_enum AS ENUM ('school_staff', 'superuser', 'admin');

ALTER TABLE USERS 
  ADD COLUMN portal_role portal_role_enum,
  ADD COLUMN job_title VARCHAR(100);

-- Migrate existing roles
UPDATE USERS SET portal_role = 'school_staff', job_title = 'Teacher' WHERE role = 'teacher';
UPDATE USERS SET portal_role = 'superuser', job_title = 'Superuser' WHERE role = 'superuser';
UPDATE USERS SET portal_role = 'admin', job_title = 'Admin' WHERE role = 'admin';

-- Set portal_role as NOT NULL
ALTER TABLE USERS ALTER COLUMN portal_role SET NOT NULL;

-- 2. USER_SCHOOL_ASSIGNMENTS
CREATE TABLE USER_SCHOOL_ASSIGNMENTS (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES USERS(id) ON DELETE CASCADE,
    school_id INT NOT NULL REFERENCES SCHOOLS(id) ON DELETE CASCADE,
    assigned_by INT REFERENCES USERS(id),
    assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ NULL,
    revoked_by INT REFERENCES USERS(id) NULL
);

-- 3. USER_MODULE_PERMISSIONS
CREATE TABLE USER_MODULE_PERMISSIONS (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES USERS(id) ON DELETE CASCADE,
    module_id INT NOT NULL REFERENCES MODULES(id) ON DELETE CASCADE,
    can_view BOOLEAN DEFAULT FALSE,
    can_create BOOLEAN DEFAULT FALSE,
    can_edit BOOLEAN DEFAULT FALSE,
    can_approve_registration BOOLEAN DEFAULT FALSE,
    can_report BOOLEAN DEFAULT FALSE,
    can_export BOOLEAN DEFAULT FALSE,
    granted_by INT REFERENCES USERS(id),
    granted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ NULL,
    revoked_by INT REFERENCES USERS(id) NULL
);

-- 4. AUDIT_EVENTS
CREATE TABLE AUDIT_EVENTS (
    id SERIAL PRIMARY KEY,
    actor_id INT REFERENCES USERS(id),
    portal_role VARCHAR(50),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    school_id INT REFERENCES SCHOOLS(id),
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. Public QR & Registration Queue Tables
CREATE TABLE REGISTRATION_INVITATIONS (
    id SERIAL PRIMARY KEY,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    school_id INT NOT NULL REFERENCES SCHOOLS(id),
    created_by INT NOT NULL REFERENCES USERS(id),
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    submission_limit INT DEFAULT 100,
    submission_count INT DEFAULT 0,
    revoked_at TIMESTAMPTZ,
    revoked_by INT REFERENCES USERS(id),
    revocation_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE REGISTRATION_SUBMISSIONS (
    id SERIAL PRIMARY KEY,
    invitation_id INT NOT NULL REFERENCES REGISTRATION_INVITATIONS(id),
    school_id INT NOT NULL REFERENCES SCHOOLS(id),
    payload JSONB NOT NULL,
    payload_schema_version VARCHAR(20) DEFAULT 'v1',
    status VARCHAR(20) DEFAULT 'pending',
    idempotency_key VARCHAR(100) UNIQUE,
    duplicate_match_summary JSONB,
    reviewed_by INT REFERENCES USERS(id),
    reviewed_at TIMESTAMPTZ,
    decision_reason TEXT,
    created_student_id INT REFERENCES STUDENTS(id),
    submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE REGISTRATION_SUBMISSION_EVENTS (
    id SERIAL PRIMARY KEY,
    submission_id INT NOT NULL REFERENCES REGISTRATION_SUBMISSIONS(id),
    event_type VARCHAR(50) NOT NULL,
    actor_id INT REFERENCES USERS(id),
    event_metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Baseline permissions for existing migrated school_staff (Teacher)
INSERT INTO USER_MODULE_PERMISSIONS (user_id, module_id, can_view, can_create, can_edit, can_approve_registration, can_report, can_export)
SELECT u.id, m.id, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE
FROM USERS u
CROSS JOIN MODULES m
WHERE u.portal_role = 'school_staff';

-- Baseline permissions for superuser
INSERT INTO USER_MODULE_PERMISSIONS (user_id, module_id, can_view, can_create, can_edit, can_approve_registration, can_report, can_export)
SELECT u.id, m.id, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE
FROM USERS u
CROSS JOIN MODULES m
WHERE u.portal_role = 'superuser';
