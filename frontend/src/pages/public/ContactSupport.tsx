import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { ArrowLeft, LifeBuoy, UserPlus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { submitAccountRequest, submitProblem, supportCategories, supportError } from '../../services/supportApi';

type Choice = 'report' | 'account';
const input = 'w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-teal-500/30 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50';
type Field = { name: string; label: string; max: number; min?: number; type?: string; optional?: boolean; multiline?: boolean };
const nameField = { name: 'name', label: 'Full name', max: 200, min: 2 };
const accountFields: Field[] = [
  nameField, { name: 'work_email', label: 'Work email', type: 'email', max: 254 },
  { name: 'contact_no', label: 'Contact number', type: 'tel', max: 30 },
  { name: 'job_title', label: 'Job title', max: 100 },
  { name: 'school_or_office', label: 'School or office', max: 200 },
  { name: 'reason', label: 'Reason for access', max: 2000, min: 10, multiline: true },
];
const reportFields: Field[] = [
  nameField, { name: 'reply_email', label: 'Reply email', type: 'email', max: 254 },
  { name: 'page_or_module', label: 'Page or module (optional)', max: 150, optional: true },
  { name: 'description', label: 'Describe the problem', max: 2000, min: 10, multiline: true },
];

export default function ContactSupport() {
  const [choice, setChoice] = useState<Choice>('report');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const reset = () => { setMessage(''); setReference(''); setError(''); setFieldErrors({}); };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(Array.from(new FormData(form), ([key, value]) => [key, String(value)]));
    reset();
    setBusy(true);
    try {
      if (choice === 'report') {
        setReference((await submitProblem(data)).reference);
        setMessage('Your problem report was submitted. Keep this reference for follow-up.');
      } else {
        setMessage((await submitAccountRequest(data)).message);
      }
      form.reset();
    } catch (failure) {
      setError(supportError(failure));
      if (axios.isAxiosError(failure)) setFieldErrors(failure.response?.data?.fieldErrors ?? {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-surface-dark py-8 sm:py-12 px-4 font-outfit text-slate-900 dark:text-slate-100">
      <div className="max-w-3xl mx-auto space-y-5">
        <a href="/Login" className="inline-flex items-center gap-2 text-sm font-semibold text-teal-700 dark:text-teal-300 hover:underline"><ArrowLeft size={16} /> Back to Login</a>
        <section className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-3xl p-6 sm:p-10 shadow-xl space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Contact &amp; Support</h1>
            <p className="mt-2 text-slate-600 dark:text-slate-300">Get help with the PHO portal or ask for access.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([['report', 'Report a problem', LifeBuoy], ['account', 'Request an account', UserPlus]] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" aria-pressed={choice === value} disabled={busy}
                onClick={() => { if (value !== choice) { reset(); setChoice(value); } }}
                className={cn('flex items-center gap-3 rounded-xl border p-4 font-semibold focus-visible:ring-2 focus-visible:ring-teal-500',
                  choice === value ? 'bg-teal-50 border-teal-500 text-teal-900 dark:bg-teal-900/40 dark:text-teal-100' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800')}>
                <Icon size={20} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
          {choice === 'account' && <p className="rounded-xl bg-teal-50 dark:bg-teal-950/50 p-4 text-sm">
            Submitting a request does not create an account or grant access. A PHO administrator reviews your request and decides what access to grant.
          </p>}
          <p id="support-privacy" className="text-sm text-slate-600 dark:text-slate-300">Do not include passwords, student names, student health information, or other student identifiers.</p>
          {message && <div role="status" className="rounded-xl bg-emerald-50 dark:bg-emerald-950/60 p-4">
            {message}{reference && <p className="mt-2 break-all font-semibold">Reference: {reference}</p>}
          </div>}
          {error && <p role="alert" className="text-rose-700 dark:text-rose-300">{error}</p>}
          {!message && <form key={choice} onSubmit={submit} aria-describedby="support-privacy" className="space-y-5">
            <fieldset disabled={busy} className="space-y-4">
              {choice === 'report' && <label className="block text-sm font-medium space-y-1">
                <span>Problem category</span>
                <select name="category" className={input} required defaultValue="">
                  <option value="" disabled>Select a category</option>
                  {Object.entries(supportCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(choice === 'report' ? reportFields : accountFields).map(field => {
                  const props = {
                    name: field.name, maxLength: field.max, minLength: field.min, required: !field.optional,
                    'aria-invalid': !!fieldErrors[field.name], 'aria-describedby': fieldErrors[field.name] ? `${field.name}-error` : undefined,
                    className: input,
                  };
                  return <label key={field.name} className={cn('block text-sm font-medium space-y-1', field.multiline && 'sm:col-span-2')}>
                    <span>{field.label}</span>
                    {field.multiline ? <textarea rows={4} {...props} /> : <input type={field.type ?? 'text'} {...props} />}
                    {fieldErrors[field.name] && <span id={`${field.name}-error`} className="block text-rose-700 dark:text-rose-300">{fieldErrors[field.name][0]}</span>}
                  </label>;
                })}
              </div>
              <div hidden><label>Leave this blank<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
              <button type="submit" className="w-full sm:w-auto rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-60">
                {busy ? 'Submitting…' : choice === 'report' ? 'Submit problem report' : 'Submit account request'}
              </button>
            </fieldset>
          </form>}
          {message && <button type="button" onClick={reset} className="text-teal-700 dark:text-teal-300 font-semibold hover:underline">Send another submission</button>}
        </section>
      </div>
    </main>
  );
}
