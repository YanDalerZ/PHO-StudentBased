import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ClipboardList, History, Save } from 'lucide-react';
import { getAllLookupSchools, getReportTargetRevisions, saveReportTarget } from '../../services/api';
import type { ModuleSlug, School } from '../../types';
import type { ReportTargetRevision } from '../../types/reports';
import { useAuth } from '../../contexts/AuthContext';

const indicators: Record<ModuleSlug, Array<{ key: string; label: string }>> = {
  'patient-info': [{ key: 'registrations', label: 'Expected registrations' }],
  'oral-health': [{ key: 'examined_students', label: 'Eligible for oral examination' }],
  deworming: [{ key: 'eligible_students', label: 'Eligible for deworming' }],
  immunization: [
    { key: 'mr_td_grade1', label: 'Eligible Grade 1 MR/Td' },
    { key: 'mr_td_grade7', label: 'Eligible Grade 7 MR/Td' },
    { key: 'hpv_grade4_female', label: 'Eligible Grade 4 female HPV' },
  ],
  'vital-signs': [{ key: 'screened_students', label: 'Eligible for vital signs screening' }],
};
const moduleNames: Record<ModuleSlug, string> = {
  'patient-info': 'Patient Information', 'oral-health': 'Oral Health',
  deworming: 'Deworming', immunization: 'Immunization', 'vital-signs': 'Vital Signs',
};
const inputClasses = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50 dark:border-teal-500/30 dark:bg-surface-input dark:text-white';
const labelClasses = 'block text-sm font-medium text-slate-700 dark:text-slate-300';

