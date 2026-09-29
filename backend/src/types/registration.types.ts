import { z } from 'zod';

export const PUBLIC_REGISTRATION_SCHEMA_VERSION = 'v1' as const;
export const PUBLIC_PRIVACY_NOTICE_VERSION = 'v1' as const;

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const optionalBoolean = z.boolean().optional().nullable();
const positiveId = z.coerce.number().int().positive();
const pastDate = z.iso.date().refine(
    (value) => value <= new Date().toISOString().slice(0, 10),
    'Date cannot be in the future',
);

/**
 * Explicit public allowlist. School identity and all reviewer/audit fields are
 * derived by the server and are deliberately absent from this schema.
 */
export const publicRegistrationPayloadSchema = z.strictObject({
    student_lrn: z.string().trim().regex(/^\d{12}$/, 'LRN must be exactly 12 digits'),
    first_name: z.string().trim().min(1).max(100),
    middle_name: optionalText(100),
    last_name: z.string().trim().min(1).max(100),
    suffix: optionalText(20),
    date_of_birth: pastDate,
    sex: z.enum(['Male', 'Female']),
    birth_place: optionalText(200),
    mother_first_name: optionalText(100),
    mother_last_name: optionalText(100),
    mother_middle_name: optionalText(100),
    mother_birthdate: z.union([pastDate, z.literal('')]).optional().nullable(),

    country: optionalText(100),
    region: optionalText(100),
    province: optionalText(100),
    municipality_id: positiveId,
    barangay_id: positiveId,
    street_address: optionalText(300),
    zip_code: optionalText(10),
    email: z.union([z.email(), z.literal('')]).optional().nullable(),
    mobile: optionalText(20),
    landline: optionalText(20),
    psa_national_id: optionalText(50),

    civil_status: optionalText(50),
    educational_attainment: optionalText(100),
    employment_status: optionalText(100),
    tax_id_no: optionalText(50),
    religion: optionalText(200),
    is_indigenous: optionalBoolean,
    indigenous_group: optionalText(100),
    blood_type: optionalText(5),
    is_4ps_member: optionalBoolean,
    fourps_household_no: optionalText(50),
    is_pwd: optionalBoolean,
    pwd_type: optionalText(100),
    pwd_id: optionalText(50),
    is_philhealth_member: optionalBoolean,
    philhealth_no: optionalText(50),
    philhealth_status_type: optionalText(20),
    philhealth_category: optionalText(200),

    grade_level: optionalText(30),
    section: optionalText(100),
    parent_guardian_name: z.string().trim().min(1).max(200),
    parent_guardian_contact: z.string().trim().min(1).max(20),
    guardian_consent: z.literal(true),
    privacy_notice_version: z.literal(PUBLIC_PRIVACY_NOTICE_VERSION),
});

export const invitationCreateSchema = z.strictObject({
    school_id: positiveId,
    expires_in_days: z.coerce.number().int().min(1).max(7).default(7),
    submission_limit: z.coerce.number().int().min(1).max(100).default(100),
});

export const invitationListQuerySchema = z.strictObject({
    school_id: positiveId.optional(),
    status: z.enum(['active', 'revoked', 'expired']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const submissionListQuerySchema = z.strictObject({
    school_id: positiveId.optional(),
    status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
    possible_duplicate: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const submissionDecisionSchema = z.discriminatedUnion('decision', [
    z.strictObject({
        decision: z.literal('new'),
        decision_reason: z.string().trim().min(1).max(500),
    }),
    z.strictObject({
        decision: z.literal('merge'),
        target_student_id: positiveId,
        decision_reason: z.string().trim().min(1).max(500),
    }),
]);

export const registrationRejectionReasons = [
    { code: 'DUPLICATE_CONFIRMED', label: 'Confirmed duplicate' },
    { code: 'INCOMPLETE_INFORMATION', label: 'Incomplete information' },
    { code: 'INVALID_INFORMATION', label: 'Invalid or inconsistent information' },
    { code: 'OUTSIDE_SCHOOL_SCOPE', label: 'Student is outside this school' },
    { code: 'CONSENT_CONCERN', label: 'Consent or guardian authority concern' },
    { code: 'OTHER', label: 'Other reviewed reason' },
] as const;

const rejectionReasonCode = z.enum(registrationRejectionReasons.map((reason) => reason.code));

export const rejectionDecisionSchema = z.strictObject({
    reason_code: rejectionReasonCode,
    reason_note: z.string().trim().min(1).max(500).optional(),
}).superRefine((value, context) => {
    if (value.reason_code === 'OTHER' && !value.reason_note) {
        context.addIssue({
            code: 'custom',
            path: ['reason_note'],
            message: 'A note is required when the rejection reason is Other',
        });
    }
});

export type PublicRegistrationPayload = z.infer<typeof publicRegistrationPayloadSchema>;
export type SubmissionDecision = z.infer<typeof submissionDecisionSchema>;

export const publicFormDefinition = {
    schema_version: PUBLIC_REGISTRATION_SCHEMA_VERSION,
    privacy_notice_version: PUBLIC_PRIVACY_NOTICE_VERSION,
    required_fields: [
        'student_lrn',
        'first_name',
        'last_name',
        'date_of_birth',
        'sex',
        'municipality_id',
        'barangay_id',
        'parent_guardian_name',
        'parent_guardian_contact',
        'guardian_consent',
        'privacy_notice_version',
    ],
} as const;
