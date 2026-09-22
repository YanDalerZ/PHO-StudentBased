

-- 1. Safe Role Migration & Job Title
CREATE TYPE portal_role AS ENUM ('school_staff', 'superuser', 'admin');

ALTER TABLE USERS ADD COLUMN job_title VARCHAR(100);
ALTER TABLE USERS ADD COLUMN new_role portal_role;

-- Check for unexpected roles
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM USERS WHERE role NOT IN ('teacher', 'superuser', 'admin')) THEN
        RAISE EXCEPTION 'Unexpected role found in USERS table. Migration aborted.';
    END IF;
END $$;

-- Map existing roles
UPDATE USERS SET new_role = 
    CASE role
        WHEN 'teacher' THEN 'school_staff'::portal_role
        WHEN 'superuser' THEN 'superuser'::portal_role
        WHEN 'admin' THEN 'admin'::portal_role
    END;

-- Verify no NULL values
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM USERS WHERE new_role IS NULL) THEN
        RAISE EXCEPTION 'NULL values found in new_role after mapping. Migration aborted.';
    END IF;
END $$;

-- Replace original role column (preserving NOT NULL constraint)
ALTER TABLE USERS DROP COLUMN role;
ALTER TABLE USERS RENAME COLUMN new_role TO role;
ALTER TABLE USERS ALTER COLUMN role SET NOT NULL;

-- Drop old enum
DROP TYPE user_role;

-- 2. School Assignments
CREATE TABLE USER_SCHOOL_ASSIGNMENTS (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES USERS(id),
    school_id INT NOT NULL REFERENCES SCHOOLS(id),
    assigned_by INT REFERENCES USERS(id),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_by INT REFERENCES USERS(id),
    revoked_at TIMESTAMP
);

CREATE UNIQUE INDEX idx_user_school_active 
ON USER_SCHOOL_ASSIGNMENTS (user_id, school_id) 
WHERE revoked_at IS NULL;

-- 3. Module/Action Permissions
CREATE TABLE USER_MODULE_PERMISSIONS (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES USERS(id),
    module_id INT NOT NULL REFERENCES MODULES(id),
    can_view BOOLEAN NOT NULL DEFAULT FALSE,
    can_create BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit BOOLEAN NOT NULL DEFAULT FALSE,
    can_approve_registration BOOLEAN NOT NULL DEFAULT FALSE,
    can_report BOOLEAN NOT NULL DEFAULT FALSE,
    can_export BOOLEAN NOT NULL DEFAULT FALSE,
    granted_by INT REFERENCES USERS(id),
    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_by INT REFERENCES USERS(id),
    revoked_at TIMESTAMP
);

CREATE UNIQUE INDEX idx_user_module_active 
ON USER_MODULE_PERMISSIONS (user_id, module_id) 
WHERE revoked_at IS NULL;

-- 4. Audit Events
CREATE TABLE AUDIT_EVENTS (
    id SERIAL PRIMARY KEY,
    actor_id INT REFERENCES USERS(id),
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id INT NOT NULL,
    correlation_id VARCHAR(100),
    before_data JSONB,
    after_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Note: We are explicitly deferring QR tables to Phase 2.


