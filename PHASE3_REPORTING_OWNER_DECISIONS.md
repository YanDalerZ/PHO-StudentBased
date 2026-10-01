# Phase 3 Reporting and Export Owner Decisions

## Status and authority

**APPROVED for implementation planning on 2026-10-01.**

These decisions resolve the ten policy gates identified by Phase 3 Milestone 1.
They were confirmed by the project owner in the working session. They refine the
general approvals in `referrences/v5_decision_log.md`; Plan v5 remains the
technical authority where this document is silent.

This is a policy and contract record. Approval does not mean that its migrations,
reference datasets, routes, storage, queries, UI, or tests already exist.

## 1. Module report definitions and classification vocabulary

All consolidated reports use school geography for the common Municipality →
Barangay → School cascade. Residence geography is a separate, explicitly named
Patient Information dimension and must never be substituted for school scope.

Counts described as students use `COUNT(DISTINCT student_id)`. Counts described
as visits, records, screenings, administrations, or doses state that unit
explicitly. Null clinical measurements are not silently converted to zero.

The sensitivity vocabulary is:

- **Authorized Aggregate:** aggregate output available to an authorized
  `can_report` user; it is not public data.
- **Clinical Aggregate:** aggregate clinical output available to an authorized
  `can_report` user and subject to small-cell protection.
- **Sensitive Aggregate:** aggregate-only output; never placed in detail rows.
- **Internal:** operational or audit metadata; never exported as patient data.

Sensitive or clinical category cells below five are suppressed. Complementary
suppression is required when a total or another visible cell would reveal the
suppressed value.

### Patient Information

- Registration population: distinct students with an official `PATIENT_INFO`
  row.
- Event date: `PATIENT_INFO.created_at` for the common report date filter.
- Aggregate dimensions: sex, approved age band, school geography, separately
  labeled residence geography, 4Ps, PWD/PWD type, PhilHealth/category, and
  indigenous status.
- QR versus authorized staff-direct source may be shown as an optional dimension.
  QR-approved new registrations are identified through the approved registration
  submission relationship; other official registrations are staff-direct. Merge
  decisions do not create a second registration.
- The 30-day value is a review-service-level metric for staged QR submissions,
  not the registration population or denominator. Direct registrations are
  `not_applicable` for that metric.
- Empty state: `No official Patient Information registrations match the selected filters.`

### Oral Health

- Examined students: distinct `ORAL_HEALTH.student_id`.
- Examinations: count of Oral Health rows.
- Event date: `ORAL_HEALTH.date_examined`.
- Required aggregates: permanent and primary DMFT components, RPOC completion
  and steps, treatment category, service location, visit type, and school
  coverage.
- Tooth totals and student/visit totals remain separate measures.
- Null DMFT values remain unknown and are not clinical zero.
- School-coverage denominator: the approved period target snapshot for the
  school where available; otherwise the report labels the denominator as
  unavailable rather than using a misleading current roster.
- Empty state: `No oral health examinations match the selected filters.`

### Deworming

- Accomplished population: distinct students with `DEWORMING.is_dewormed = true`.
- Event date: `DEWORMING.date_dewormed`.
- Required aggregates: male, female, total accomplished, approved age groups,
  school type, in-school/out-of-school, municipality/school target, and
  accomplishment percentage.
- R1 covers July through December of the school-year start year. R2 covers
  January through June of the following year. For example, `2026-SY-R1` is
  2026-07-01 through 2026-12-31 and `2026-SY-R2` is 2027-01-01 through
  2027-06-30.
- Targets are auditable school-and-period snapshots. The system may initialize a
  snapshot from the roster available at the start of a period. A later report
  must not claim that current `STUDENTS` rows reconstruct historical enrollment.
- An authorized manual target override requires a reason and audit event.
- Empty state: `No deworming records match the selected filters.`

### Immunization

- Event date: `IMMUNIZATION.immunization_date`.
- Required aggregates: administered doses and distinct vaccinated students by
  stored vaccine flag, consent/refusal/deferred totals, refusal-reason
  distribution, eligible target, and school coverage.
- Approved cohorts: Grade 1 and Grade 7 learners for MR and Td; Grade 4 female
  learners for HPV.
- Coverage is `vaccinated / total eligible × 100`; refused and deferred learners
  remain in the denominator.
- The stored names `td1`, `mr1`, `td2`, and `mr2` are dose flags. They must not be
  reinterpreted as Grade 1/Grade 7 identifiers. Grade eligibility comes from the
  student's approved cohort or a period target snapshot.
