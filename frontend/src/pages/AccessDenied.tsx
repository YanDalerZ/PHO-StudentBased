import { ShieldAlert } from 'lucide-react';

const AccessDenied = () => (
  <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
    <div className="w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center mb-4">
      <ShieldAlert className="w-8 h-8" />
    </div>
    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">403: No assigned access</h2>
    <p className="text-slate-600 dark:text-slate-400 max-w-md text-sm">
      Your account is active, but it does not have a grant for an available portal route. Contact an administrator to request the required module and school assignments.
    </p>
  </div>
);

export default AccessDenied;
