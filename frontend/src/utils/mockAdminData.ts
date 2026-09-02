export interface ActivityLog {
    id: string;
    type: 'login' | 'record_created' | 'report_generated' | 'system_alert' | 'user_created';
    user: string;
    action: string;
    timestamp: string;
}

export const mockActivityFeed: ActivityLog[] = [
    {
        id: '1',
        type: 'user_created',
        user: 'Admin',
        action: 'Created a new Teacher account for Maria Santos (maria.santos@deped.gov.ph)',
        timestamp: '10 mins ago',
    },
    {
        id: '2',
        type: 'report_generated',
        user: 'Dr. Jane Smith',
        action: 'Generated the Municipality Deworming Consolidation Report for Kalibo',
        timestamp: '45 mins ago',
    },
    {
        id: '3',
        type: 'record_created',
        user: 'Maria Santos',
        action: 'Registered a new student: Juan Dela Cruz (LRN: 109823120)',
        timestamp: '1 hour ago',
    },
    {
        id: '4',
        type: 'login',
        user: 'Dr. Jane Smith',
        action: 'Successfully logged into the Super User Portal',
        timestamp: '2 hours ago',
    },
    {
        id: '5',
        type: 'system_alert',
        user: 'System',
        action: 'Automatic database backup completed successfully',
        timestamp: '3 hours ago',
    },
    {
        id: '6',
        type: 'record_created',
        user: 'Teacher Mark',
        action: 'Added an Oral Health Record for student ID #4092',
        timestamp: '4 hours ago',
    },
    {
        id: '7',
        type: 'login',
        user: 'Admin',
        action: 'Successfully logged into the Admin Portal',
        timestamp: '5 hours ago',
    }
];
