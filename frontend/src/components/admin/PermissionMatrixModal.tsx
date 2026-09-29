import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Check,
  CircleOff,
  LoaderCircle,
  RotateCcw,
  Save,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import {
  getAdminModules,
  getAdminUserEffectiveAccess,
  getAdminUserModulePermissions,
  updateAdminUserModulePermissions,
} from '../../services/api';
import type { AdminModule, AdminUserSummary, EffectiveAccess } from '../../types';
import {
  applyPermissionToggle,
  buildPermissionDraft,
  buildPermissionPayload,
  emptyModulePermissions,
  permissionPayloadKey,
  validateModulePermission,
  type PermissionAction,
  type PermissionDraft,
} from '../../lib/permissionMatrix';
import { cn } from '../../lib/utils';
import { withDraftModulePermissions } from '../../lib/effectiveAccessPreview';
import { EffectiveAccessPreview } from './EffectiveAccessPreview';

interface PermissionMatrixModalProps {
  user: AdminUserSummary;
  onClose: () => void;
}

const actions: Array<{ key: PermissionAction; label: string; description: string }> = [
  { key: 'can_view', label: 'View', description: 'Read module records' },
  { key: 'can_create', label: 'Create', description: 'Add new records' },
  { key: 'can_edit', label: 'Edit', description: 'Modify existing records' },
  { key: 'can_approve_registration', label: 'Approve', description: 'Review QR submissions' },
  { key: 'can_report', label: 'Report', description: 'Open consolidated reports' },
  { key: 'can_export', label: 'Export', description: 'Download report files' },
];

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    const responseError = error.response?.data?.error;
    if (typeof responseError === 'string') return responseError;
    if (responseError && typeof responseError.message === 'string') return responseError.message;
    if (typeof error.response?.data?.message === 'string') return error.response.data.message;
  }
  return fallback;
};

