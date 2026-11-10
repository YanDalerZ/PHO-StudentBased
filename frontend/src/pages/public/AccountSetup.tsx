import { useEffect, useState, type FormEvent } from 'react';
import { completeAccountSetup, supportError } from '../../services/supportApi';

const field = 'w-full rounded-xl border border-slate-200 bg-slate-50 p-3 focus-visible:ring-2 focus-visible:ring-teal-500 dark:border-slate-700 dark:bg-surface-input';
const button = 'inline-flex rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white hover:bg-teal-800 disabled:opacity-50';

export default function AccountSetup() {
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get('password') ?? '');
    if (password !== data.get('confirmation')) { setError('The passwords must match.'); return; }
    if (password.length < 12 || new TextEncoder().encode(password).length > 72) {
      setError('Use at least 12 characters and no more than 72 bytes.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await completeAccountSetup(token, password);
      form.reset();
      setToken('');
      setComplete(true);
    } catch (failure) { setError(supportError(failure)); }
    finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-12 font-outfit text-slate-900 dark:bg-surface-dark dark:text-slate-100">
    <section className="mx-auto max-w-md space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-surface-card">
      <h1 className="text-2xl font-bold">Set up your PHO account</h1>
      {complete ? <>
        <p role="status">Your password is saved. You can sign in with your account email and new password.</p>
        <a className={button} href="/Login">Go to sign in</a>
      </> : /^[A-Za-z0-9_-]{43}$/.test(token) ? <form className="space-y-4" onSubmit={submit}>
        <p id="setup-password-help">Choose a password with at least 12 characters.</p>
        <label className="block space-y-1"><span className="font-medium">New password</span>
          <input className={field} name="password" type="password" autoComplete="new-password"
            required minLength={12} maxLength={72} aria-describedby="setup-password-help" />
        </label>
        <label className="block space-y-1"><span className="font-medium">Confirm password</span>
          <input className={field} name="confirmation" type="password" autoComplete="new-password" required maxLength={72} />
        </label>
        {error && <p role="alert" className="text-rose-700 dark:text-rose-300">{error}</p>}
        <button type="submit" className={button} disabled={busy}>{busy ? 'Saving…' : 'Set password'}</button>
      </form> : <p role="alert">Open the setup link from your email. If you need a new link, contact your PHO administrator.</p>}
    </section>
  </main>;
}
