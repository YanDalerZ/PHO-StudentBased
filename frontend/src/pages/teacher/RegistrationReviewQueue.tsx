import { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle, CheckCircle2, ChevronRight, Clock3, Link2,
    Loader2, RefreshCw, ShieldCheck, UserRoundCheck, X, XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../../lib/utils';
import {
    approveRegistrationSubmission, getRegistrationSubmission, getRegistrationSubmissions,
    mergeRegistrationSubmission, rejectRegistrationSubmission, type DuplicateCandidate,
    type RegistrationStatus, type RegistrationSubmission, type RejectionReason,
} from '../../services/phase2Api';

type QueueTab = RegistrationStatus | 'possible_duplicate';
type ActionMode = 'approve' | 'link' | 'reject' | null;

const tabs: { key: QueueTab; label: string; icon: typeof Clock3 }[] = [
    { key: 'pending', label: 'Pending', icon: Clock3 },
    { key: 'possible_duplicate', label: 'Possible duplicates', icon: AlertTriangle },
    { key: 'approved', label: 'Approved', icon: CheckCircle2 },
    { key: 'rejected', label: 'Rejected', icon: XCircle },
];
const fieldClass = 'mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 dark:border-white/10 dark:bg-slate-900 dark:text-white';
interface ApiErrorShape { response?: { data?: { error?: { message?: string } } } }
const errorMessage = (error: unknown, fallback: string) =>
    (error as ApiErrorShape).response?.data?.error?.message ?? fallback;
const fullName = (person: { first_name: string; middle_name?: string | null; last_name: string; suffix?: string | null }) =>
    [person.first_name, person.middle_name, person.last_name, person.suffix].filter(Boolean).join(' ');
const dateText = (value: string | null | undefined) => value
    ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString()
    : 'Not provided';

function StatusBadge({ submission }: { submission: RegistrationSubmission }) {
    const duplicate = submission.status === 'pending' && submission.duplicate_review?.is_possible_duplicate;
    const styles = duplicate
        ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
        : submission.status === 'approved'
            ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
            : submission.status === 'rejected'
                ? 'bg-rose-500/10 text-rose-700 border-rose-500/20'
                : 'bg-sky-500/10 text-sky-700 border-sky-500/20';
    return <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold capitalize', styles)}>
        {duplicate ? 'Possible duplicate' : submission.status}
    </span>;
}

function ComparisonRow({ label, submitted, candidate }: { label: string; submitted: string; candidate: string }) {
    const differs = submitted.trim().toLowerCase() !== candidate.trim().toLowerCase();
    return <div className="grid grid-cols-[105px_1fr_1fr] gap-3 border-t border-slate-100 px-4 py-3 text-sm dark:border-white/10">
        <span className="font-medium text-slate-500">{label}</span>
        <span className="text-slate-800 dark:text-slate-100">{submitted || 'Not provided'}</span>
        <span className={cn('text-slate-800 dark:text-slate-100', differs && 'font-semibold text-amber-700 dark:text-amber-400')}>{candidate || 'Not provided'}</span>
    </div>;
}

function CandidateComparison({ submission, candidate, selected, onSelect }: {
    submission: RegistrationSubmission; candidate: DuplicateCandidate; selected: boolean; onSelect: () => void;
}) {
    const payload = submission.payload;
    return <article className={cn('overflow-hidden rounded-2xl border bg-white dark:bg-surface-card', selected ? 'border-teal-500 ring-2 ring-teal-500/20' : 'border-slate-200 dark:border-white/10')}>
        <button type="button" onClick={onSelect} className="flex w-full items-center justify-between gap-4 p-4 text-left">
            <div><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-900 dark:text-white">{fullName(candidate)}</p>
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', candidate.confidence === 'exact' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700')}>{candidate.confidence} match</span>
            </div><p className="mt-1 text-xs text-slate-500">{candidate.match_reasons.join(' · ')}</p></div>
            <span className={cn('h-5 w-5 rounded-full border-2', selected ? 'border-teal-600 bg-teal-600 ring-4 ring-teal-100' : 'border-slate-300')} />
        </button>
        <div className="grid grid-cols-[105px_1fr_1fr] gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900">
            <span>Field</span><span>Submission</span><span>Existing</span>
        </div>
        <ComparisonRow label="LRN" submitted={payload.student_lrn} candidate={candidate.student_lrn ?? ''} />
        <ComparisonRow label="Name" submitted={fullName(payload)} candidate={fullName(candidate)} />
        <ComparisonRow label="Birth date" submitted={dateText(payload.date_of_birth)} candidate={dateText(candidate.date_of_birth)} />
        <ComparisonRow label="Sex" submitted={payload.sex} candidate={candidate.sex} />
        <ComparisonRow label="School" submitted={submission.school_name} candidate={candidate.school_name} />
        <ComparisonRow label="Grade / section" submitted={[payload.grade_level, payload.section].filter(Boolean).join(' / ')} candidate={[candidate.grade_level, candidate.section].filter(Boolean).join(' / ')} />
        <ComparisonRow label="Guardian" submitted={String(payload.parent_guardian_name ?? '')} candidate={candidate.parent_guardian_name ?? ''} />
        <ComparisonRow label="Contact" submitted={String(payload.parent_guardian_contact ?? '')} candidate={candidate.parent_guardian_contact ?? ''} />
    </article>;
}

