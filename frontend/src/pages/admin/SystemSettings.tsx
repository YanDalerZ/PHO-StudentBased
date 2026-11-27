import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

export default function SystemSettings() {
    const [minutes, setMinutes] = useState<5 | 10 | 15>(15);
    const [saved, setSaved] = useState<5 | 10 | 15>(15);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    useEffect(() => {
        let active = true;
        void api.get<{ inactivityMinutes: 5 | 10 | 15 }>('/admin/session-timeout')
            .then(({ data }) => { if (active) { setMinutes(data.inactivityMinutes); setSaved(data.inactivityMinutes); } })
            .catch(() => toast.error('Unable to load session timeout.'))
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);
    const save = async () => {
        setSaving(true);
        try {
            await api.put('/admin/session-timeout', { inactivityMinutes: minutes });
            setSaved(minutes);
            toast.success('Session timeout updated. Existing sessions use this limit on their next check.');
        } catch { toast.error('Unable to update session timeout.'); }
        finally { setSaving(false); }
    };
    return <div className="max-w-6xl mx-auto space-y-6 font-outfit">
        <header>
            <p className="text-sm font-semibold text-teal-600 dark:text-teal-400">Admin governance</p>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">System settings</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                Manage portal session security.
            </p>
        </header>
        <section aria-labelledby="session-timeout-heading" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-surface-card">
            <h2 id="session-timeout-heading" className="text-xl font-bold text-slate-900 dark:text-white">Session Timeout</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Choose how long admin, superuser, and school staff sessions can remain inactive. Activity means interaction with the portal; background requests do not extend a session. Every session also ends after 8 hours.</p>
            {loading ? <p className="mt-4 text-sm text-slate-500">Loading session timeout…</p> : <div className="mt-5 flex flex-wrap items-end gap-4">
                <label htmlFor="inactivity-minutes" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Minutes of inactivity
                    <select id="inactivity-minutes" value={minutes} onChange={event => setMinutes(Number(event.target.value) as 5 | 10 | 15)}
                        className="mt-2 block min-w-48 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:border-teal-500/30 dark:bg-surface-input dark:text-white">
                        <option value={5}>5 minutes</option><option value={10}>10 minutes</option><option value={15}>15 minutes (default)</option>
                    </select>
                </label>
                <button type="button" onClick={() => void save()} disabled={saving || minutes === saved}
                    className="rounded-xl bg-teal-600 px-5 py-3 font-semibold text-white hover:bg-teal-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500">
                    {saving ? 'Saving…' : 'Save timeout'}
                </button>
            </div>}
            <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">Reducing this limit can immediately expire sessions that have already been idle longer than the new limit, including your own.</p>
        </section>
        <p className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-white/10 dark:bg-surface-card dark:text-slate-300">
            Two-factor requirements, retention schedules, and audit export are not configurable here. They require approved policy and a separate implementation before administrators can rely on them.
        </p>
    </div>;
}
