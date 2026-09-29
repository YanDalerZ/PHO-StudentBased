import { LogOut, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const AccessDenied = () => {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-surface-dark p-6 text-center">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-xl dark:border-white/10 dark:bg-surface-card sm:p-10">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 dark:bg-rose-500/20">
          <ShieldAlert className="h-8 w-8" aria-hidden="true" />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">403: No assigned access</h2>
        <p className="mx-auto max-w-md text-sm leading-6 text-slate-600 dark:text-slate-400">
          Your account is active, but it does not have a grant for an available portal route. Contact an administrator to request the required module and school assignments.
        </p>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-500">
          Sign out to return to the login page and use another account.
        </p>
        <button
          type="button"
          onClick={logout}
          className="mx-auto mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-primary-action px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 transition-all hover:bg-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:ring-offset-2 dark:bg-teal-500 dark:shadow-teal-900/30 dark:hover:bg-teal-600 dark:focus:ring-offset-surface-dark"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out and return to login
        </button>
      </div>
    </div>
  );
};

export default AccessDenied;
