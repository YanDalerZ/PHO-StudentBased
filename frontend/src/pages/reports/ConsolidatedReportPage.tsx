import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileDown, FileSpreadsheet, Filter, Loader2, Printer, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { hasModulePermission } from '../../lib/access';
import { downloadReportExport, getBarangays, getConsolidatedReport, getMunicipalities, getSchools, recordReportPrint } from '../../services/api';
import type { Barangay, ModuleSlug, Municipality, School } from '../../types';
import type { ReportDocument, ReportRequestFilters, ReportView } from '../../types/reports';

const names: Record<ModuleSlug, string> = {
  'patient-info': 'Patient Information', 'oral-health': 'Oral Health',
  deworming: 'Deworming', immunization: 'Immunization', 'vital-signs': 'Vital Signs',
};
const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white';
const button = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50';
function show(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'N/A';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
function message(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const typed = error as { response?: { data?: { error?: { message?: string } } } };
    if (typed.response?.data?.error?.message) return typed.response.data.error.message;
  }
  return error instanceof Error ? error.message : 'The report could not be loaded.';
}

export default function ConsolidatedReportPage({ moduleSlug }: { moduleSlug: ModuleSlug }) {
  const { user, effectiveAccess } = useAuth();
  const canExport = hasModulePermission(effectiveAccess, moduleSlug, 'can_export');
  const canReport = hasModulePermission(effectiveAccess, moduleSlug, 'can_report');
  const canManageTargets = hasModulePermission(effectiveAccess, moduleSlug, 'can_manage_targets');
  const [view, setView] = useState<ReportView>(canReport ? 'municipality' : 'masterlist');
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [municipalityId, setMunicipalityId] = useState('');
  const [barangayId, setBarangayId] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [periodMode, setPeriodMode] = useState<'named' | 'range'>('named');
  const [period, setPeriod] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 7));
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [document, setDocument] = useState<ReportDocument | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<ReportRequestFilters | null>(null);
  const [appliedScope, setAppliedScope] = useState('All authorized schools');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo<ReportRequestFilters>(() => ({
    ...(municipalityId ? { municipality_id: Number(municipalityId) } : {}),
    ...(barangayId ? { barangay_id: Number(barangayId) } : {}),
    ...(schoolId ? { school_id: Number(schoolId) } : {}),
    ...(periodMode === 'named' ? { period } : { date_from: dateFrom, date_to: dateTo }),
  }), [municipalityId, barangayId, schoolId, periodMode, period, dateFrom, dateTo]);

  useEffect(() => {
    getMunicipalities().then(setMunicipalities).catch(() => toast.error('Municipalities could not be loaded.'));
  }, []);

  const loadBarangays = async (value: string) => {
    setMunicipalityId(value); setBarangayId(''); setSchoolId(''); setBarangays([]); setSchools([]);
    if (value) try { setBarangays(await getBarangays(value)); }
    catch { toast.error('Barangays could not be loaded.'); }
  };
  const loadSchools = async (value: string) => {
    setBarangayId(value); setSchoolId(''); setSchools([]);
    if (value) try {
      const found = await getSchools(value);
      setSchools(user?.portal_role === 'school_staff'
        ? found.filter(item => effectiveAccess?.assignedSchoolIds.includes(Number(item.id))) : found);
    } catch { toast.error('Schools could not be loaded.'); }
  };
  const apply = async () => {
    if (periodMode === 'range' && (!dateFrom || !dateTo)) { setError('Select both dates.'); return; }
    setBusy(true); setError(null);
    try {
      const result = await getConsolidatedReport(moduleSlug, filters, view);
      setDocument(result); setAppliedFilters(filters);
      setAppliedScope([
        municipalities.find(item => String(item.id) === municipalityId)?.name ?? 'All municipalities',
        barangays.find(item => String(item.id) === barangayId)?.name ?? 'All barangays',
        schools.find(item => String(item.id) === schoolId)?.name ?? 'All authorized schools',
      ].join(' · '));
    } catch (cause) { setDocument(null); setError(message(cause)); }
    finally { setBusy(false); }
  };
  const print = async () => {
    if (!document || !appliedFilters) return;
    try { await recordReportPrint(moduleSlug, appliedFilters, document.view); window.print(); }
    catch (cause) { toast.error(message(cause)); }
  };
  const download = async (format: 'csv' | 'xlsx') => {
    if (!document || !appliedFilters) return;
    setExporting(true);
    try { await downloadReportExport(moduleSlug, format, appliedFilters, document.view); }
    catch (cause) { toast.error(message(cause)); }
    finally { setExporting(false); }
  };

  return <div className="report-page mx-auto max-w-7xl space-y-5 font-outfit text-slate-900 dark:text-slate-100">
    <header className="report-controls rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
      <p className="text-xs font-bold uppercase tracking-widest text-teal-600">Consolidated reporting</p>
      <h1 className="mt-1 text-2xl font-bold">{names[moduleSlug]}</h1>
      <p className="mt-2 text-sm text-slate-500">Municipality accomplishment and school and section student masterlist.</p>
      {canManageTargets && <Link to={`${user?.portal_role === 'superuser' ? '/superuser' : '/teacher'}/report-targets/${moduleSlug}`}
        className="mt-3 inline-block text-sm font-semibold text-teal-700 underline">Manage targets</Link>}
    </header>
    <section className="report-controls rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold"><Filter size={16} /> Report filters</h2>
      <div className="grid gap-4 md:grid-cols-4">
        <label className="text-xs font-semibold">Report view<select value={view} onChange={event => { setView(event.target.value as ReportView); setDocument(null); }} className={input}>
          {canReport && <option value="municipality">Municipality summary</option>}{canExport && <option value="masterlist">Student masterlist</option>}
        </select></label>
        <label className="text-xs font-semibold">Municipality<select value={municipalityId} onChange={event => void loadBarangays(event.target.value)} className={input}><option value="">All municipalities</option>{municipalities.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-xs font-semibold">Barangay<select value={barangayId} onChange={event => void loadSchools(event.target.value)} disabled={!municipalityId} className={input}><option value="">All barangays</option>{barangays.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-xs font-semibold">School<select value={schoolId} onChange={event => setSchoolId(event.target.value)} disabled={!barangayId} className={input}><option value="">All authorized schools</option>{schools.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-[12rem_1fr_1fr_auto] md:items-end">
        <label className="text-xs font-semibold">Period type<select value={periodMode} onChange={event => setPeriodMode(event.target.value as 'named' | 'range')} className={input}><option value="named">Named period</option><option value="range">Custom date range</option></select></label>
        {periodMode === 'named' ? <label className="text-xs font-semibold md:col-span-2">Period<input value={period} onChange={event => setPeriod(event.target.value.toUpperCase())} placeholder="2026-10, 2026-Q4, or 2026-SY-R1" className={input} /></label>
          : <><label className="text-xs font-semibold">From<input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className={input} /></label><label className="text-xs font-semibold">To<input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className={input} /></label></>}
        <button type="button" onClick={() => void apply()} disabled={busy} className={`${button} bg-slate-900 text-white`}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Apply
        </button>
      </div>
    </section>
    {error && <p role="alert" className="report-controls rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    {document && <div className="report-controls flex flex-wrap gap-2">
      <button type="button" onClick={() => void print()} className={`${button} border border-slate-200 bg-white`}><Printer size={16} /> Print / Save as PDF</button>
      {canExport && <><button type="button" disabled={exporting} onClick={() => void download('csv')} className={`${button} bg-teal-600 text-white`}><FileDown size={16} /> CSV</button>
        <button type="button" disabled={exporting} onClick={() => void download('xlsx')} className={`${button} bg-emerald-600 text-white`}><FileSpreadsheet size={16} /> XLSX</button></>}
    </div>}
    {document ? <ReportSheet document={document} scopeName={appliedScope} />
      : !busy && !error && <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Select a view and period, then Apply.</p>}
  </div>;
}

function ReportSheet({ document, scopeName }: { document: ReportDocument; scopeName: string }) {
  const immunizationMasterlist = document.module === 'immunization' && document.view === 'masterlist';
  return <main className={`report-sheet ${immunizationMasterlist ? 'report-immunization' : document.view === 'masterlist' ? 'report-masterlist' : ''} rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm`}>
    <div className="report-title mb-4 text-center">
      <p className="text-xs font-bold uppercase tracking-wider">Provincial Health Office</p>
      <h2 className="mt-1 text-lg font-bold uppercase">{document.title}</h2>
      <p className="mt-1 text-xs">Reporting period: {document.filters.date_from} to {document.filters.date_to} · {document.filters.timezone}</p>
      <p className="text-xs">Geographic scope: {scopeName}</p>
    </div>
    {document.note && <p className="mb-3 text-xs text-slate-600">{document.note}</p>}
    <div className="overflow-x-auto"><table className="report-table w-full border-collapse text-[11px]">
      <thead><tr className="report-print-heading"><th colSpan={document.columns.length} className="border border-slate-500 p-2 text-left">Provincial Health Office · {document.title}<br />Reporting period: {document.filters.date_from} to {document.filters.date_to} · Geographic scope: {scopeName}</th></tr>
        <tr className="bg-teal-50">{document.columns.map(column => <th key={column.key} className="border border-slate-500 px-2 py-1 text-left align-bottom font-bold">{column.label}</th>)}</tr></thead>
      <tbody>{document.empty && <tr><td colSpan={document.columns.length} className="border border-slate-500 p-5 text-center">No records in this period and scope.</td></tr>}
        {document.rows.map((row, index) => {
          const group = `${row.school ?? ''}|${row.section ?? ''}`;
          const preceding = document.rows[index - 1];
          const precedingGroup = `${preceding?.school ?? ''}|${preceding?.section ?? ''}`;
          const showGroup = document.view === 'masterlist' && group !== precedingGroup;
          return <Fragment key={`entry-${index}`}>{showGroup && <tr className="report-group bg-slate-100"><th colSpan={document.columns.length} className="border border-slate-500 px-2 py-1 text-left">School: {show(row.school)} · Section: {show(row.section)}</th></tr>}
            <tr key={`row-${index}`} className={row.municipality === 'PROVINCE TOTAL' ? 'report-total bg-amber-100 font-bold' : ''}>
              {document.columns.map(column => <td key={column.key} className="border border-slate-400 px-2 py-1 align-top">{show(row[column.key])}</td>)}
            </tr></Fragment>;
        })}
      </tbody>
    </table></div>
    <div className={`report-signatures mt-10 grid ${immunizationMasterlist ? 'grid-cols-3' : 'grid-cols-2'} gap-12 text-xs`}>
      <p className="report-signature-context hidden">{document.title} · Reporting period: {document.filters.date_from} to {document.filters.date_to} · Geographic scope: {scopeName}</p>
      {(immunizationMasterlist ? ['Vaccinator 1', 'Vaccinator 2', 'Supervisor'] : ['Accomplished by', 'Verified by']).map(role =>
        <div key={role}><div className="border-b border-slate-500 pt-9" /><p className="mt-1">{role}: ____________________</p><p>Position / date: ____________________</p></div>)}
    </div>
  </main>;
}
