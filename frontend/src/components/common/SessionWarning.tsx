import { useEffect, useRef } from 'react';
import { Clock3 } from 'lucide-react';

interface Props {
  seconds: number;
  maximum: boolean;
  pending: boolean;
  onContinue: () => void;
  onLogout: () => void;
}

export function SessionWarning({ seconds, maximum, pending, onContinue, onLogout }: Props) {
  const continueRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (maximum || pending) dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    else continueRef.current?.focus();
  }, [maximum, pending]);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
    <div id="session-warning-dialog" ref={dialogRef} role="alertdialog" aria-modal="true"
      aria-labelledby="session-warning-title" aria-describedby="session-warning-description"
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        if (!buttons.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}
      className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-surface-card font-outfit">
      <div className="mb-4 inline-flex rounded-2xl bg-amber-50 p-3 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"><Clock3 aria-hidden="true" /></div>
      <h2 id="session-warning-title" className="text-xl font-bold text-slate-900 dark:text-white">Your session is ending</h2>
      <p id="session-warning-description" className="mt-2 text-sm text-slate-700 dark:text-slate-300">
        {maximum ? 'The 8-hour maximum session lifetime is nearly reached.' : 'Your session will expire from inactivity soon.'}
        {' '}Unsaved form entries will be lost. Save your work before the countdown ends; nothing is submitted automatically.
      </p>
      <p className="mt-4 text-3xl font-semibold tabular-nums text-amber-700 dark:text-amber-400" role="timer" aria-live="off" aria-label={`${seconds} seconds remaining`}>{clock}</p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onLogout} className="rounded-xl border border-slate-200 px-4 py-2.5 font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">Log out</button>
        <button ref={continueRef} type="button" onClick={onContinue} disabled={pending || maximum || seconds === 0}
          className="rounded-xl bg-teal-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2">
          {pending ? 'Checking…' : 'Continue session'}
        </button>
      </div>
    </div>
  </div>;
}
