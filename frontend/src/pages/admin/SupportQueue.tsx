import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import {
  checkNotificationDelivery, listAccountRequests, listReports, rejectRequest, retryNotification, supportCategories, supportError, updateReport,
  type AccountRequest, type AccountStatus, type ReportStatus, type SupportReport,
} from '../../services/supportApi';

const reportStates = { open: 'Open', in_review: 'In review', resolved: 'Resolved' };
const accountStates = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
const notificationLabels = { pending: 'Waiting to send', sending: 'Sending or awaiting confirmation', accepted: 'Accepted by email provider', delivered: 'Delivered to mail server', failed: 'Notification failed' };
const noticeErrors: Record<string, string> = {
  NOT_CONFIGURED: 'Email provider is not configured.',
  SETUP_EMAIL_NOT_CONFIGURED: 'EmailJS or the PHO setup page address is not configured.',
  SETUP_CANCELLED: 'An administrator cancelled password setup.',
  PROVIDER_REJECTED: 'Email provider rejected the send request. Check provider logs.',
  DELIVERY_UNCONFIRMED: 'Could not confirm the send. Check provider logs before retrying.',
  BOUNCED: 'The receiving server rejected the email. Check the cause before retrying.',
  SUPPRESSED: 'The provider suppressed the email. Check the cause before retrying.',
  PROVIDER_FAILED: 'The provider could not deliver the email.',
};
const control = 'rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-surface-input p-2.5 focus-visible:ring-2 focus-visible:ring-teal-500';
const button = 'inline-flex items-center rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50';
const secondary = 'rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50';
const panel = 'rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-card p-5 space-y-4';

