import StudentContextPanel from '../common/StudentContextPanel';
import type { StudentModuleContext } from '../../types/moduleContext';
import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { getStudentModuleContext, getImmunizationByStudent, createImmunization, updateImmunization } from '../../services/api';
import type { Immunization, CreateImmunizationPayload } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { canWriteModuleRecord } from '../../lib/access';
import { cn } from '../../lib/utils';

const REFUSAL_REASONS = [
    'Parent absent/away from home', 'Fear of vaccine side effect', 'Vaccine safety issues (past adverse experience)',
    'Child already has complete routine vaccination', 'Fear of COVID transmission',
    'Vaccine perceived ineffective/low-quality/near-expiry', 'Client is a newborn and parents believed too young',
    'Already vaccinated by private MD', 'Peculiar personal beliefs/misconceptions', 'Lack of trust in the vaccinator',
    'Child just recovered from illness/discharged from hospital', 'Unaware of the campaign', 'Vaccine team did not visit',
    'Child from a different area', 'Child was acutely sick or not feeling well', 'Do not know/declined to respond',
    'Outright refusal', 'Other (specify)',
];
const EDUCATIONAL_LEVELS = ['Kindergarten', ...Array.from({ length: 12 }, (_, i) => 'Grade ' + (i + 1))];
const DOSES = ['mr1', 'mr2', 'td1', 'td2', 'hpv1', 'hpv2'] as const;
type Dose = typeof DOSES[number];
type Disposition = 'neither' | 'deferred' | 'refused' | 'conflict';
const emptyLots = (): Record<Dose, string> => ({ mr1: '', mr2: '', td1: '', td2: '', hpv1: '', hpv2: '' });
const emptyDoses = (): Record<Dose, boolean> => ({ mr1: false, mr2: false, td1: false, td2: false, hpv1: false, hpv2: false });
const doseLabel = (key: Dose) => (key.startsWith('mr') ? 'MR' : key.startsWith('td') ? 'Td' : 'HPV') + ' Dose ' + key.slice(-1);
const localToday = () => {
    const date = new Date();
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
};
const inputClass = 'w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 focus:ring-2 focus:ring-rose-500/30';
const buttonClass = 'rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-rose-500';
const sectionClass = 'space-y-4 border-t border-slate-100 pt-6';
const titleClass = 'text-base font-bold text-slate-900';