export default function ReportTargetPage() {
  const { moduleSlug: routeModule } = useParams();
  const { user, effectiveAccess } = useAuth();
  const isAdmin = user?.portal_role === 'admin';
  const [moduleSlug, setModuleSlug] = useState<ModuleSlug>(
    routeModule && Object.hasOwn(indicators, routeModule) ? routeModule as ModuleSlug : 'patient-info',
  );
  const [period, setPeriod] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 7));
  const [periodMode, setPeriodMode] = useState<'named' | 'range'>('named');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [indicator, setIndicator] = useState(indicators[moduleSlug][0]!.key);
  const [count, setCount] = useState('');
  const [sourceNote, setSourceNote] = useState('');
  const [schools, setSchools] = useState<School[]>([]);
  const [revisions, setRevisions] = useState<ReportTargetRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const scopedSchools = useMemo(() => user?.portal_role === 'school_staff'
    ? schools.filter(school => effectiveAccess?.assignedSchoolIds.includes(Number(school.id)))
    : schools, [schools, user?.portal_role, effectiveAccess]);
  const latest = useMemo(() => {
    const rows = new Map<string, ReportTargetRevision>();
    for (const row of revisions) {
      const key = `${row.school_id}:${row.indicator}`;
      if (!rows.has(key)) rows.set(key, row);
    }
    return [...rows.values()];
  }, [revisions]);
  const periodInput = useMemo(() => periodMode === 'named'
    ? { period } : { date_from: dateFrom, date_to: dateTo }, [periodMode, period, dateFrom, dateTo]);
  const periodCaption = periodMode === 'named' ? period : `${dateFrom || '…'} to ${dateTo || '…'}`;

  useEffect(() => {
    getAllLookupSchools().then(setSchools).catch(() => setError('School list could not be loaded.'));
  }, []);

  const load = useCallback(async () => {
    if (periodMode === 'range' && (!dateFrom || !dateTo)) { setRevisions([]); return; }
    setLoading(true);
    setError('');
    try { setRevisions(await getReportTargetRevisions(moduleSlug, periodInput)); }
    catch { setRevisions([]); setError('Targets could not be loaded for this period.'); }
    finally { setLoading(false); }
  }, [moduleSlug, periodMode, dateFrom, dateTo, periodInput]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const changeModule = (value: ModuleSlug) => {
    setModuleSlug(value);
    setIndicator(indicators[value][0]!.key);
    setSchoolId(''); setCount(''); setSourceNote('');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const targetCount = Number(count);
    if (!schoolId || !Number.isInteger(targetCount) || targetCount < 0 || sourceNote.trim().length < 5
      || (periodMode === 'range' && (!dateFrom || !dateTo))) {
      setError('Choose a school, enter a non-negative whole number, and provide a source note of at least five characters.');
      return;
    }
    setSaving(true); setError('');
    try {
      await saveReportTarget(moduleSlug, { ...periodInput, school_id: Number(schoolId), indicator, target_count: targetCount, source_note: sourceNote.trim() });
      toast.success('Target revision recorded.');
      setCount(''); setSourceNote('');
      await load();
    } catch { setError('Target revision could not be saved. Check your permission and period.'); }
    finally { setSaving(false); }
  };

  return <div className="mx-auto max-w-7xl space-y-6 font-outfit text-slate-900 dark:text-slate-100">
    <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-surface-card">
      <div className="flex items-center gap-3"><ClipboardList className="h-7 w-7 text-teal-600" /><div><h1 className="text-2xl font-bold">Report targets</h1><p className="text-sm text-slate-500 dark:text-slate-400">Enter approved school-period counts. Every revision retains its source and author.</p></div></div>
      {!isAdmin && <Link to={`${user?.portal_role === 'superuser' ? '/superuser' : '/teacher'}/reports/${moduleSlug}`} className="mt-3 inline-block text-sm font-semibold text-teal-600 hover:underline">Open report</Link>}
    </header>
    <form onSubmit={event => void save(event)} className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-surface-card md:grid-cols-2 xl:grid-cols-3">
      {isAdmin && <label className={labelClasses}>Module<select className={inputClasses} value={moduleSlug} onChange={event => changeModule(event.target.value as ModuleSlug)}>{Object.entries(moduleNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>}
      <label className={labelClasses}>Period type<select className={inputClasses} value={periodMode} onChange={event => setPeriodMode(event.target.value as 'named' | 'range')}><option value="named">Named period</option><option value="range">Custom date range</option></select></label>
      {periodMode === 'named' ? <label className={labelClasses}>Reporting period<input className={inputClasses} value={period} onChange={event => setPeriod(event.target.value.toUpperCase())} placeholder="2026-10 or 2026-SY-R1" required /></label>
        : <><label className={labelClasses}>From<input className={inputClasses} type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} required /></label><label className={labelClasses}>To<input className={inputClasses} type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} required /></label></>}
      <label className={labelClasses}>School<select className={inputClasses} value={schoolId} onChange={event => setSchoolId(event.target.value)} required><option value="">Select school</option>{scopedSchools.map(school => <option key={school.id} value={school.id}>{school.name}{school.municipality_name ? ` · ${school.municipality_name}` : ''}</option>)}</select></label>
      <label className={labelClasses}>Indicator<select className={inputClasses} value={indicator} onChange={event => setIndicator(event.target.value)}>{indicators[moduleSlug].map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label className={labelClasses}>Target count<input className={inputClasses} type="number" min="0" step="1" value={count} onChange={event => setCount(event.target.value)} required /></label>
      <label className={`${labelClasses} md:col-span-2`}>Source note<input className={inputClasses} value={sourceNote} onChange={event => setSourceNote(event.target.value)} maxLength={500} placeholder="Source document and responsible office" required /></label>
      <div className="flex items-end"><button type="submit" disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-action px-4 py-3 font-semibold text-white hover:bg-teal-500 disabled:opacity-60"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Record target revision'}</button></div>
    </form>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-surface-card">
      <div className="flex items-center gap-2 border-b border-slate-200 p-5 dark:border-slate-700"><History className="h-5 w-5 text-teal-600" /><h2 className="font-bold">Current targets and revision history · {moduleNames[moduleSlug]} · {periodCaption}</h2></div>
      {loading ? <p className="p-5 text-sm">Loading targets…</p> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr><th className="px-4 py-3">Municipality</th><th className="px-4 py-3">School</th><th className="px-4 py-3">Indicator</th><th className="px-4 py-3">Count</th><th className="px-4 py-3">Source note</th><th className="px-4 py-3">Updated</th></tr></thead><tbody>{latest.map(row => <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800"><td className="px-4 py-3">{row.municipality_name}</td><td className="px-4 py-3">{row.school_name}</td><td className="px-4 py-3">{row.indicator}</td><td className="px-4 py-3 font-bold">{row.target_count}</td><td className="px-4 py-3">{row.source_note}</td><td className="px-4 py-3">{new Date(row.changed_at).toLocaleString('en-PH')}</td></tr>)}</tbody></table>{latest.length === 0 && <p className="p-5 text-sm text-slate-500">No targets entered for this module and period.</p>}</div>}
      {revisions.length > latest.length && <details className="border-t border-slate-200 p-5 text-sm dark:border-slate-700"><summary className="cursor-pointer font-semibold">View {revisions.length - latest.length} earlier revisions</summary><ul className="mt-3 space-y-2">{revisions.filter(row => !latest.some(current => current.id === row.id)).map(row => <li key={row.id}>{row.school_name} · {row.indicator} · {row.target_count} · {row.source_note} · {new Date(row.changed_at).toLocaleString('en-PH')}</li>)}</ul></details>}
    </section>
  </div>;
}