- The current refusal, deferral, and consent fields are record-level, not
  vaccine-specific. Release 1 reports those outcomes at record/student level and
  does not claim vaccine-specific refusal without a future schema change.
- Contradictory states are normalized for reporting in this order: vaccinated,
  refused, deferred, pending consented, no consent. Write validation should
  prevent new contradictory rows.
- Empty state: `No immunization records match the selected filters.`

### Vital Signs

- Screened students: distinct `VITAL_SIGNS.student_id`.
- Screenings: count of Vital Signs rows.
- Event date: `VITAL_SIGNS.date_checked`.
- Measurement-completion aggregates separately cover blood pressure, heart rate,
  respiratory rate, temperature, weight, height, and BMI.
- School coverage uses an approved period target snapshot where available; it
  otherwise reports that the denominator is unavailable.
- BP and BMI outputs are screening categories only and are never labeled as a
  diagnosis.
- Empty state: `No vital sign screenings match the selected filters.`

## 2. Patient Information age and decision-period rules

- Age bands: `0-4`, `5-9`, `10-14`, `15-19`, and `20+`.
- Age anchor: normalized report `date_to`; if no period/date input is supplied,
  the current-month default resolves to concrete dates first.
- Age uses completed years at the anchor date.
- QR review service level: 30 calendar days from `submitted_at` to `reviewed_at`.
- Pending submissions older than 30 days are flagged; they are not automatically
  approved, rejected, or deleted.
- QR and staff-direct registrations belong to the same official registration
  population, with source available only as an explicit dimension.

## 3. Deworming targets

A forward migration may add `DEWORMING_TARGETS`, but it must preserve an
auditable snapshot rather than a silent mutable override. The minimum contract
is:

- school and canonical period;
- baseline target count and its source;
- optional override count and mandatory override reason;
- effective target count;
- creator/updater identity and timestamps;
- uniqueness for the active school/period target;
- non-negative count checks;
- audit events for creation and override.

Historical target reports use the stored snapshot, not a reconstruction from the
current student roster.

## 4. Immunization cohorts and outcome precedence

- MR and Td eligibility: Grade 1 and Grade 7 learners.
- HPV eligibility: Grade 4 female learners.
- Target counts should be captured as period/cohort snapshots when accurate
  historical coverage is required.
- Refused and deferred learners remain in the total-eligible denominator.
- Refusal reasons use the existing controlled codes 1–18.
- Report precedence is vaccinated → refused → deferred → pending consented → no
  consent. This precedence prevents double counting but does not repair invalid
  source data.

## 5. Vital Signs screening references and referrals

### Blood pressure

- Ages 5–12 use the approved pediatric age/sex/height percentile method from the
  2017 American Academy of Pediatrics guideline.
- Ages 13–17 use the fixed adolescent categories from that guideline.
- The reference version and source checksum are recorded with the application
  configuration and test fixtures.
- Until the reference tables and calculation are independently validated, the
  API returns raw distributions and `classification_status = unavailable`.

Reference: <https://publications.aap.org/pediatrics/article/140/3/e20171904/38358/Clinical-Practice-Guideline-for-Screening-and>

### BMI-for-age

Use the WHO 2007 BMI-for-age reference for ages 5–19 with completed age in
months and sex:

- severe thinness: `< -3 SD`;
- thinness: `>= -3 SD and < -2 SD`;
- normal: `>= -2 SD and <= +1 SD`;
- overweight: `> +1 SD and <= +2 SD`;
- obesity: `> +2 SD`.

The reference dataset/version and checksum are recorded and covered by fixtures.
Until validated, the report returns raw BMI distributions and marks the
classification unavailable.

Reference: <https://www.who.int/toolkits/growth-reference-data-for-5to19-years/indicators/bmi-for-age>

### Referrals

A forward migration may add `referral_needed`, `referral_reason`,
`referral_date`, and `referral_facility` to `VITAL_SIGNS`. It must enforce that
referral details cannot exist when `referral_needed` is false, require a
controlled reason when a referral is needed, and prevent a referral date before
the screening date. Clinical free text remains excluded from exports and audit
details.

## 6. Reporting-period vocabulary

Accepted inputs are:

- `YYYY-MM` calendar month;
- `YYYY-Q1` through `YYYY-Q4` calendar quarters;
- `YYYY-SY-R1` and `YYYY-SY-R2` school-year reporting rounds;
- an explicit `date_from` plus `date_to`.

A named period and explicit dates are mutually exclusive. No input defaults to
the current calendar month, which is immediately normalized to concrete dates.
The normalized dates, original named period when supplied, and timezone are
returned by the preview and stored with export/audit metadata.