export default function RegistrationReviewQueue() {
    const [tab, setTab] = useState<QueueTab>('pending');
    const [submissions, setSubmissions] = useState<RegistrationSubmission[]>([]);
    const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
    const [selected, setSelected] = useState<RegistrationSubmission | null>(null);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [actionMode, setActionMode] = useState<ActionMode>(null);
    const [decisionReason, setDecisionReason] = useState('');
    const [targetStudentId, setTargetStudentId] = useState<number | null>(null);
    const [rejectionCode, setRejectionCode] = useState('');
    const [rejectionNote, setRejectionNote] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await getRegistrationSubmissions({
                status: tab === 'possible_duplicate' ? 'pending' : tab,
                possible_duplicate: tab === 'possible_duplicate' ? true : undefined,
                pageSize: 100,
            });
            setSubmissions(response.data);
            setRejectionReasons(response.meta.rejectionReasons);
        } catch (error) { toast.error(errorMessage(error, 'Unable to load the review queue.')); }
        finally { setLoading(false); }
    }, [tab]);

    useEffect(() => {
        const timer = window.setTimeout(() => void load(), 0);
        return () => window.clearTimeout(timer);
    }, [load]);

    const openDetail = async (submission: RegistrationSubmission) => {
        setSelected(submission); setDetailLoading(true); setActionMode(null);
        setDecisionReason(''); setTargetStudentId(null); setRejectionCode(''); setRejectionNote('');
        try {
            const detail = await getRegistrationSubmission(submission.id);
            setSelected(detail);
            if (detail.review_policy?.rejection_reasons) setRejectionReasons(detail.review_policy.rejection_reasons);
        } catch (error) { toast.error(errorMessage(error, 'Unable to load submission details.')); }
        finally { setDetailLoading(false); }
    };

    const candidates = selected?.duplicate_review?.candidates ?? [];
    const hardStop = Boolean(selected?.duplicate_review?.has_exact_lrn_match || selected?.duplicate_review?.has_pending_lrn_match);
    const chosenCandidate = candidates.find((item) => item.id === targetStudentId);

    const completeAction = async () => {
        if (!selected || !actionMode) return;
        setSaving(true);
        try {
            if (actionMode === 'approve') {
                await approveRegistrationSubmission(selected.id, decisionReason.trim());
                toast.success('Submission approved and canonical records created.');
            } else if (actionMode === 'link' && targetStudentId) {
                await mergeRegistrationSubmission(selected.id, targetStudentId, decisionReason.trim());
                toast.success('Submission linked. Existing canonical fields were unchanged.');
            } else if (actionMode === 'reject') {
                await rejectRegistrationSubmission(selected.id, rejectionCode, rejectionNote.trim() || undefined);
                toast.success('Submission rejected.');
            }
            setSelected(null); setActionMode(null); await load();
        } catch (error) { toast.error(errorMessage(error, 'Unable to save the review decision.')); }
        finally { setSaving(false); }
    };

    const canSubmit = actionMode === 'approve'
        ? !hardStop && Boolean(decisionReason.trim())
        : actionMode === 'link'
            ? Boolean(targetStudentId && decisionReason.trim())
            : actionMode === 'reject'
                ? Boolean(rejectionCode && (rejectionCode !== 'OTHER' || rejectionNote.trim()))
                : false;

    return <div className="mx-auto max-w-7xl space-y-6 font-outfit">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><p className="text-sm font-semibold text-teal-600">Patient Information</p><h1 className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">Registration review queue</h1><p className="mt-2 text-slate-500 dark:text-slate-400">Review quarantined public submissions before they become canonical records.</p></div>
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm disabled:opacity-60 dark:border-white/10 dark:bg-surface-card dark:text-slate-200"><RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh</button>
        </header>
        <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-surface-card">
            {tabs.map(({ key, label, icon: Icon }) => <button key={key} type="button" onClick={() => { setTab(key); setSelected(null); }} className={cn('flex min-w-fit items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition', tab === key ? 'bg-teal-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5')}><Icon className="h-4 w-4" />{label}</button>)}
        </div>
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-surface-card">
            {loading ? <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>
                : submissions.length === 0 ? <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center"><ShieldCheck className="h-12 w-12 text-emerald-500" /><p className="mt-4 font-semibold text-slate-800 dark:text-white">No submissions in this view</p><p className="mt-1 text-sm text-slate-500">The queue is clear for the selected status.</p></div>
                    : <div className="divide-y divide-slate-100 dark:divide-white/10">{submissions.map((submission) => <button key={submission.id} type="button" onClick={() => void openDetail(submission)} className="grid w-full grid-cols-1 items-center gap-3 p-5 text-left transition hover:bg-slate-50 sm:grid-cols-[1.5fr_1fr_auto_auto] dark:hover:bg-white/5"><div><p className="font-bold text-slate-900 dark:text-white">{fullName(submission.payload)}</p><p className="mt-1 text-sm text-slate-500">LRN {submission.payload.student_lrn}</p></div><div><p className="text-sm font-medium text-slate-700 dark:text-slate-200">{submission.school_name}</p><p className="mt-1 text-xs text-slate-500">Submitted {new Date(submission.submitted_at).toLocaleString()}</p></div><StatusBadge submission={submission} /><ChevronRight className="hidden h-5 w-5 text-slate-400 sm:block" /></button>)}</div>}
        </section>

        {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-slate-50 shadow-2xl dark:bg-slate-950">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-surface-card"><div><div className="flex flex-wrap items-center gap-3"><h2 className="text-xl font-bold text-slate-900 dark:text-white">{fullName(selected.payload)}</h2><StatusBadge submission={selected} /></div><p className="mt-1 text-sm text-slate-500">{selected.school_name} · LRN {selected.payload.student_lrn}</p></div><button type="button" onClick={() => setSelected(null)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button></div>
            <div className="space-y-6 p-5">{detailLoading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div> : <>
                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
                    ['Birth date', dateText(selected.payload.date_of_birth)], ['Sex', selected.payload.sex],
                    ['Grade / section', [selected.payload.grade_level, selected.payload.section].filter(Boolean).join(' / ') || 'Not provided'],
                    ['Guardian', String(selected.payload.parent_guardian_name ?? 'Not provided')],
                ].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-surface-card"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 font-medium text-slate-900 dark:text-white">{value}</p></div>)}</section>
                {selected.duplicate_review?.is_possible_duplicate && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-bold">Duplicate review required</p><p className="mt-1">{hardStop ? 'An exact or pending LRN match blocks approval as a new student.' : 'A same-school name and birth-date match needs reviewer judgment.'}</p></div></div></div>}
                {candidates.length > 0 && <section className="space-y-3"><div><h3 className="font-bold text-slate-900 dark:text-white">Verified same-school candidates</h3><p className="text-sm text-slate-500">Select a candidate only when linking. Linking preserves existing canonical fields.</p></div>{candidates.map((candidate) => <CandidateComparison key={candidate.id} submission={selected} candidate={candidate} selected={candidate.id === targetStudentId} onSelect={() => setTargetStudentId(candidate.id)} />)}</section>}
                {selected.status === 'pending' ? <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-surface-card">
                    <h3 className="font-bold text-slate-900 dark:text-white">Review decision</h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <button type="button" disabled={hardStop} onClick={() => setActionMode('approve')} className={cn('rounded-xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-40', actionMode === 'approve' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-white/10')}><UserRoundCheck className="h-5 w-5 text-emerald-600" /><p className="mt-2 font-semibold text-slate-900 dark:text-white">Approve as new</p><p className="mt-1 text-xs text-slate-500">Create student and patient records.</p></button>
                        <button type="button" disabled={candidates.length === 0} onClick={() => setActionMode('link')} className={cn('rounded-xl border p-4 text-left disabled:cursor-not-allowed disabled:opacity-40', actionMode === 'link' ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10' : 'border-slate-200 dark:border-white/10')}><Link2 className="h-5 w-5 text-amber-600" /><p className="mt-2 font-semibold text-slate-900 dark:text-white">Link to existing</p><p className="mt-1 text-xs text-slate-500">Link only; do not overwrite fields.</p></button>
                        <button type="button" onClick={() => setActionMode('reject')} className={cn('rounded-xl border p-4 text-left', actionMode === 'reject' ? 'border-rose-500 bg-rose-50 dark:bg-rose-500/10' : 'border-slate-200 dark:border-white/10')}><XCircle className="h-5 w-5 text-rose-600" /><p className="mt-2 font-semibold text-slate-900 dark:text-white">Reject</p><p className="mt-1 text-xs text-slate-500">Record a controlled reason.</p></button>
                    </div>
                    {(actionMode === 'approve' || actionMode === 'link') && <div className="mt-4">{actionMode === 'link' && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{chosenCandidate ? `Linking to ${fullName(chosenCandidate)}. Existing fields remain unchanged.` : 'Select a verified candidate above.'}</p>}<label className="mt-3 block text-sm font-semibold text-slate-700 dark:text-slate-200">Reviewer reason<textarea rows={3} maxLength={500} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} className={fieldClass} placeholder="Record the evidence used for this decision." /></label></div>}
                    {actionMode === 'reject' && <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Reason<select value={rejectionCode} onChange={(event) => setRejectionCode(event.target.value)} className={fieldClass}><option value="">Select a reason</option>{rejectionReasons.map((reason) => <option key={reason.code} value={reason.code}>{reason.label}</option>)}</select></label><label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Note {rejectionCode === 'OTHER' ? '(required)' : '(optional)'}<textarea rows={3} maxLength={500} value={rejectionNote} onChange={(event) => setRejectionNote(event.target.value)} className={fieldClass} /></label></div>}
                    {actionMode && <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => setActionMode(null)} className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button><button type="button" disabled={!canSubmit || saving} onClick={() => void completeAction()} className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save decision</button></div>}
                </section> : <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-surface-card"><h3 className="font-bold text-slate-900 dark:text-white">Recorded decision</h3><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{selected.decision_reason || 'No reason recorded.'}</p><p className="mt-2 text-xs text-slate-500">Reviewed {selected.reviewed_at ? new Date(selected.reviewed_at).toLocaleString() : 'date unavailable'}</p></section>}
            </>}</div>
        </div></div>}
    </div>;
}
