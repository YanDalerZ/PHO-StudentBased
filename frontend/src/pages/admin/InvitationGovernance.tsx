import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, ShieldX } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    getInvitationPolicy, listAdminInvitations, revokeAdminInvitation,
    updateInvitationPolicy, type AdminInvitationMetadata, type InvitationPolicy,
} from '../../services/invitationGovernance';

const inputClass = 'w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-teal-500/30 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50';
const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300';

export default function InvitationGovernance() {
    const [policy, setPolicy] = useState<InvitationPolicy | null>(null);
    const [origins, setOrigins] = useState<string[]>([]);
    const [invitations, setInvitations] = useState<AdminInvitationMetadata[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [status, setStatus] = useState('');
    const [schoolId, setSchoolId] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [revokeId, setRevokeId] = useState<number | null>(null);
    const [reason, setReason] = useState('');

    const loadInvitations = useCallback(async () => {
        try {
            const result = await listAdminInvitations({ page, pageSize: 20,
                ...(status ? { status } : {}),
                ...(schoolId ? { school_id: Number(schoolId) } : {}),
            });
            setInvitations(result.data); setTotal(result.meta.total);
        } catch { toast.error('Unable to load invitation metadata.'); }
    }, [page, status, schoolId]);

    useEffect(() => {
        let active = true;
        void getInvitationPolicy().then(result => {
            if (active) { setPolicy(result.data); setOrigins(result.approved_origins); }
        }).catch(() => toast.error('Unable to load invitation policy.'))
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, []);
    useEffect(() => {
        const timer = window.setTimeout(() => void loadInvitations(), 0);
        return () => window.clearTimeout(timer);
    }, [loadInvitations]);

    const save = async (event: FormEvent) => {
        event.preventDefault();
        if (!policy) return;
        setSaving(true);
        try { setPolicy(await updateInvitationPolicy(policy)); toast.success('Invitation policy saved.'); }
        catch { toast.error('Unable to save invitation policy. Check the approved host and limits.'); }
        finally { setSaving(false); }
    };
    const revoke = async () => {
        if (!revokeId || !reason.trim()) return;
        setSaving(true);
        try {
            await revokeAdminInvitation(revokeId, reason.trim());
            setRevokeId(null); setReason(''); toast.success('Invitation revoked.');
            await loadInvitations();
        } catch { toast.error('Unable to revoke invitation. It may no longer be active.'); }
        finally { setSaving(false); }
    };

    const numberField = (key: keyof InvitationPolicy, label: string, min: number, max: number) => (
        <label className={labelClass} key={key}>{label}
            <input className={inputClass} type="number" min={min} max={max} required value={policy?.[key] ?? ''}
                onChange={event => setPolicy(current => current && ({ ...current, [key]: Number(event.target.value) }))} />
        </label>
    );
    const textField = (key: 'privacyNotice' | 'retentionNotice' | 'contact', label: string, maxLength: number) => (
        <label className={labelClass} key={key}>{label}
            <textarea className={inputClass} rows={key === 'privacyNotice' ? 4 : 2} minLength={key === 'privacyNotice' ? 20 : key === 'retentionNotice' ? 10 : 3}
                maxLength={maxLength} required value={policy?.[key] ?? ''}
                onChange={event => setPolicy(current => current && ({ ...current, [key]: event.target.value }))} />
        </label>
    );

    return <div className="max-w-6xl mx-auto space-y-6 font-outfit">
        <header><p className="text-sm font-semibold text-teal-600">Admin governance</p>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">QR invitation policy</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Control new QR limits and public intake settings. Inspect invitation metadata across schools without exposing tokens or submissions.</p>
        </header>
        {loading ? <Loader2 className="animate-spin text-teal-600" /> : policy && <form onSubmit={save} className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-3xl p-6 sm:p-10 shadow-xl space-y-6">
            <div><h2 className="text-xl font-bold text-slate-900 dark:text-white">Public registration policy</h2>
                <p className="text-sm text-slate-500 mt-1">Expiry and submission caps apply to new invitations. Host changes affect new QR links. Rate and notice changes apply to subsequent public requests. Existing invitations keep their issued expiry and cap.</p></div>
            <label className={labelClass}>Approved public host
                <select className={inputClass} value={policy.origin} onChange={event => setPolicy({ ...policy, origin: event.target.value })}>
                    {origins.map(origin => <option value={origin} key={origin}>{origin}</option>)}
                </select>
                <span className="block text-xs text-slate-500 mt-1">Additional hosts must first be added to the deployment allowlist. Production hosts must use HTTPS.</span>
            </label>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {numberField('maxExpiryDays', 'Maximum QR lifetime (days)', 1, 7)}
                {numberField('maxSubmissionLimit', 'Maximum submissions per QR', 1, 100)}
                {numberField('rateWindowMs', 'Rate window (milliseconds)', 1000, 86400000)}
                {numberField('rateLimitPerIp', 'Attempts per IP per window', 1, 10000)}
                {numberField('rateLimitPerInvitation', 'Attempts per QR per window', 1, 100000)}
                {numberField('maxBodyBytes', 'Maximum public body size (bytes)', 1024, 262144)}
            </div>
            {textField('privacyNotice', 'Privacy and data-use notice', 4000)}
            {textField('retentionNotice', 'Retention notice', 1000)}
            {textField('contact', 'PHO contact', 300)}
            <p className="text-xs text-slate-500">This notice does not schedule record deletion. Retention and disposal require a separately approved operational policy.</p>
            <button disabled={saving} className="px-5 py-3 rounded-xl bg-primary-action hover:bg-teal-500 text-white font-semibold disabled:opacity-60">{saving ? 'Saving…' : 'Save QR policy'}</button>
        </form>}
        <section className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xl space-y-4">
            <div><h2 className="text-xl font-bold text-slate-900 dark:text-white">Invitation metadata</h2><p className="text-sm text-slate-500">No raw QR token or clinical submission content is returned here.</p></div>
            <div className="flex flex-wrap gap-3">
                <input className={inputClass} aria-label="Filter school ID" placeholder="School ID" type="number" min={1} value={schoolId} onChange={event => { setSchoolId(event.target.value); setPage(1); }} />
                <select className={inputClass} aria-label="Filter invitation status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="active">Active</option><option value="expired">Expired</option><option value="revoked">Revoked</option></select>
            </div>
            <div className="overflow-x-auto"><table className="w-full min-w-3xl text-sm"><thead><tr className="text-left text-slate-500 border-b border-slate-200"><th className="p-3">School</th><th className="p-3">Status</th><th className="p-3">Created</th><th className="p-3">Expires</th><th className="p-3">Use</th><th className="p-3">Action</th></tr></thead><tbody>
                {invitations.map(item => <tr key={item.id} className="border-b border-slate-100 text-slate-700 dark:text-slate-300"><td className="p-3">{item.school_name} <span className="text-xs text-slate-500">#{item.school_id}</span></td><td className="p-3">{item.status}</td><td className="p-3">{new Date(item.created_at).toLocaleString()}</td><td className="p-3">{new Date(item.expires_at).toLocaleString()}</td><td className="p-3">{item.submission_count} / {item.submission_limit}</td><td className="p-3">{item.status === 'active' && <button className="text-rose-600 font-semibold inline-flex gap-1 items-center" onClick={() => { setRevokeId(item.id); setReason(''); }}><ShieldX className="w-4 h-4" /> Revoke</button>}</td></tr>)}
            </tbody></table>{invitations.length === 0 && <p className="text-center text-slate-500 py-8">No invitations match these filters.</p>}</div>
            <div className="flex justify-between items-center text-sm"><span className="text-slate-500">{total} invitations</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-2 rounded-xl border disabled:opacity-50">Previous</button><button disabled={page * 20 >= total} onClick={() => setPage(page + 1)} className="px-3 py-2 rounded-xl border disabled:opacity-50">Next</button></div></div>
        </section>
        {revokeId !== null && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"><div className="bg-white dark:bg-surface-card rounded-3xl p-6 max-w-md w-full space-y-4"><h2 className="text-xl font-bold text-slate-900 dark:text-white">Revoke invitation #{revokeId}</h2><p className="text-sm text-slate-500">This stops the public link immediately. The reason is stored with the invitation but excluded from audit details.</p><label className={labelClass}>Reason<textarea className={inputClass} minLength={1} maxLength={500} required value={reason} onChange={event => setReason(event.target.value)} /></label><div className="flex justify-end gap-3"><button onClick={() => setRevokeId(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700">Cancel</button><button disabled={saving || !reason.trim()} onClick={() => void revoke()} className="px-4 py-2 rounded-xl bg-rose-600 text-white disabled:opacity-50">Confirm revoke</button></div></div></div>}
    </div>;
}
