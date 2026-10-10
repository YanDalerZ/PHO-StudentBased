import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { getAuditLogs, type AuditEntry, type AuditFilters } from '../../services/auditBrowser';

const inputClass = 'w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-teal-500/30 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50';
const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300';
const initial = { actor: '', action: '', entity: '', from: '', to: '' };

export default function AuditLogBrowser() {
    const [draft, setDraft] = useState(initial);
    const [applied, setApplied] = useState(initial);
    const [page, setPage] = useState(1);
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState<AuditEntry | null>(null);
    const pageSize = 25;

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const filters: AuditFilters = { page, pageSize };
            if (applied.actor) filters.actor_id = Number(applied.actor);
            if (applied.action) filters.action = applied.action.trim();
            if (applied.entity) filters.entity_type = applied.entity.trim();
            if (applied.from) filters.date_from = applied.from;
            if (applied.to) filters.date_to = applied.to;
            const result = await getAuditLogs(filters);
            setEntries(result.data);
            setTotal(result.meta.total);
        } catch { setError('Unable to load audit events. Check the filters and try again.'); }
        finally { setLoading(false); }
    }, [applied, page]);

    useEffect(() => {
        const timer = window.setTimeout(() => void load(), 0);
        return () => window.clearTimeout(timer);
    }, [load]);
    const apply = (event: FormEvent) => {
        event.preventDefault();
        if (draft.from && draft.to && draft.from > draft.to) {
            setError('Start date must be before or equal to end date.');
            return;
        }
        setSelected(null);
        setPage(1);
        setApplied({ ...draft });
    };

    return <div className="max-w-7xl mx-auto space-y-6 font-outfit">
        <header><p className="text-sm font-semibold text-teal-600">Admin governance</p>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mt-1">Audit log</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Browse recorded events by actor, action, entity, and date. Dates use Philippine time. Only approved metadata is shown.</p>
        </header>
        <form onSubmit={apply} className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <label className={labelClass}>Actor ID<input className={inputClass} type="number" min="1" step="1" value={draft.actor} onChange={e => setDraft({ ...draft, actor: e.target.value })} /></label>
                <label className={labelClass}>Action<input className={inputClass} maxLength={100} placeholder="CREATE_USER" value={draft.action} onChange={e => setDraft({ ...draft, action: e.target.value })} /></label>
                <label className={labelClass}>Entity type<input className={inputClass} maxLength={100} placeholder="USER" value={draft.entity} onChange={e => setDraft({ ...draft, entity: e.target.value })} /></label>
                <label className={labelClass}>From<input className={inputClass} type="date" value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} /></label>
                <label className={labelClass}>To<input className={inputClass} type="date" value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} /></label>
            </div>
            <div className="flex gap-3"><button type="submit" className="px-5 py-2.5 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700">Apply filters</button>
                <button type="button" className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-white/20 text-slate-700 dark:text-white" onClick={() => { setDraft(initial); setApplied(initial); setPage(1); setSelected(null); }}>Clear</button></div>
        </form>
        <section className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-3xl shadow-xl overflow-hidden">
            <div className="p-5 flex justify-between items-center"><h2 className="text-lg font-bold text-slate-900 dark:text-white">Events</h2><span className="text-sm text-slate-500">{total} total</span></div>
            {error && <p role="alert" className="px-5 pb-4 text-red-600">{error}</p>}
            {loading ? <div className="p-8"><Loader2 className="animate-spin text-teal-600" aria-label="Loading audit log" /></div> :
                entries.length === 0 ? <p className="p-8 text-slate-500">No events match these filters.</p> :
                    <div className="overflow-x-auto"><table className="min-w-full text-sm text-left">
                        <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300"><tr>{['Time (Philippines)', 'Actor', 'Role', 'Action', 'Entity', 'Target', ''].map(name => <th className="px-5 py-3" key={name}>{name}</th>)}</tr></thead>
                        <tbody>{entries.map(row => <tr key={row.id} className="border-t border-slate-100 dark:border-white/10 text-slate-700 dark:text-slate-200">
                            <td className="px-5 py-3 whitespace-nowrap">{row.created_at ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(row.created_at)) : 'Unknown'}</td>
                            <td className="px-5 py-3">{row.actor_id ?? 'System'}</td><td className="px-5 py-3">{row.portal_role ?? '—'}</td>
                            <td className="px-5 py-3 font-medium">{row.action}</td><td className="px-5 py-3">{row.entity_type}</td><td className="px-5 py-3">{row.entity_id ?? '—'}</td>
                            <td className="px-5 py-3"><button className="text-teal-600 hover:underline" onClick={() => setSelected(row)}>Details</button></td>
                        </tr>)}</tbody>
                    </table></div>}
            <div className="p-5 flex justify-between items-center border-t border-slate-100 dark:border-white/10 text-sm text-slate-600 dark:text-slate-300"><span>Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span>
                <div className="flex gap-3"><button disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)} className="disabled:opacity-40">Previous</button><button disabled={page * pageSize >= total || loading} onClick={() => setPage(value => value + 1)} className="disabled:opacity-40">Next</button></div>
            </div>
        </section>
        {selected && <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
            <div role="dialog" aria-modal="true" aria-label="Audit event details" onClick={e => e.stopPropagation()} className="bg-white dark:bg-surface-card rounded-2xl p-6 max-w-lg w-full shadow-xl space-y-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Event #{selected.id}</h2>
                <dl className="text-sm text-slate-700 dark:text-slate-200 space-y-2">{Object.entries(selected.details).length ? Object.entries(selected.details).map(([key, value]) => <div key={key}><dt className="font-semibold">{key.replaceAll('_', ' ')}</dt><dd>{Array.isArray(value) ? value.join(', ') : String(value)}</dd></div>) : <p>No additional safe details are available.</p>}</dl>
                <button onClick={() => setSelected(null)} className="px-5 py-2.5 rounded-xl bg-teal-600 text-white">Close</button>
            </div>
        </div>}
    </div>;
}
