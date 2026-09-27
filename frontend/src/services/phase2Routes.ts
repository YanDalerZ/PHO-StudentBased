export const phase2Routes = {
    publicInvitation: (token: string) => `/public/registration-invitations/${encodeURIComponent(token)}`,
    publicSubmission: (token: string) => `/public/registration-invitations/${encodeURIComponent(token)}/submissions`,
    invitations: '/registration-invitations',
    revokeInvitation: (id: number) => `/registration-invitations/${id}/revoke`,
    submissions: '/registration-submissions',
    submission: (id: number) => `/registration-submissions/${id}`,
    approveSubmission: (id: number) => `/registration-submissions/${id}/approve`,
    rejectSubmission: (id: number) => `/registration-submissions/${id}/reject`,
} as const;
