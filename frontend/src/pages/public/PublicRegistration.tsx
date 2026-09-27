import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Loader2, School, ShieldCheck } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { getPublicInvitation, submitPublicRegistration, type PublicRegistrationPayload } from '../../services/phase2Api';

type Invitation = Awaited<ReturnType<typeof getPublicInvitation>>;
interface FormState {
    student_lrn: string; first_name: string; middle_name: string; last_name: string; suffix: string;
    date_of_birth: string; sex: '' | 'Male' | 'Female'; grade_level: string; section: string;
    street_address: string; parent_guardian_name: string; parent_guardian_contact: string; guardian_consent: boolean;
}
const initialForm: FormState = { student_lrn: '', first_name: '', middle_name: '', last_name: '', suffix: '', date_of_birth: '', sex: '', grade_level: '', section: '', street_address: '', parent_guardian_name: '', parent_guardian_contact: '', guardian_consent: false };
const inputClasses = 'w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all';
const labelClasses = 'block text-sm font-medium text-slate-700 mb-2';

export default function PublicRegistration() {
    const { token = '' } = useParams<{ token: string }>();
    const isTokenValid = /^[a-f0-9]{32}$/i.test(token);
    const [invitation, setInvitation] = useState<Invitation | null>(null);
    const [form, setForm] = useState<FormState>(initialForm);
    const [loading, setLoading] = useState(isTokenValid);
    const [submitting, setSubmitting] = useState(false);
    const [unavailable, setUnavailable] = useState(!isTokenValid);
    const [error, setError] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const idempotencyKey = useRef<string | null>(null);

    useEffect(() => {
        let active = true;
        if (!isTokenValid) return;
        void getPublicInvitation(token)
            .then((data) => { if (active) setInvitation(data); })
            .catch(() => { if (active) setUnavailable(true); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [isTokenValid, token]);

    const update = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
        setForm((current) => ({ ...current, [key]: value }));
        idempotencyKey.current = null;
        setError('');
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!invitation || !form.sex || !form.guardian_consent) return;
        setSubmitting(true); setError('');
        if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();
        const payload: PublicRegistrationPayload = {
            student_lrn: form.student_lrn, first_name: form.first_name, middle_name: form.middle_name || null,
            last_name: form.last_name, suffix: form.suffix || null, date_of_birth: form.date_of_birth, sex: form.sex,
            municipality_id: invitation.school.municipality_id, barangay_id: invitation.school.barangay_id,
            street_address: form.street_address || null, grade_level: form.grade_level || null, section: form.section || null,
            parent_guardian_name: form.parent_guardian_name, parent_guardian_contact: form.parent_guardian_contact,
            guardian_consent: true, privacy_notice_version: invitation.form.privacy_notice_version,
        };
        try {
            await submitPublicRegistration(token, payload, idempotencyKey.current);
            setSubmitted(true); idempotencyKey.current = null;
        } catch {
            setError('We could not submit the form. Check the information and try again.');
        } finally { setSubmitting(false); }
    };

    if (loading) return <StatusCard icon={<Loader2 className="w-8 h-8 animate-spin" />} title="Opening registration form" message="Please wait." />;
    if (!isTokenValid || unavailable || !invitation) return <StatusCard icon={<AlertCircle className="w-8 h-8" />} title="Registration unavailable" message="This registration link cannot be used. Please contact the school for a current QR code." />;
    if (submitted) return <StatusCard icon={<CheckCircle2 className="w-9 h-9" />} title="Submission received" message="Your information is pending review by authorized school staff. This receipt does not mean the student has been registered or approved." />;

    return (
        <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 font-outfit relative overflow-hidden">
            <div className="absolute -top-24 -left-20 w-2/5 h-2/5 bg-teal-100/50 rounded-full blur-[120px]" />
            <main className="relative z-10 max-w-3xl mx-auto space-y-5">
                <header className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xl">
                    <div className="flex items-start gap-4"><div className="p-3 bg-teal-50 border border-teal-100 rounded-2xl"><School className="w-7 h-7 text-teal-600" /></div><div><p className="text-xs font-semibold uppercase tracking-wider text-teal-700">PHO Student Registration</p><h1 className="text-2xl font-bold text-slate-900 mt-1">{invitation.school.name}</h1><p className="text-sm text-slate-600 mt-1">{invitation.school.barangay_name}, {invitation.school.municipality_name}</p><p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5"><Clock3 className="w-4 h-4" /> Link available until {new Date(invitation.expires_at).toLocaleString()}</p></div></div>
                </header>
                <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-xl space-y-8">
                    <section><h2 className="text-lg font-bold text-slate-900">Student information</h2><p className="text-sm text-slate-500 mt-1">Fields marked required must be completed before review.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5">
                            <Field label="Learner Reference Number (LRN)" required wide><input className={inputClasses} inputMode="numeric" pattern="[0-9]{12}" maxLength={12} required value={form.student_lrn} onChange={(e) => update('student_lrn', e.target.value.replace(/\D/g, ''))} /></Field>
                            <Field label="First name" required><input className={inputClasses} maxLength={100} required value={form.first_name} onChange={(e) => update('first_name', e.target.value)} /></Field>
                            <Field label="Middle name"><input className={inputClasses} maxLength={100} value={form.middle_name} onChange={(e) => update('middle_name', e.target.value)} /></Field>
                            <Field label="Last name" required><input className={inputClasses} maxLength={100} required value={form.last_name} onChange={(e) => update('last_name', e.target.value)} /></Field>
                            <Field label="Suffix"><input className={inputClasses} maxLength={20} value={form.suffix} onChange={(e) => update('suffix', e.target.value)} /></Field>
                            <Field label="Date of birth" required><input className={inputClasses} type="date" max={new Date().toISOString().slice(0, 10)} required value={form.date_of_birth} onChange={(e) => update('date_of_birth', e.target.value)} /></Field>
                            <Field label="Sex" required><select className={inputClasses} required value={form.sex} onChange={(e) => update('sex', e.target.value as FormState['sex'])}><option value="">Select</option><option value="Male">Male</option><option value="Female">Female</option></select></Field>
                            <Field label="Grade level"><input className={inputClasses} maxLength={30} value={form.grade_level} onChange={(e) => update('grade_level', e.target.value)} /></Field>
                            <Field label="Section"><input className={inputClasses} maxLength={100} value={form.section} onChange={(e) => update('section', e.target.value)} /></Field>
                            <Field label="Street address" wide><textarea className={inputClasses} rows={2} maxLength={300} value={form.street_address} onChange={(e) => update('street_address', e.target.value)} /></Field>
                        </div>
                    </section>
                    <section className="border-t border-slate-200 pt-7"><h2 className="text-lg font-bold text-slate-900">Parent or guardian</h2><div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-5"><Field label="Full name" required><input className={inputClasses} maxLength={200} required value={form.parent_guardian_name} onChange={(e) => update('parent_guardian_name', e.target.value)} /></Field><Field label="Contact number" required><input className={inputClasses} inputMode="tel" maxLength={20} required value={form.parent_guardian_contact} onChange={(e) => update('parent_guardian_contact', e.target.value)} /></Field></div></section>
                    <section className="rounded-2xl border border-teal-100 bg-teal-50 p-5 space-y-3"><div className="flex items-center gap-2 text-teal-800 font-semibold"><ShieldCheck className="w-5 h-5" /> Privacy and consent</div><p className="text-sm text-slate-700">{invitation.form.privacy.notice}</p><p className="text-sm text-slate-700"><strong>Retention:</strong> {invitation.form.privacy.retention}</p><p className="text-sm text-slate-700"><strong>Contact:</strong> {invitation.form.privacy.contact}</p><label className="flex items-start gap-3 pt-2 cursor-pointer"><input type="checkbox" className="mt-1 w-5 h-5 accent-teal-600" required checked={form.guardian_consent} onChange={(e) => update('guardian_consent', e.target.checked)} /><span className="text-sm text-slate-800">I am the parent or authorized guardian, I have read the notice, and I consent to submitting this information for registration review.</span></label></section>
                    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
                    <button type="submit" disabled={submitting || !form.guardian_consent} className="w-full py-3.5 px-4 rounded-xl bg-primary-action hover:bg-teal-500 text-white font-semibold shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">{submitting && <Loader2 className="w-5 h-5 animate-spin" />}{submitting ? 'Submitting…' : 'Submit for review'}</button>
                </form>
            </main>
        </div>
    );
}

function Field({ label, required, wide, children }: { label: string; required?: boolean; wide?: boolean; children: ReactNode }) {
    return <label className={wide ? 'sm:col-span-2' : ''}><span className={labelClasses}>{label}{required ? ' *' : ''}</span>{children}</label>;
}
function StatusCard({ icon, title, message }: { icon: ReactNode; title: string; message: string }) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-outfit"><main className="max-w-md w-full bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-xl"><div className="mx-auto w-16 h-16 rounded-2xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center">{icon}</div><h1 className="text-2xl font-bold text-slate-900 mt-5">{title}</h1><p className="text-slate-600 mt-3 leading-relaxed">{message}</p></main></div>;
}
