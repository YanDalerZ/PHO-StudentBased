import {
  AlertTriangle,
  CheckCircle2,
  CircleOff,
  Globe2,
  School,
  ShieldCheck,
} from 'lucide-react';
import type { AdminUserSummary, EffectiveAccess, ModulePermissions, ModuleSlug } from '../../types';
import { getAccessReadiness } from '../../lib/effectiveAccessPreview';
import { cn } from '../../lib/utils';

interface EffectiveAccessPreviewProps {
  user: AdminUserSummary;
  access: EffectiveAccess;
  isDraft: boolean;
}

const modules: Array<{ slug: ModuleSlug; label: string }> = [
  { slug: 'patient-info', label: 'Patient Information' },
  { slug: 'oral-health', label: 'Oral Health' },
  { slug: 'deworming', label: 'Deworming' },
  { slug: 'immunization', label: 'Immunization' },
  { slug: 'vital-signs', label: 'Vital Signs' },
];

const actions: Array<{ key: keyof ModulePermissions; label: string }> = [
  { key: 'can_view', label: 'View' },
  { key: 'can_create', label: 'Create' },
  { key: 'can_edit', label: 'Edit' },
  { key: 'can_approve_registration', label: 'Approve' },
  { key: 'can_report', label: 'Report' },
  { key: 'can_export', label: 'Export' },
];

export const EffectiveAccessPreview = ({ user, access, isDraft }: EffectiveAccessPreviewProps) => {
  const readiness = getAccessReadiness(user.portal_role, access);
  const StatusIcon = readiness.code === 'ready'
    ? CheckCircle2
    : readiness.code === 'management_only'
      ? ShieldCheck
      : AlertTriangle;

  return (
    <section
      aria-label={isDraft ? 'Draft effective access preview' : 'Persisted effective access preview'}
      aria-live="polite"
      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Effective-access preview</h3>
            <span className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
              isDraft
                ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300',
            )}>
              {isDraft ? 'Draft' : 'Persisted'}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isDraft ? 'Shows the access that will result after Save.' : 'Matches the latest server state.'}
          </p>
        </div>
        <div className={cn(
          'flex max-w-sm items-start gap-2 rounded-xl border px-3 py-2 text-xs',
          readiness.code === 'ready'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200'
            : readiness.code === 'management_only'
              ? 'border-slate-200 bg-white text-slate-700 dark:border-white/10 dark:bg-surface-card dark:text-slate-300'
              : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200',
        )}>
          <StatusIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span><strong>{readiness.label}.</strong> {readiness.description}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-surface-card dark:text-slate-300">
        {user.portal_role === 'superuser' ? (
          <Globe2 className="h-4 w-4 text-indigo-500" aria-hidden="true" />
        ) : (
          <School className="h-4 w-4 text-teal-500" aria-hidden="true" />
        )}
        <span>
          {user.portal_role === 'superuser'
            ? 'Province-wide school scope'
            : `${access.assignedSchoolIds.length} assigned ${access.assignedSchoolIds.length === 1 ? 'school' : 'schools'}`}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {modules.map((module) => {
          const permission = access.modulePermissions[module.slug];
          const grantedActions = actions.filter((action) => permission?.[action.key]);
          return (
            <div key={module.slug} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-surface-card">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{module.label}</p>
              {grantedActions.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {grantedActions.map((action) => (
                    <span key={action.key} className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:bg-teal-500/10 dark:text-teal-300">
                      {action.label}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="mt-2 inline-flex items-center gap-1 text-[10px] text-slate-400">
                  <CircleOff className="h-3 w-3" aria-hidden="true" />
                  No access
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default EffectiveAccessPreview;