export default function ImmunizationForm() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const basePath = pathname.startsWith('/superuser') ? '/superuser' : '/teacher';
    const { effectiveAccess } = useAuth();
    const [student, setStudent] = useState<StudentModuleContext | null>(null);
    const [record, setRecord] = useState<Immunization | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [saving, setSaving] = useState(false);
    const [step, setStep] = useState<1 | 2>(1);
    const [error, setError] = useState('');
    const [sick, setSick] = useState<boolean | null>(null);
    const [consent, setConsent] = useState<boolean | null>(null);
    const [allergies, setAllergies] = useState('');
    const [date, setDate] = useState(localToday);
    const [program, setProgram] = useState('School-Based Immunization');
    const [programEdited, setProgramEdited] = useState(false);
    const [education, setEducation] = useState('Grade 1');
    const [doses, setDoses] = useState(emptyDoses);
    const [lots, setLots] = useState(emptyLots);
    const [disposition, setDisposition] = useState<Disposition>('neither');
    const [deferredReason, setDeferredReason] = useState('');
    const [refusalCode, setRefusalCode] = useState('');
    const [fullyImmunized, setFullyImmunized] = useState(false);
    const [vaccinator, setVaccinator] = useState('');
    const [supervisor, setSupervisor] = useState('');
    const [reviewedCorrections, setReviewedCorrections] = useState(false);

    useEffect(() => {
        let active = true;
        if (!id) return;
        Promise.all([
            getStudentModuleContext(id, 'immunization'),
            getImmunizationByStudent(id).catch((err: unknown) => {
                if (axios.isAxiosError(err) && err.response?.status === 404) return { data: { immunization: null, records: [] } };
                throw err;
            }),
        ]).then(([context, response]) => {
            if (!active) return;
            setStudent(context.data);
            const existing = response.data.immunization;
            setRecord(existing);
            setEducation(existing?.educational_level ?? context.data.grade_level ?? 'Grade 1');
            if (existing) {
                setDate(existing.immunization_date);
                setProgram(existing.immunization_type ?? '');
                setSick(existing.is_sick_today ?? null);
                setConsent(existing.consent_given ?? null);
                setAllergies(existing.history_of_allergies ?? '');
                setDoses(Object.fromEntries(DOSES.map(key => [key, Boolean(existing[('vaccine_' + key) as keyof Immunization])])) as Record<Dose, boolean>);
                setLots(Object.fromEntries(DOSES.map(key => [key, existing[('lot_batch_' + key) as keyof Immunization] ?? ''])) as Record<Dose, string>);
                setDisposition(existing.is_deferred && existing.is_refused ? 'conflict' : existing.is_deferred ? 'deferred' : existing.is_refused ? 'refused' : 'neither');
                setDeferredReason(existing.deferred_reason_text ?? '');
                setRefusalCode(existing.refusal_reason_code ?? '');
                setFullyImmunized(existing.is_fully_immunized);
                setVaccinator(existing.vaccinator_name ?? '');
                setSupervisor(existing.supervisor_name ?? '');
            }
            setLoading(false);
        }).catch((err: unknown) => {
            if (!active) return;
            setLoadError(axios.isAxiosError(err) && err.response?.status === 403 ? 'Access restricted: you do not have permission to view this immunization record.' : 'Unable to load this student’s immunization record. Return to the registry and try again.');
            setLoading(false);
        });
        return () => { active = false; };
    }, [id]);

    const deferred = disposition === 'deferred';
    const refused = disposition === 'refused';
    const male = student?.sex === 'Male';
    const invalidLots = DOSES.filter(key => doses[key] && !/^[0-9]*$/.test(lots[key]));
    // Hidden fields are omitted from updates, so the controller retains their exact saved values.
    const removingHistoricalValues = Boolean(record && (
        DOSES.some(key => (record[('vaccine_' + key) as keyof Immunization] && !doses[key]) ||
            (record[('lot_batch_' + key) as keyof Immunization] && (!doses[key] || lots[key] !== record[('lot_batch_' + key) as keyof Immunization]))) ||
        ((record.refusal_reason_code || record.refusal_reason_text) && !refused) ||
        (record.deferred_reason_text && (!deferred || deferredReason.trim() !== record.deferred_reason_text))
    ));
    const canSave = canWriteModuleRecord(effectiveAccess, 'immunization', Boolean(record));
    const advance = () => {
        if (sick === null) { setError('Choose Yes or No before continuing.'); return; }
        if (sick) { setError('The vaccination event cannot continue through this form when the child is sick today. No event has been saved or automatically marked deferred.'); return; }
        setError('');
        setStep(2);
    };
    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        if (step === 1) { advance(); return; }
        if (!student || !id || !canSave || saving) return;
        let message = '';
        if (sick !== false) message = 'Complete screening with No before continuing.';
        else if (disposition === 'conflict') message = 'Choose one status to resolve this historical Deferred/Refused conflict.';
        else if (deferred && (!deferredReason.trim() || deferredReason.trim().length > 2000)) message = 'Enter a deferred reason of 1-2000 characters.';
        else if (male && (doses.hpv1 || doses.hpv2)) message = 'HPV is unavailable for Male students under this school-based program eligibility rule.';
        else if (invalidLots.length) message = 'Enter digits only in each selected dose’s lot/batch number, or leave it empty.';
        else if (removingHistoricalValues && !reviewedCorrections) message = 'Review and confirm the historical corrections before saving.';
        else if (date < student.date_of_birth) message = 'Immunization date cannot be earlier than the student’s date of birth.';
        else if (!refused && !deferred && !DOSES.some(key => doses[key])) message = 'Select at least one administered dose, or select Refused.';
        else if (refused && !refusalCode) message = 'Select a refusal reason code.';
        if (message) { setError(message); return; }
        const payload: CreateImmunizationPayload = {
            student_id: Number(id), immunization_date: date,
            // Preserve legacy type and school-program flag unless the visible type is edited.
            ...(!record || programEdited ? { immunization_type: program } : {}),
            ...(!record ? { is_school_based: true, is_from_other_facility: false } : {}),
            educational_level: education || null,
            consent_given: consent, is_sick_today: false, history_of_allergies: allergies.trim() || null,
            is_deferred: deferred, is_refused: refused,
            deferred_reason_text: deferred ? deferredReason.trim() : null,
            refusal_reason_code: refused ? refusalCode : null,
            // Keep historical text when still Refused; explicitly clear it when moving away.
            ...(!refused ? { refusal_reason_text: null } : {}),
            is_fully_immunized: (refused || deferred) ? false : fullyImmunized,
            vaccinator_name: vaccinator.trim() || null, supervisor_name: supervisor.trim() || null,
            school_id: student.school_id,
        };
        for (const key of DOSES) {
            payload[('vaccine_' + key) as `vaccine_${Dose}`] = doses[key];
            payload[('lot_batch_' + key) as `lot_batch_${Dose}`] = doses[key] ? lots[key] || null : null;
        }
        setSaving(true);
        try {
            if (record) await updateImmunization(record.id, payload);
            else await createImmunization(payload);
            toast.success(record ? 'Immunization record updated successfully' : 'Immunization record created successfully');
            navigate(basePath + '/students/' + id);
        } catch (err: unknown) {
            setError(axios.isAxiosError(err) ? err.response?.data?.message || 'Unable to save this record.' : 'Unable to save this record.');
        } finally { setSaving(false); }
    };

    if (loading) return <p role="status" className="p-8 text-center">Loading immunization record…</p>;
    if (!student || loadError) return <div className="space-y-4 p-8"><p role="alert">{loadError || 'Student not found.'}</p><Link to={basePath + '/students'}>Back to registry</Link></div>;
    return <div className="mx-auto max-w-5xl space-y-6 pb-12">
        <Link to={basePath + '/students/' + id} className="text-sm text-slate-600">Back to Student Profile</Link>
        <header className="rounded-2xl border border-slate-200 bg-white p-6">
            <h1 className="text-xl font-bold text-slate-900">{[student.first_name, student.middle_name, student.last_name, student.suffix === 'NOT APPLICABLE' ? null : student.suffix].filter(Boolean).join(' ')} — Immunization</h1>
            <p className="mt-2 text-sm text-slate-600">LRN: {student.student_lrn} · {student.sex} · {student.school_name}</p>
            {record && <p className="mt-2 text-xs text-slate-500">Editing the saved record. Screening answers and historical selections are loaded for review.</p>}
        </header>
        <StudentContextPanel student={student} />
        <form onSubmit={save} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <p aria-live="polite" className="font-semibold text-slate-600">Step {step} of 2 — {step === 1 ? 'Pre-Screening & Consent' : 'Vaccination Event'}</p>
            {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
            {step === 1 ? <>
                <section className="space-y-5" aria-labelledby="screening-title">
                    <h2 id="screening-title" className={titleClass}>Pre-Screening &amp; Consent</h2>
                    <fieldset className="space-y-3">
                        <legend className="mb-2 text-sm font-semibold">Is the child sick today? *</legend>
                        <div className="grid grid-cols-2 gap-3">
                            {[true, false].map(answer => <label key={String(answer)} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-4', sick === answer ? 'border-rose-500 bg-rose-50' : 'border-slate-300')}>
                                <input type="radio" name="sick-today" checked={sick === answer} onChange={() => { setSick(answer); setError(''); }} />
                                <span className="font-semibold">{answer ? 'Yes' : 'No'}</span>
                            </label>)}
                        </div>
                        {sick === true && <p role="alert" className="text-sm text-rose-800">The vaccination event cannot continue through this form when the child is sick today. No event has been saved or automatically marked deferred.</p>}
                    </fieldset>
                    <label className="block space-y-2 text-sm font-semibold">Parent/guardian consent on file
                        <select value={consent === null ? '' : String(consent)} onChange={e => setConsent(e.target.value === '' ? null : e.target.value === 'true')} className={inputClass}>
                            <option value="">Not recorded</option><option value="true">Yes</option><option value="false">No</option>
                        </select>
                    </label>
                    <label className="block space-y-2 text-sm font-semibold">History of Allergies
                        <textarea rows={2} value={allergies} onChange={e => setAllergies(e.target.value)} maxLength={500} className={inputClass} />
                    </label>
                </section>
                <div className="flex flex-wrap justify-between gap-3">
                    <Link to={basePath + '/students/' + id} className={buttonClass}>Cancel</Link>
                    <button type="button" onClick={advance} className={buttonClass + ' bg-rose-600 text-white'}>Continue to vaccination details</button>
                </div>
            </> : <>
                <section className={sectionClass}>
                    <h2 className={titleClass}>Vaccination Event Details</h2>
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                        <label className="space-y-2 text-sm font-semibold">Immunization Date *
                            <input type="date" value={date} onChange={e => setDate(e.target.value)} required className={inputClass} />
                        </label>
                        <label className="space-y-2 text-sm font-semibold">Immunization Type
                            <input type="text" value={program} onChange={e => { setProgram(e.target.value); setProgramEdited(true); }} maxLength={100} className={inputClass} />
                        </label>
                        <label className="space-y-2 text-sm font-semibold">Educational Level
                            <select value={education} onChange={e => setEducation(e.target.value)} className={inputClass}>
                                {education && !EDUCATIONAL_LEVELS.includes(education) && <option value={education}>{education} (historical)</option>}
                                {EDUCATIONAL_LEVELS.map(level => <option key={level}>{level}</option>)}
                            </select>
                        </label>
                    </div>
                    {record && <p className="text-xs text-slate-500">The historical school-based flag is preserved. The program type changes only if you edit it.</p>}
                </section>
                <section className={sectionClass}>
                    <h2 className={titleClass}>Vaccines Administered</h2>
                    <p className="text-sm text-slate-600">Select doses administered during this event. Lots are optional and stay separate for every dose.</p>
                    {male && <p id="hpv-rule" className="text-sm text-amber-800">Under this school-based program’s eligibility rule, Male students cannot select HPV Dose 1 or Dose 2. This is a program rule, not a universal medical contraindication. Saved HPV selections are retained for review; explicitly remove them before saving a correction.</p>}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="vaccine-grid">
                        {(['mr', 'td', 'hpv'] as const).map(vaccine => <fieldset key={vaccine} className="min-w-0 space-y-4 rounded-xl border border-slate-200 p-4">
                            <legend className="px-2 font-bold">{vaccine === 'mr' ? 'MR' : vaccine === 'td' ? 'Td' : 'HPV'}</legend>
                            {DOSES.filter(key => key.startsWith(vaccine)).map(key => <div key={key} className="space-y-2">
                                <label className="flex items-center gap-3 text-sm font-semibold">
                                    <input type="checkbox" checked={doses[key]} disabled={male && vaccine === 'hpv' && !doses[key]} aria-describedby={male && vaccine === 'hpv' ? 'hpv-rule' : undefined} onChange={e => { setDoses(current => ({ ...current, [key]: e.target.checked })); setReviewedCorrections(false); }} />
                                    {doseLabel(key)}
                                </label>
                                {doses[key] && <label className="block space-y-1 text-xs font-semibold">{doseLabel(key)} Lot/Batch Number
                                    <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={100} value={lots[key]} onChange={e => { setLots(current => ({ ...current, [key]: e.target.value })); setReviewedCorrections(false); }} className={inputClass} aria-invalid={!/^[0-9]*$/.test(lots[key])} aria-describedby={'lot-help-' + key} />
                                    <span id={'lot-help-' + key} role={!/^[0-9]*$/.test(lots[key]) ? 'alert' : undefined} className={cn('block font-normal', !/^[0-9]*$/.test(lots[key]) ? 'text-rose-700' : 'text-slate-500')}>{!/^[0-9]*$/.test(lots[key]) ? 'Enter digits 0–9 only, or leave empty.' : 'Optional. Leading zeroes are preserved.'}</span>
                                </label>}
                            </div>)}
                        </fieldset>)}
                    </div>
                </section>
                <section className={sectionClass}>
                    <h2 className={titleClass}>VACCINE PROVIDER</h2>
                    {record && (record.is_from_other_facility || record.other_facility_name || record.lot_batch_no) && <p className="text-sm text-slate-600">Historical facility details and the shared lot/batch value are preserved on save.</p>}
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <label className="space-y-2 text-sm font-semibold">Vaccinator Name<input type="text" value={vaccinator} onChange={e => setVaccinator(e.target.value)} maxLength={200} className={inputClass} /></label>
                        <label className="space-y-2 text-sm font-semibold">Supervisor Name<input type="text" value={supervisor} onChange={e => setSupervisor(e.target.value)} maxLength={200} className={inputClass} /></label>
                    </div>
                </section>
                <section className={sectionClass}>
                    <h2 className={titleClass}>Deferral &amp; Refusal</h2>
                    <fieldset>
                        <legend className="sr-only">Deferral or refusal status</legend>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            {(['neither', 'deferred', 'refused'] as const).map(value => <label key={value} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm', disposition === value ? 'border-rose-500 bg-rose-50' : 'border-slate-300')}>
                                <input type="radio" name="disposition" checked={disposition === value} onChange={() => { setDisposition(value); setReviewedCorrections(false); if (value !== 'deferred') setDeferredReason(''); if (value !== 'neither') setFullyImmunized(false); }} />
                                {value === 'neither' ? 'Neither' : value === 'deferred' ? 'Vaccination Deferred' : 'Vaccination Refused'}
                            </label>)}
                        </div>
                    </fieldset>
                    {disposition === 'conflict' && <p role="alert" className="text-sm text-rose-800">This historical record has both Deferred and Refused set. Choose one status explicitly before saving.</p>}
                    {deferred && <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
                        <label className="block space-y-2 text-sm font-semibold">Deferred Reason Explanation / Remarks *
                            <textarea rows={3} value={deferredReason} onChange={e => { setDeferredReason(e.target.value); setReviewedCorrections(false); }} required maxLength={2000} aria-describedby="deferral-help" className={inputClass} />
                        </label>
                        <p id="deferral-help" className="text-sm text-amber-900">Required when Deferred (maximum 2,000 characters). Saved separately from refusal explanations and general clinical remarks.</p>
                    </div>}
                    {refused && <label className="block space-y-2 text-sm font-semibold">Refusal Reason Code *
                        <select value={refusalCode} onChange={e => setRefusalCode(e.target.value)} required className={inputClass}>
                            <option value="">Select official refusal code (1–18)</option>
                            {refusalCode && !/^(?:[1-9]|1[0-8])$/.test(refusalCode) && <option value={refusalCode}>{refusalCode} (historical)</option>}
                            {REFUSAL_REASONS.map((reason, index) => <option key={index + 1} value={String(index + 1)}>{index + 1} - {reason}</option>)}
                        </select>
                    </label>}
                    {refused && record?.refusal_reason_text && <p className="text-xs text-slate-500">The historical refusal explanation is retained while this record remains Refused.</p>}
                </section>
                <section className={sectionClass}>
                    <h2 className={titleClass}>Completion Status &amp; Remarks</h2>
                    <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={fullyImmunized} disabled={deferred || refused || disposition === 'conflict'} onChange={e => setFullyImmunized(e.target.checked)} />Student is Fully Immunized (FIC)</label>
                    {record?.remarks && <p className="text-xs text-slate-500">Historical general clinical remarks are preserved; this form does not edit them.</p>}
                </section>
                {removingHistoricalValues && <label className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                    <input type="checkbox" checked={reviewedCorrections} onChange={e => setReviewedCorrections(e.target.checked)} />
                    I reviewed the correction: deselected doses and their saved lots, changed lot values, and refusal details when leaving Refused, and changed or removed deferral explanations will be cleared or replaced on save. Cancel keeps the saved record unchanged.
                </label>}
                {!canSave && <p className="text-sm text-amber-800">Read-only: your current access does not allow saving this record.</p>}
                <div className="flex flex-wrap justify-between gap-3 border-t border-slate-100 pt-6">
                    <button type="button" onClick={() => { setError(''); setStep(1); }} className={buttonClass}>Back to screening</button>
                    <Link to={basePath + '/students/' + id} className={buttonClass}>Cancel</Link>
                    <button type="submit" disabled={saving || !canSave || disposition === 'conflict'} className={buttonClass + ' bg-rose-600 text-white disabled:opacity-50'}>{saving ? 'Saving…' : record ? 'Update Immunization Record' : 'Save Immunization Record'}</button>
                </div>
            </>}
        </form>
    </div>;
}