export const PermissionMatrixModal = ({ user, onClose }: PermissionMatrixModalProps) => {
  const [modules, setModules] = useState<AdminModule[]>([]);
  const [draft, setDraft] = useState<PermissionDraft>({});
  const [persistedKey, setPersistedKey] = useState('[]');
  const [effectiveAccess, setEffectiveAccess] = useState<EffectiveAccess | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadIndex, setReloadIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAdminModules(),
      getAdminUserModulePermissions(user.id),
      getAdminUserEffectiveAccess(user.id),
    ])
      .then(([moduleCatalog, grants, access]) => {
        if (cancelled) return;
        const sortedModules = moduleCatalog
          .slice()
          .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id);
        const nextDraft = buildPermissionDraft(sortedModules, grants);
        setModules(sortedModules);
        setDraft(nextDraft);
        setPersistedKey(permissionPayloadKey(buildPermissionPayload(sortedModules, nextDraft)));
        setEffectiveAccess(access);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, 'Unable to load the module permission matrix.'));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadIndex, user.id]);

  const payload = useMemo(() => buildPermissionPayload(modules, draft), [draft, modules]);
  const draftKey = useMemo(() => permissionPayloadKey(payload), [payload]);
  const hasChanges = draftKey !== persistedKey;
  const previewAccess = useMemo(
    () => effectiveAccess
      ? withDraftModulePermissions(effectiveAccess, modules, draft)
      : null,
    [draft, effectiveAccess, modules],
  );

  const validationMessages = useMemo(() => modules.flatMap((module) =>
    validateModulePermission(
      module.slug,
      user.portal_role,
      draft[module.id] ?? emptyModulePermissions(),
    ).map((message) => `${module.name}: ${message}`)), [draft, modules, user.portal_role]);

  const grantedActionCount = useMemo(
    () => payload.reduce(
      (total, permission) => total + actions.filter((action) => permission[action.key]).length,
      0,
    ),
    [payload],
  );

  const togglePermission = (module: AdminModule, action: PermissionAction) => {
    const current = draft[module.id] ?? emptyModulePermissions();
    const isApprovalRestricted = action === 'can_approve_registration'
      && (user.portal_role !== 'school_staff' || module.slug !== 'patient-info');
    if (isApprovalRestricted && !current[action]) return;

    setDraft((previous) => ({
      ...previous,
      [module.id]: applyPermissionToggle(current, action, !current[action]),
    }));
    setSaveError(null);
  };

  const clearModule = (moduleId: number) => {
    setDraft((previous) => ({ ...previous, [moduleId]: emptyModulePermissions() }));
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!hasChanges || validationMessages.length > 0) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const savedGrants = await updateAdminUserModulePermissions(user.id, payload);
      const nextDraft = buildPermissionDraft(modules, savedGrants);
      setDraft(nextDraft);
      setPersistedKey(permissionPayloadKey(buildPermissionPayload(modules, nextDraft)));
      try {
        const access = await getAdminUserEffectiveAccess(user.id);
        setEffectiveAccess(access);
        toast.success(`Module permissions updated for ${user.first_name} ${user.last_name}.`);
      } catch (refreshError: unknown) {
        setEffectiveAccess(null);
        const message = getErrorMessage(
          refreshError,
          'Permissions were saved, but effective access could not be refreshed. Reopen the matrix to reload it.',
        );
        setSaveError(message);
        toast.error(message);
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Failed to update module permissions.');
      setSaveError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) onClose();
  };

  return (
    <Modal
      isOpen
      onClose={handleClose}
      title="Module permission matrix"
      className="max-h-[92vh] max-w-6xl"
    >
      <div className="space-y-5 pt-1">
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/10 dark:bg-white/5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-2xl border border-teal-100 bg-teal-50 p-2.5 dark:border-teal-500/20 dark:bg-teal-500/10">
              <ShieldCheck className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                {user.first_name} {user.last_name}
              </p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {user.email} · {user.portal_role === 'school_staff' ? 'School staff' : 'Superuser'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600 dark:border-white/10 dark:bg-surface-card dark:text-slate-300">
              {payload.length} modules
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600 dark:border-white/10 dark:bg-surface-card dark:text-slate-300">
              {grantedActionCount} actions
            </span>
            {hasChanges && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                Unsaved changes
              </span>
            )}
          </div>
        </div>

        {(loadError || saveError || validationMessages.length > 0) && (
          <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="space-y-1">
                {loadError && <p>{loadError}</p>}
                {saveError && <p>{saveError}</p>}
                {validationMessages.map((message) => <p key={message}>{message}</p>)}
              </div>
            </div>
            {loadError && (
              <button
                type="button"
                onClick={() => {
                  setIsLoading(true);
                  setLoadError(null);
                  setReloadIndex((current) => current + 1);
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-rose-100 px-3 py-1.5 text-xs font-semibold hover:bg-rose-200 dark:bg-rose-500/20 dark:hover:bg-rose-500/30"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Try again
              </button>
            )}
          </div>
        )}

        {previewAccess && (
          <EffectiveAccessPreview user={user} access={previewAccess} isDraft={hasChanges} />
        )}

        {isLoading ? (
          <div className="flex min-h-64 items-center justify-center text-slate-500 dark:text-slate-400">
            <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
            Loading permission matrix…
          </div>
        ) : !loadError && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/10">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10">
              <thead className="bg-slate-50 dark:bg-white/5">
                <tr>
                  <th className="min-w-52 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Module
                  </th>
                  {actions.map((action) => (
                    <th key={action.key} className="min-w-24 px-2 py-3 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <span className="block">{action.label}</span>
                      <span className="mt-0.5 block text-[10px] font-normal text-slate-400">{action.description}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-white/10 dark:bg-transparent">
                {modules.map((module) => {
                  const permission = draft[module.id] ?? emptyModulePermissions();
                  const moduleHasGrant = Object.values(permission).some(Boolean);
                  return (
                    <tr key={module.id}>
                      <th scope="row" className="px-4 py-4 text-left align-middle">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{module.name}</p>
                            <div className="mt-1 flex items-center gap-1.5">
                              <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">{module.slug}</span>
                              <span className={cn(
                                'rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                                module.is_active
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                                  : 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400',
                              )}>
                                {module.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                            {moduleHasGrant && (
                              <button
                                type="button"
                                onClick={() => clearModule(module.id)}
                                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                              >
                                <X className="h-3 w-3" />
                                Clear module
                              </button>
                            )}
                          </div>
                        </div>
                      </th>
                      {actions.map((action) => {
                        const checked = permission[action.key];
                        const approvalRestricted = action.key === 'can_approve_registration'
                          && (user.portal_role !== 'school_staff' || module.slug !== 'patient-info');
                        const disabled = approvalRestricted && !checked;
                        return (
                          <td key={action.key} className="px-2 py-4 text-center align-middle">
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={checked}
                              aria-label={`${action.label} access for ${module.name}`}
                              disabled={disabled}
                              onClick={() => togglePermission(module, action.key)}
                              title={disabled ? 'Registration approval is available only to school staff for Patient Information.' : action.description}
                              className={cn(
                                'mx-auto flex h-8 w-8 items-center justify-center rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-teal-500/50',
                                checked
                                  ? 'border-teal-500 bg-teal-500 text-white shadow-sm'
                                  : 'border-slate-300 bg-white text-transparent hover:border-teal-400 dark:border-slate-600 dark:bg-surface-input',
                                disabled && 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-60 dark:border-slate-700 dark:bg-slate-800',
                              )}
                            >
                              {disabled ? <CircleOff className="h-3.5 w-3.5" /> : <Check className="h-4 w-4" />}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-white/10">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Saving replaces the user’s complete active permission set. Empty module rows are omitted.
          </p>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSaving}
              className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-200 disabled:opacity-50 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving || isLoading || Boolean(loadError) || !hasChanges || validationMessages.length > 0}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-action px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 transition-all hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-teal-500 dark:shadow-teal-900/30 dark:hover:bg-teal-600"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? 'Saving…' : 'Save permissions'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default PermissionMatrixModal;
