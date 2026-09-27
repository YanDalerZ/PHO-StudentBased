import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Clipboard, Download, Loader2, Plus, QrCode, ShieldX } from 'lucide-react';
import toast from 'react-hot-toast';
import { qrSvg } from '../../lib/qrCode';
import {
    createRegistrationInvitation,
    getRegistrationInvitations,
    revokeRegistrationInvitation,
    type CreatedRegistrationInvitation,
    type InvitationSchool,
    type RegistrationInvitation,
} from '../../services/phase2Api';

const inputClasses = 'w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all';

export default function InvitationManagement() {
    const [invitations, setInvitations] = useState<RegistrationInvitation[]>([]);
    const [schools, setSchools] = useState<InvitationSchool[]>([]);
    const [schoolId, setSchoolId] = useState('');
    const [expiresInDays, setExpiresInDays] = useState(7);
    const [submissionLimit, setSubmissionLimit] = useState(100);
    const [created, setCreated] = useState<CreatedRegistrationInvitation | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [revokingId, setRevokingId] = useState<number | null>(null);
    const [revocationReason, setRevocationReason] = useState('');

    const load = useCallback(async () => {
        try {
            const response = await getRegistrationInvitations({ pageSize: 100 });
            setInvitations(response.data);
            setSchools(response.meta.availableSchools);
        } catch { toast.error('Unable to load registration invitations.'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => void load(), 0);
        return () => window.clearTimeout(timer);
    }, [load]);
    const activeSchools = useMemo(() => new Set(invitations.filter((item) => item.status === 'active').map((item) => item.school_id)), [invitations]);

    const create = async (event: FormEvent) => {
        event.preventDefault();
        if (!schoolId) return;
        setSaving(true); setCreated(null);
        try {
            const result = await createRegistrationInvitation({ school_id: Number(schoolId), expires_in_days: expiresInDays, submission_limit: submissionLimit });
            setCreated(result); setSchoolId(''); toast.success('Invitation created. Download the QR now.');
            await load();
        } catch { toast.error('Unable to create invitation. The school may already have an active QR.'); }
        finally { setSaving(false); }
    };

    const revoke = async () => {
        if (!revokingId || !revocationReason.trim()) return;
        setSaving(true);
        try {
            await revokeRegistrationInvitation(revokingId, revocationReason.trim());
            setRevokingId(null); setRevocationReason(''); toast.success('Invitation revoked.'); await load();
        } catch { toast.error('Unable to revoke invitation.'); }
        finally { setSaving(false); }
    };

    const downloadQr = () => {
        if (!created) return;
        const blob = new Blob([qrSvg(created.registration_url, 1200)], { type: 'image/svg+xml' });
        const href = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = href; anchor.download = `pho-registration-school-${created.school_id}.svg`; anchor.click();
        URL.revokeObjectURL(href);
    };

    return <div className="max-w-6xl mx-auto space-y-6 font-outfit">
        <header><p className="text-sm font-semibold text-teal-600">Patient Information</p><h1 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">QR invitations</h1><p className="text-slate-500 dark:text-slate-400 mt-2">Create one school-bound public registration link, download it locally, and revoke it when needed.</p></header>
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            <form onSubmit={create} className="xl:col-span-2 bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xl space-y-5">
                <div className="flex items-center gap-3"><div className="p-3 rounded-2xl bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400"><Plus className="w-6 h-6" /></div><div><h2 className="font-bold text-slate-900 dark:text-white">Create invitation</h2><p className="text-xs text-slate-500">The server controls the registration host.</p></div></div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Assigned school<select className={inputClasses} required value={schoolId} onChange={(e) => setSchoolId(e.target.value)}><option value="">Select a school</option>{schools.map((school) => <option key={school.id} value={school.id} disabled={activeSchools.has(school.id)}>{school.name}{activeSchools.has(school.id) ? ' — active QR exists' : ''}</option>)}</select></label>
                <div className="grid grid-cols-2 gap-4"><label className="text-sm font-medium text-slate-700 dark:text-slate-300">Days<input className={inputClasses} type="number" min={1} max={7} required value={expiresInDays} onChange={(e) => setExpiresInDays(Number(e.target.value))} /></label><label className="text-sm font-medium text-slate-700 dark:text-slate-300">Submission cap<input className={inputClasses} type="number" min={1} max={100} required value={submissionLimit} onChange={(e) => setSubmissionLimit(Number(e.target.value))} /></label></div>
                <button disabled={saving || !schoolId} className="w-full py-3.5 px-4 rounded-xl bg-primary-action hover:bg-teal-500 text-white font-semibold shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60">{saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />} Generate QR</button>
            </form>
            <section className="xl:col-span-3 bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xl">
                {!created ? <div className="h-full min-h-72 flex flex-col items-center justify-center text-center text-slate-500"><QrCode className="w-12 h-12 text-slate-300 mb-4" /><p className="font-medium text-slate-700 dark:text-slate-200">A new QR appears here once.</p><p className="text-sm mt-1 max-w-sm">Download it immediately. Raw invitation tokens are not stored for later display.</p></div> : <div className="grid sm:grid-cols-[220px_1fr] gap-6 items-center"><img className="w-full max-w-56 mx-auto rounded-2xl border border-slate-200" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(created.registration_url))}`} alt="New registration invitation QR code" /><div className="min-w-0"><div className="flex items-center gap-2 text-emerald-600 font-semibold"><Check className="w-5 h-5" /> Ready to distribute</div><p className="mt-3 text-sm text-slate-600 dark:text-slate-300 break-all">{created.registration_url}</p><p className="mt-2 text-xs text-slate-500">Expires {new Date(created.expires_at).toLocaleString()}</p><div className="flex flex-wrap gap-3 mt-5"><button type="button" onClick={downloadQr} className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold flex items-center gap-2"><Download className="w-4 h-4" /> Download SVG</button><button type="button" onClick={() => void navigator.clipboard.writeText(created.registration_url).then(() => toast.success('Link copied.'))} className="px-4 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-semibold flex items-center gap-2"><Clipboard className="w-4 h-4" /> Copy link</button></div></div></div>}
            </section>
        </div>
        <section className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xl"><h2 className="text-lg font-bold text-slate-900 dark:text-white">Invitation history</h2>{loading ? <div className="py-12 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-teal-600" /></div> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-3xl"><thead><tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200"><th className="py-3 px-3">School</th><th className="py-3 px-3">Status</th><th className="py-3 px-3">Expires</th><th className="py-3 px-3">Use</th><th className="py-3 px-3">Action</th></tr></thead><tbody>{invitations.map((item) => <tr key={item.id} className="border-b border-slate-100 text-sm"><td className="py-4 px-3 font-medium text-slate-900 dark:text-white">{item.school_name}</td><td className="py-4 px-3"><span className={item.status === 'active' ? 'px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200'}>{item.status}</span></td><td className="py-4 px-3 text-slate-600 dark:text-slate-300">{new Date(item.expires_at).toLocaleString()}</td><td className="py-4 px-3 text-slate-600 dark:text-slate-300">{item.submission_count} / {item.submission_limit}</td><td className="py-4 px-3">{item.status === 'active' && <button onClick={() => { setRevokingId(item.id); setRevocationReason(''); }} className="text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1"><ShieldX className="w-4 h-4" /> Revoke</button>}</td></tr>)}</tbody></table>{invitations.length === 0 && <p className="text-center text-slate-500 py-8">No invitations yet.</p>}</div>}</section>
        {revokingId && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4"><div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl"><h2 className="text-xl font-bold text-slate-900">Revoke invitation</h2><p className="text-sm text-slate-500 mt-2">The public link will stop working immediately.</p><label className="block text-sm font-medium text-slate-700 mt-5">Reason<textarea className={inputClasses} rows={3} maxLength={500} value={revocationReason} onChange={(e) => setRevocationReason(e.target.value)} /></label><div className="flex justify-end gap-3 mt-5"><button onClick={() => setRevokingId(null)} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700">Cancel</button><button disabled={saving || !revocationReason.trim()} onClick={() => void revoke()} className="px-4 py-2.5 rounded-xl bg-rose-600 text-white font-semibold disabled:opacity-60">Revoke</button></div></div></div>}
    </div>;
}
