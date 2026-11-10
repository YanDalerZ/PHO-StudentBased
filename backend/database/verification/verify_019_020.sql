-- In DBeaver, select the shared Aiven defaultdb connection and run as a script.
-- The first grid identifies the database. Every row in the second grid should say PASS.
-- This script reads PostgreSQL catalogs only.
BEGIN READ ONLY;

SELECT current_database() AS database_name,
       current_user AS database_user,
       inet_server_port() AS server_port;

WITH expected_columns(table_name, column_name, data_type, is_nullable, column_default) AS (
    VALUES
        ('users', 'password_setup_pending', 'boolean', 'NO', 'false'),
        ('support_account_notifications', 'setup_required', 'boolean', 'NO', 'false'),
        ('support_account_notifications', 'setup_token_hash', 'text', 'YES', NULL),
        ('support_account_notifications', 'setup_expires_at', 'timestamp with time zone', 'YES', NULL),
        ('support_account_notifications', 'setup_completed_at', 'timestamp with time zone', 'YES', NULL)
),
column_matches AS (
    SELECT count(*) AS matched
    FROM expected_columns e
    JOIN information_schema.columns c
      ON c.table_schema = 'public'
     AND c.table_name = e.table_name
     AND c.column_name = e.column_name
     AND c.data_type = e.data_type
     AND c.is_nullable = e.is_nullable
     AND c.column_default IS NOT DISTINCT FROM e.column_default
),
checks(sort_order, check_name, passed) AS (
    SELECT 1, '019 support tables',
        to_regclass('public.support_reports') IS NOT NULL
        AND to_regclass('public.support_account_requests') IS NOT NULL
        AND to_regclass('public.support_account_notifications') IS NOT NULL
    UNION ALL
    SELECT 2, '019 support primary keys and foreign keys',
        (SELECT count(*) FROM pg_constraint
         WHERE convalidated AND contype = 'p' AND conrelid IN (
             to_regclass('public.support_reports'),
             to_regclass('public.support_account_requests'),
             to_regclass('public.support_account_notifications')
         )) = 3
        AND (SELECT count(*) FROM pg_constraint
             WHERE convalidated AND contype = 'f' AND confrelid = to_regclass('public.users')
               AND conrelid IN (to_regclass('public.support_reports'), to_regclass('public.support_account_requests'))) = 3
        AND EXISTS (SELECT 1 FROM pg_constraint
                    WHERE convalidated AND contype = 'f'
                      AND conrelid = to_regclass('public.support_account_notifications')
                      AND confrelid = to_regclass('public.support_account_requests'))
    UNION ALL
    SELECT 3, '019 one pending request per email',
        EXISTS (SELECT 1 FROM pg_index
                WHERE indexrelid = to_regclass('public.support_one_pending_email_idx')
                  AND indrelid = to_regclass('public.support_account_requests')
                  AND indisunique AND indisvalid
                  AND pg_get_indexdef(indexrelid, 1, false) = 'work_email'
                  AND pg_get_expr(indpred, indrelid) = '(status = ''pending''::text)')
    UNION ALL
    SELECT 4, '019 queue indexes',
        (SELECT count(*) FROM pg_index
         WHERE indisvalid AND (
             (indexrelid = to_regclass('public.support_reports_queue_idx')
              AND indrelid = to_regclass('public.support_reports'))
             OR (indexrelid = to_regclass('public.support_account_queue_idx')
                 AND indrelid = to_regclass('public.support_account_requests'))
         )) = 2
    UNION ALL
    SELECT 5, '020 setup columns, types, and defaults',
        (SELECT matched FROM column_matches) = (SELECT count(*) FROM expected_columns)
    UNION ALL
    SELECT 6, '020 pending setup and token pairing checks',
        EXISTS (SELECT 1 FROM pg_constraint
                WHERE convalidated AND contype = 'c'
                  AND conrelid = to_regclass('public.users')
                  AND conname = 'users_pending_setup_inactive')
        AND EXISTS (SELECT 1 FROM pg_constraint
                    WHERE convalidated AND contype = 'c'
                      AND conrelid = to_regclass('public.support_account_notifications')
                      AND conname = 'support_setup_token_pair')
    UNION ALL
    SELECT 7, '020 unique setup token hash',
        EXISTS (SELECT 1 FROM pg_index
                WHERE indrelid = to_regclass('public.support_account_notifications')
                  AND indisunique AND indisvalid AND indpred IS NULL AND indnkeyatts = 1
                  AND pg_get_indexdef(indexrelid, 1, false) = 'setup_token_hash')
)
SELECT check_name, CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result
FROM checks
ORDER BY sort_order;

COMMIT;
