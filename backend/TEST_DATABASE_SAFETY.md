# Disposable PostgreSQL safety

Database setup, seed, migration, and fixture scripts are restricted to the local
`pho_test` database. They validate the configured URL and then query PostgreSQL's
live identity before any mutation.

Set these values in a private environment file or shell. Supply a URL-encoded
password and never commit it.

```text
NODE_ENV=test
DATABASE_URL=postgres://postgres:<url-encoded-password>@localhost:5432/pho_test
PHO_ALLOW_DESTRUCTIVE_TESTS=true
PHO_EXPECTED_DB_HOST=localhost
PHO_EXPECTED_DB_PORT=5432
PHO_EXPECTED_DB_NAME=pho_test
PHO_EXPECTED_DB_USER=postgres
```

Read-only Phase 1 inventory:

```text
npm run inspect:phase1:database
```

Isolated safety tests (no database connection):

```text
npm run test:phase1:safety
```

The inventory reports non-secret target identity, schema evidence, constraint and
index metadata, duplicate active assignments/grants, invalid grant groupings, and
grant shapes for provenance review. It does not read patient payloads or credentials.
