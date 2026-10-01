import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Download, FileDown, FileSpreadsheet, Filter, Loader2, Printer, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { hasModulePermission } from '../../lib/access';
import { downloadReportExport, getBarangays, getConsolidatedReport, getMunicipalities, getSchools, recordReportPrint } from '../../services/api';
import type { Barangay, ModuleSlug, Municipality, School } from '../../types';
import type { ConsolidatedReportPreview, ProtectedReportCount, ReportBreakdownRow, ReportRequestFilters } from '../../types/reports';

const MODULE_NAMES: Record<ModuleSlug, string> = {
  'patient-info': 'Patient Information',
  'oral-health': 'Oral Health',
  deworming: 'Deworming',
  immunization: 'Immunization',
  'vital-signs': 'Vital Signs',
};
const inputClasses = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800';
const buttonClasses = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
}
function isProtectedCount(value: unknown): value is ProtectedReportCount {
  return typeof value === 'object' && value !== null && 'suppressed' in value && 'value' in value;
}
function displayValue(value: unknown): string {
  if (isProtectedCount(value)) return value.suppressed ? 'Suppressed' : String(value.value ?? '—');
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(value);
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([key, nested]) => `${label(key)}: ${displayValue(nested)}`).join(' · ');
  return String(value);
}
function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: { message?: string } } } }).response;
    return response?.data?.error?.message ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