## 7. Preview and export bounds

- Preview page size: default 25, minimum 10, maximum 100.
- Detail export maximum: 50,000 rows.
- Export date-span maximum: 365 days inclusive.
- An over-limit request fails before job creation with HTTP `422` and safe code
  `EXPORT_LIMIT_EXCEEDED`.
- Aggregate outputs use predefined bounded groupings even though the 50,000-row
  detail limit does not apply to summary rows.

## 8. Detail export eligibility and field minimization

The approved module allowlist plus the module's `can_export` action is the full
row-level export authorization. There is no undocumented second clinical-export
permission. School scope and current effective access are still enforced.

All exported strings receive formula-injection protection after leading
whitespace normalization. Names and identifiers are not exempt.

Approved detail fields:

- **Patient Information:** LRN, name components, sex, date of birth, computed
  age, grade, section, school, school municipality/barangay, 4Ps/PWD/PhilHealth/
  indigenous booleans, and registration date.
- **Oral Health:** LRN, student name, sex, computed age, school, examination date,
  permanent/primary DMFT totals, RPOC step/status booleans, service location,
  visit type, and treatment category.
- **Deworming:** LRN, student name, sex, computed age, age group, school,
  deworming date, medication, accomplished flag, school type, and in-school flag.
- **Immunization:** LRN, student name, sex, computed age, school, immunization
  date, vaccine flags, consent, refusal, deferral, and controlled refusal code.
- **Vital Signs:** LRN, student name, sex, computed age, school, screening date,
  systolic/diastolic BP, heart rate, respiratory rate, temperature, weight,
  height, BMI, and validated screening classifications when available.

Excluded across all modules: contact information, street address, parent/
guardian contacts, household/government/benefit identifier values, photo URLs,
internal database/user IDs, JSON tooth charts, lot/batch numbers, provider names,
free-text notes, diagnoses, allergy narratives, referral free text, and storage
metadata.

## 9. Direct export delivery

Owner decision updated on 2026-10-02: CSV and XLSX exports are generated during
the authenticated request and returned directly as an attachment. The service
does not create jobs, persist exported files, issue download credentials, or
require a Render disk.

- `POST /reports/:moduleSlug/exports` returns HTTP `200` with the file bytes.
- The former status, download, and delete routes are retired.
- `REPORT_EXPORTS` remains in the schema for compatibility/history but is not
  written by the direct-download path.
- Current authentication, portal role, active-module, `can_export`, effective
  school scope, date-span, row-limit, allowlist, formula-protection, and audit
  controls remain mandatory.
- Responses use `private, no-store`; no persistent public URL is created.

## 10. Audit actions and print tracking

Server-owned audit action names are:

- `REPORT_VIEWED`
- `REPORT_PRINT_INITIATED`
- `REPORT_EXPORT_REQUESTED`
- `REPORT_EXPORT_COMPLETED`
- `REPORT_EXPORT_FAILED`
- `REPORT_EXPORT_DOWNLOADED`
- `REPORT_EXPORT_DELETED`
- `REPORT_EXPORT_EXPIRED`

Print initiation is recorded through
`POST /reports/:moduleSlug/print-events`. The route requires authentication,
the matching `can_report` grant, effective school scope, and a strict body
containing only the active report filters. The server supplies the actor,
action, module, scope, IP address, and sanitized details. A generic client-
writable audit-event endpoint is prohibited.

Audit details contain normalized filters and safe counts/status codes, never
report rows, names, LRNs, contacts, clinical free text, storage references, or
download credentials.

## Required implementation sequence

1. Add forward-only schema support for auditable Deworming target snapshots and
   constrained Vital Signs referrals; preserve `REPORT_EXPORTS`.
2. Implement and test shared filter normalization, period resolution, school
   scope, pagination, and bounded grouping.
3. Add module reports using shared query results and target snapshots.
4. Vendor and independently validate versioned AAP/WHO reference data before
   enabling BP/BMI classifications.
5. Add the export lifecycle, production storage adapter, formula protection,
   requester authorization, cleanup, deletion, and audit events.
6. Build the report/print/export UI and reconcile all representations to the
   same fixtures.

## Remaining implementation selections

These are engineering selections rather than open report-policy decisions:

- the durable private production storage provider;
- the XLSX generation library;
- the background job runner;
- the exact versioned files/checksums used to encode the approved AAP and WHO
  references.

They must be documented and verified in their implementation milestones. They
do not block Milestone 2's shared aggregation and scope foundation.
