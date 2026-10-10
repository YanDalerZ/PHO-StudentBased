import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardCheck, QrCode, School, Settings, Users } from 'lucide-react';

const governanceLinks = [
    { title: 'User access', description: 'Manage account roles, job titles, school assignments, and module permissions.', path: '/admin/users', icon: Users },
    { title: 'School directory', description: 'Maintain school records and their geographic assignments.', path: '/admin/schools', icon: School },
    { title: 'Module availability', description: 'Review the active state of the approved health modules.', path: '/admin/modules', icon: Settings },
    { title: 'QR invitation policy', description: 'Manage approved public registration settings and invitation metadata.', path: '/admin/invitations', icon: QrCode },
    { title: 'Audit log', description: 'Browse recorded governance and access events using safe filters.', path: '/admin/audit-logs', icon: ClipboardCheck },
];

export default function SystemSettings() {
    return <div className="max-w-6xl mx-auto space-y-6 font-outfit">
        <header>
            <p className="text-sm font-semibold text-teal-600 dark:text-teal-400">Admin governance</p>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">System settings</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                Open the working administration areas below. This page does not save configuration changes.
            </p>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
            {governanceLinks.map(({ title, description, path, icon: Icon }) =>
                <Link key={path} to={path}
                    className="group flex items-start gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-colors hover:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-white/10 dark:bg-surface-card dark:hover:border-teal-500">
                    <span className="rounded-xl bg-teal-50 p-3 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                    <span className="flex-1"><span className="block font-semibold text-slate-900 dark:text-white">{title}</span>
                        <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">{description}</span></span>
                    <ArrowRight className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </Link>,
            )}
        </div>
        <p className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-white/10 dark:bg-surface-card dark:text-slate-300">
            Two-factor requirements, session timeout, retention schedules, and audit export are not configurable here. They require approved policy and a separate implementation before administrators can rely on them.
        </p>
    </div>;
}