export default function ConsolidatedReportPage({ moduleSlug }: { moduleSlug: ModuleSlug }) {
  const { user, effectiveAccess } = useAuth();
  const canExport = hasModulePermission(effectiveAccess, moduleSlug, 'can_export');
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
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<ConsolidatedReportPreview | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<ReportRequestFilters | null>(null);
  const [appliedNames, setAppliedNames] = useState({ municipality: 'All municipalities', barangay: 'All barangays', school: 'All authorized schools' });
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(true);
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo<ReportRequestFilters>(() => ({
    ...(municipalityId ? { municipality_id: Number(municipalityId) } : {}),
    ...(barangayId ? { barangay_id: Number(barangayId) } : {}),
    ...(schoolId ? { school_id: Number(schoolId) } : {}),
    ...(periodMode === 'named' && period ? { period } : {}),
    ...(periodMode === 'range' && dateFrom ? { date_from: dateFrom } : {}),
    ...(periodMode === 'range' && dateTo ? { date_to: dateTo } : {}),
    page,
    pageSize: 25,
  }), [barangayId, dateFrom, dateTo, municipalityId, page, period, periodMode, schoolId]);

  const selectedNames = useMemo(() => ({
    municipality: municipalities.find(item => String(item.id) === municipalityId)?.name ?? 'All municipalities',
    barangay: barangays.find(item => String(item.id) === barangayId)?.name ?? 'All barangays',
    school: schools.find(item => String(item.id) === schoolId)?.name ?? 'All authorized schools',
  }), [barangayId, barangays, municipalityId, municipalities, schoolId, schools]);

  useEffect(() => {
    let active = true;
    getMunicipalities().then(items => { if (active) setMunicipalities(items); })
      .catch(() => toast.error('Municipality filters could not be loaded.'))
      .finally(() => { if (active) setLookupLoading(false); });
    return () => { active = false; };
  }, []);

  const loadPreview = useCallback(async (requestedFilters: ReportRequestFilters) => {
    if (periodMode === 'range' && (!dateFrom || !dateTo)) {
      setError('Choose both a start date and an end date.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setPreview(await getConsolidatedReport(moduleSlug, requestedFilters));
      setAppliedFilters(requestedFilters);
      setAppliedNames(selectedNames);
      setGeneratedAt(new Date());
    } catch (requestError) {
      setPreview(null);
      setError(errorMessage(requestError, 'The report preview could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, moduleSlug, periodMode, selectedNames]);

  const handleMunicipality = async (value: string) => {
    setMunicipalityId(value); setBarangayId(''); setSchoolId(''); setBarangays([]); setSchools([]); setPage(1);
    if (!value) return;
    setLookupLoading(true);
    try { setBarangays(await getBarangays(value)); }
    catch { toast.error('Barangay filters could not be loaded.'); }
    finally { setLookupLoading(false); }
  };
  const handleBarangay = async (value: string) => {
    setBarangayId(value); setSchoolId(''); setSchools([]); setPage(1);
    if (!value) return;
    setLookupLoading(true);
    try {
      const items = await getSchools(value);
      setSchools(user?.portal_role === 'school_staff' ? items.filter(item => effectiveAccess?.assignedSchoolIds.includes(Number(item.id))) : items);
    } catch { toast.error('School filters could not be loaded.'); }
    finally { setLookupLoading(false); }
  };
  const changePage = (nextPage: number) => {
    setPage(nextPage);
    void loadPreview({ ...filters, page: nextPage });
  };
  const handlePrint = async () => {
    if (!preview) return;
    setPrinting(true);
    try { await recordReportPrint(moduleSlug, appliedFilters ?? filters); window.print(); }
    catch (requestError) { toast.error(errorMessage(requestError, 'The print action could not be audited.')); }
    finally { setPrinting(false); }
  };
  const handleExport = async (format: 'csv' | 'xlsx') => {
    setExporting(format);
    try {
      await downloadReportExport(moduleSlug, format, appliedFilters ?? filters);
      toast.success(`${format.toUpperCase()} report downloaded.`);
    } catch (requestError) { toast.error(errorMessage(requestError, 'The report export failed.')); }
    finally { setExporting(null); }
  };

  const hasNextPage = preview ? Object.values(preview.breakdowns).some(rows => rows.length >= preview.filters.pageSize) : false;

  return (
    <div className="report-page mx-auto max-w-7xl space-y-6 font-outfit text-slate-900 dark:text-slate-100">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Consolidated report</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{MODULE_NAMES[moduleSlug]}</h1><p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">Review privacy-protected totals and breakdowns within your authorized school scope.</p></div>
          <div className="report-controls flex flex-wrap gap-2">
            <button type="button" onClick={handlePrint} disabled={!preview || printing} className={`${buttonClasses} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200`}>{printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Print</button>
            {canExport && <><button type="button" onClick={() => void handleExport('csv')} disabled={exporting !== null} className={`${buttonClasses} bg-teal-600 text-white hover:bg-teal-700`}>{exporting === 'csv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} CSV</button><button type="button" onClick={() => void handleExport('xlsx')} disabled={exporting !== null} className={`${buttonClasses} bg-emerald-600 text-white hover:bg-emerald-700`}>{exporting === 'xlsx' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} XLSX</button></>}
          </div>
        </div>
      </header>

      <section className="report-controls rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2 text-sm font-bold"><Filter className="h-4 w-4 text-teal-600" /> Report filters</div>
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">Municipality<select value={municipalityId} onChange={event => void handleMunicipality(event.target.value)} disabled={lookupLoading} className={inputClasses}><option value="">All municipalities</option>{municipalities.map(item => <option key={item.id} value={String(item.id)}>{item.name}</option>)}</select></label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">Barangay<select value={barangayId} onChange={event => void handleBarangay(event.target.value)} disabled={!municipalityId || lookupLoading} className={inputClasses}><option value="">All barangays</option>{barangays.map(item => <option key={item.id} value={String(item.id)}>{item.name}</option>)}</select></label>
          <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">School<select value={schoolId} onChange={event => { setSchoolId(event.target.value); setPage(1); }} disabled={!barangayId || lookupLoading} className={inputClasses}><option value="">All authorized schools</option>{schools.map(item => <option key={item.id} value={String(item.id)}>{item.name}</option>)}</select></label>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[12rem_1fr_1fr_auto] md:items-end">
          <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">Period type<select value={periodMode} onChange={event => { setPeriodMode(event.target.value as 'named' | 'range'); setPage(1); }} className={inputClasses}><option value="named">Named period</option><option value="range">Custom date range</option></select></label>
          {periodMode === 'named' ? <label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 md:col-span-2">Named period<input value={period} onChange={event => { setPeriod(event.target.value.toUpperCase()); setPage(1); }} placeholder="2026-10, 2026-Q4, or 2026-SY-R1" className={inputClasses} /></label> : <><label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">From<input type="date" value={dateFrom} onChange={event => { setDateFrom(event.target.value); setPage(1); }} className={inputClasses} /></label><label className="space-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">To<input type="date" value={dateTo} onChange={event => { setDateTo(event.target.value); setPage(1); }} className={inputClasses} /></label></>}
          <button type="button" onClick={() => void loadPreview(filters)} disabled={loading} className={`${buttonClasses} bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-700`}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Apply</button>
        </div>
      </section>

      {error && <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />{error}</div>}
      {!preview && !loading && !error && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">Choose the report scope and period, then select Apply.</div>}
      {loading && !preview && <div className="flex min-h-64 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><Loader2 className="h-7 w-7 animate-spin text-teal-600" /></div>}
      {preview && <ReportSheet moduleSlug={moduleSlug} preview={preview} generatedAt={generatedAt} selectedNames={appliedNames} generatedBy={`${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim()} jobTitle={user?.job_title ?? ''} />}

      {preview && !preview.empty && <div className="report-controls flex items-center justify-end gap-2"><button type="button" onClick={() => changePage(Math.max(1, page - 1))} disabled={page <= 1 || loading} className={`${buttonClasses} border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200`}><ChevronLeft className="h-4 w-4" /> Previous</button><button type="button" onClick={() => changePage(page + 1)} disabled={!hasNextPage || loading} className={`${buttonClasses} border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200`}>Next <ChevronRight className="h-4 w-4" /></button></div>}
      {!canExport && <p className="report-controls flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><Download className="h-3.5 w-3.5" /> Export controls require a separate export grant.</p>}
    </div>
  );
}

function ReportSheet({ moduleSlug, preview, generatedAt, selectedNames, generatedBy, jobTitle }: { moduleSlug: ModuleSlug; preview: ConsolidatedReportPreview; generatedAt: Date | null; selectedNames: { municipality: string; barangay: string; school: string }; generatedBy: string; jobTitle: string }) {
  return <main className="report-sheet space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
    <div className="border-b border-slate-200 pb-5 dark:border-slate-700"><h2 className="text-xl font-bold">{MODULE_NAMES[moduleSlug]} Consolidated Report</h2><div className="mt-3 grid gap-1 text-xs text-slate-500 sm:grid-cols-2 dark:text-slate-400"><p><span className="font-semibold text-slate-700 dark:text-slate-200">Scope:</span> {selectedNames.municipality} · {selectedNames.barangay} · {selectedNames.school}</p><p><span className="font-semibold text-slate-700 dark:text-slate-200">Period:</span> {preview.filters.date_from} to {preview.filters.date_to} ({preview.filters.timezone})</p><p><span className="font-semibold text-slate-700 dark:text-slate-200">Generated:</span> {generatedAt?.toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p><p><span className="font-semibold text-slate-700 dark:text-slate-200">Generated by:</span> {generatedBy} ({jobTitle})</p></div></div>
    {preview.empty ? <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">{preview.empty_message ?? 'No records match these filters.'}</div> : <><section><h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">Summary</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(preview.summary).map(([key, value]) => <div key={key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60"><p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label(key)}</p><p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{displayValue(value)}</p></div>)}</div></section>{Object.entries(preview.breakdowns).map(([name, rows]) => <BreakdownTable key={name} name={name} rows={rows} />)}{(Object.keys(preview.coverage).length > 0 || Object.keys(preview.classifications).length > 0) && <section className="grid gap-4 lg:grid-cols-2"><DetailPanel title="Coverage" values={preview.coverage} /><DetailPanel title="Classifications" values={preview.classifications} /></section>}</>}
    <footer className="flex flex-col gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between"><p>Small counts may be suppressed to protect student privacy.</p><p>Page {preview.filters.page}</p></footer>
  </main>;
}

function BreakdownTable({ name, rows }: { name: string; rows: ReportBreakdownRow[] }) {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return <section className="break-inside-avoid overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700"><div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800"><h3 className="text-sm font-bold">{label(name)}</h3></div>{rows.length === 0 ? <p className="p-4 text-sm text-slate-500">No breakdown rows for this page.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-white dark:bg-slate-900"><tr>{columns.map(column => <th key={column} className="whitespace-nowrap px-4 py-3 font-semibold text-slate-500">{label(column)}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{rows.map((row, index) => <tr key={`${name}-${index}`}>{columns.map(column => <td key={column} className="px-4 py-3 text-slate-700 dark:text-slate-200">{displayValue(row[column])}</td>)}</tr>)}</tbody></table></div>}</section>;
}
function DetailPanel({ title, values }: { title: string; values: Record<string, unknown> }) {
  return <div className="break-inside-avoid rounded-2xl border border-slate-200 p-4 dark:border-slate-700"><h3 className="mb-3 text-sm font-bold">{title}</h3><dl className="space-y-2">{Object.entries(values).map(([key, value]) => <div key={key} className="flex items-start justify-between gap-4 text-xs"><dt className="font-medium text-slate-500">{label(key)}</dt><dd className="text-right font-semibold text-slate-800 dark:text-slate-100">{displayValue(value)}</dd></div>)}</dl></div>;
}