function ReportCard({ entry, done }: { entry: SupportReport; done: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const status = data.get('status') as ReportStatus;
    const notes = String(data.get('notes')).trim();
    if (status === 'resolved' && !notes) { setError('Add resolution notes before resolving.'); return; }
    setBusy(true);
    setError('');
    try { await updateReport(entry.id, status, notes); done('Problem report updated.'); }
    catch (failure) { setError(supportError(failure)); }
    finally { setBusy(false); }
  }
  return <article className={panel}>
    <h2 className="text-lg font-semibold">{supportCategories[entry.category]} · {reportStates[entry.status]}</h2>
    <p className="text-sm break-words">{entry.name} · {entry.reply_email}</p>
    <p className="text-sm break-all text-slate-600 dark:text-slate-300">Reference: {entry.id}</p>
    <p className="text-sm">{new Date(entry.created_at).toLocaleString()}</p>
    {entry.page_or_module && <p className="break-words">Page or module: {entry.page_or_module}</p>}
    <p className="whitespace-pre-wrap break-words">{entry.description}</p>
    <form onSubmit={save} className="space-y-3">
      <fieldset disabled={busy} className="space-y-3">
        <label className="block space-y-1 text-sm"><span>Status</span>
          <select name="status" defaultValue={entry.status} className={cn(control, 'block')}>
            {Object.entries(reportStates).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label className="block space-y-1 text-sm"><span>Resolution notes</span>
          <textarea name="notes" maxLength={2000} rows={2} defaultValue={entry.resolution_notes ?? ''} className={cn(control, 'block w-full')} />
        </label>
        {error && <p role="alert" className="text-rose-700 dark:text-rose-300">{error}</p>}
        <button className={button}>{busy ? 'Saving…' : 'Save report'}</button>
      </fieldset>
    </form>
  </article>;
}

function AccountCard({ entry, done }: { entry: AccountRequest; done: (message: string) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function perform(operation: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await operation(); done(message); }
    catch (failure) { setError(supportError(failure)); }
    finally { setBusy(false); }
  }
  return <article className={panel}>
    <h2 className="text-lg font-semibold break-words">{entry.name} · {accountStates[entry.status]}</h2>
    <p className="text-sm">{new Date(entry.created_at).toLocaleString()}</p>
    <dl className="grid sm:grid-cols-2 gap-3 text-sm">
      {[['Work email', entry.work_email], ['Contact number', entry.contact_no], ['Requested job title', entry.job_title], ['School or office', entry.school_or_office]].map(([label, value]) =>
        <div key={label}><dt className="font-semibold">{label}</dt><dd className="break-words">{value}</dd></div>)}
      <div className="sm:col-span-2"><dt className="font-semibold">Reason for access</dt><dd className="whitespace-pre-wrap break-words">{entry.reason}</dd></div>
    </dl>
    {entry.status === 'pending' && <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Link className={button} to={`/admin/users/from-request/${entry.id}`}>Approve &amp; prepare account</Link>
        <button type="button" className={secondary} onClick={() => setRejecting(!rejecting)} disabled={busy} aria-expanded={rejecting}>{rejecting ? 'Cancel rejection' : 'Reject request'}</button>
      </div>
      {rejecting && <form className="space-y-3" onSubmit={event => {
        event.preventDefault();
        const note = String(new FormData(event.currentTarget).get('note')).trim();
        if (!note) { setError('Enter a reason for rejection.'); return; }
        void perform(() => rejectRequest(entry.id, note), 'Request rejected.');
      }}>
        <label className="block text-sm space-y-1"><span>Reason for rejection (admin only)</span>
          <textarea className={cn(control, 'block w-full')} name="note" required maxLength={2000} disabled={busy} />
        </label>
        <button className={secondary} disabled={busy}>Confirm rejection</button>
      </form>}
    </div>}
    {entry.decision_note && <p className="whitespace-pre-wrap break-words">Decision note: {entry.decision_note}</p>}
    {entry.status === 'approved' && <div className="space-y-2 text-sm">
      <p>Account #{entry.created_user_id} · {entry.notification_status ? notificationLabels[entry.notification_status] : 'Notification unavailable'}</p>
      {entry.setup_required && <p>{entry.setup_pending ? 'Pending password setup' : entry.setup_completed_at ? 'Password setup completed' : 'Password setup cancelled'}</p>}
      {entry.setup_pending && entry.setup_expires_at && <p>Setup link expires {new Date(entry.setup_expires_at).toLocaleString()}.</p>}
      {!!entry.attempt_count && <p>Send attempts: {entry.attempt_count}</p>}
      {entry.notification_provider_id && <p className="break-all">Provider reference: {entry.notification_provider_id}</p>}
      {entry.notification_error && <p>{noticeErrors[entry.notification_error] ?? 'Email could not be sent.'}</p>}
      {entry.notification_status === 'accepted' && !entry.setup_required &&
        <button type="button" className={secondary} disabled={busy} onClick={() => void perform(() => checkNotificationDelivery(entry.id), 'Notification status refreshed.')}>
          {busy ? 'Checking…' : 'Check email delivery'}
        </button>}
      {(entry.setup_required ? entry.setup_pending : entry.notification_status && !['accepted', 'delivered'].includes(entry.notification_status)) &&
        <button type="button" className={secondary} disabled={busy} onClick={() => void perform(() => retryNotification(entry.id), 'Notification status refreshed.')}>
          {busy ? 'Sending…' : entry.setup_required ? 'Send a new setup link' : 'Retry notification'}
        </button>}
      {entry.setup_pending && entry.notification_status === 'accepted' && <p>Sending a new link replaces the old one. Wait one minute between accepted sends.</p>}
    </div>}
    {error && <p role="alert" className="text-rose-700 dark:text-rose-300">{error}</p>}
  </article>;
}

export default function SupportQueue() {
  const [kind, setKind] = useState<'accounts' | 'reports'>('accounts');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState('');
  const queryKey = `${kind}:${status}:${page}:${version}`;
  const [result, setResult] = useState<{ key: string; data: (SupportReport | AccountRequest)[]; hasMore: boolean; error?: string }>();

  useEffect(() => {
    let current = true;
    const list = kind === 'accounts' ? listAccountRequests((status || undefined) as AccountStatus | undefined, page)
      : listReports((status || undefined) as ReportStatus | undefined, page);
    void list.then(value => { if (current) setResult({ key: queryKey, ...value }); })
      .catch(failure => { if (current) setResult({ key: queryKey, data: [], hasMore: false, error: supportError(failure) }); });
    return () => { current = false; };
  }, [kind, status, page, queryKey]);

  const active = result?.key === queryKey ? result : undefined;
  const refresh = (text: string) => { setMessage(text); setVersion(value => value + 1); };
  return <main className="font-outfit max-w-5xl mx-auto p-4 sm:p-6 space-y-5 text-slate-900 dark:text-slate-100">
    <div><h1 className="text-2xl font-bold">Contact &amp; Support</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Review reports and provision approved accounts.</p></div>
    <div className="flex flex-wrap items-end gap-2">
      {(['accounts', 'reports'] as const).map(value => <button key={value} type="button"
        aria-pressed={kind === value} className={kind === value ? button : secondary}
        onClick={() => { setKind(value); setStatus(''); setPage(1); setMessage(''); }}>
        {value === 'accounts' ? 'Account requests' : 'Problem reports'}
      </button>)}
      <label className="text-sm">Filter by status
        <select className={cn(control, 'block')} value={status} onChange={event => { setStatus(event.target.value); setPage(1); setMessage(''); }}>
          <option value="">All statuses</option>
          {Object.entries(kind === 'accounts' ? accountStates : reportStates).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <button type="button" className={secondary} onClick={() => refresh('')}>Refresh</button>
    </div>
    {message && <p role="status">{message}</p>}
    {!active ? <p role="status">Loading queue…</p> : active.error ? <p role="alert">{active.error}</p> :
      active.data.length ? active.data.map(entry => 'work_email' in entry
        ? <AccountCard key={entry.id} entry={entry} done={refresh} />
        : <ReportCard key={entry.id} entry={entry} done={refresh} />)
        : <p>No submissions match this filter.</p>}
    <nav aria-label="Queue pages" className="flex items-center gap-3">
      <button className={secondary} disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
      <span>Page {page}</span>
      <button className={secondary} disabled={!active?.hasMore} onClick={() => setPage(page + 1)}>Next</button>
    </nav>
  </main>;
}
