import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Building2,
  Check,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Save,
  Search,
  X,
} from 'lucide-react';
import {
  getAdminSchools,
  getAdminUserEffectiveAccess,
  getAdminUserSchoolAssignments,
  updateAdminUserSchoolAssignments,
} from '../../services/api';
import type { AdminSchool, AdminSchoolAssignment, AdminUserSummary, EffectiveAccess } from '../../types';
import { withDraftSchoolScope } from '../../lib/effectiveAccessPreview';
import { cn } from '../../lib/utils';
import { EffectiveAccessPreview } from './EffectiveAccessPreview';

interface SchoolAssignmentDrawerProps {
  user: AdminUserSummary;
  onClose: () => void;
  onSaved?: (access: EffectiveAccess) => void;
}

const PAGE_SIZE = 100;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (axios.isAxiosError(error)) {
    const responseError = error.response?.data?.error;
    if (typeof responseError === 'string') return responseError;
    if (responseError && typeof responseError.message === 'string') return responseError.message;
    if (typeof error.response?.data?.message === 'string') return error.response.data.message;
  }
  return fallback;
};

const setsMatch = (left: Set<number>, right: Set<number>): boolean => {
  if (left.size !== right.size) return false;
  return [...left].every((id) => right.has(id));
};

export const SchoolAssignmentDrawer = ({
  user,
  onClose,
  onSaved,
}: SchoolAssignmentDrawerProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [schools, setSchools] = useState<AdminSchool[]>([]);
  const [knownSchools, setKnownSchools] = useState<Map<number, AdminSchoolAssignment>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [persistedIds, setPersistedIds] = useState<Set<number>>(new Set());
  const [effectiveAccess, setEffectiveAccess] = useState<EffectiveAccess | null>(null);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(true);
  const [isLoadingSchools, setIsLoadingSchools] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [assignmentLoadError, setAssignmentLoadError] = useState<string | null>(null);
  const [schoolLoadError, setSchoolLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [assignmentReloadIndex, setAssignmentReloadIndex] = useState(0);
  const schoolRequestId = useRef(0);

  const isSchoolStaff = user.portal_role === 'school_staff';
  const hasChanges = useMemo(
    () => !setsMatch(selectedIds, persistedIds),
    [persistedIds, selectedIds],
  );

  const selectedSchools = useMemo(
    () => [...selectedIds]
      .map((id) => knownSchools.get(id) ?? { school_id: id, school_name: `School #${id}` })
      .sort((left, right) => left.school_name.localeCompare(right.school_name)),
    [knownSchools, selectedIds],
  );
  const previewAccess = useMemo(
    () => effectiveAccess
      ? withDraftSchoolScope(effectiveAccess, [...selectedIds])
      : null,
    [effectiveAccess, selectedIds],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSaving) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSaving, onClose]);

  useEffect(() => {
    if (!isSchoolStaff) return;
    let cancelled = false;

    Promise.all([
      getAdminUserSchoolAssignments(user.id),
      getAdminUserEffectiveAccess(user.id),
    ])
      .then(([assignments, access]) => {
        if (cancelled) return;
        const ids = new Set(access.assignedSchoolIds);
        setSelectedIds(ids);
        setPersistedIds(new Set(ids));
        setKnownSchools((current) => {
          const next = new Map(current);
          assignments.forEach((school) => next.set(school.school_id, school));
          return next;
        });
        setEffectiveAccess(access);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAssignmentLoadError(getErrorMessage(error, 'Unable to load this user’s current school assignments.'));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAssignments(false);
      });

    return () => {
      cancelled = true;
    };
  }, [assignmentReloadIndex, isSchoolStaff, user.id]);

  const loadSchools = useCallback(async (search: string, requestId: number) => {
    setIsLoadingSchools(true);
    setSchoolLoadError(null);
    try {
      const firstPage = await getAdminSchools({ search: search || undefined, page: 1, limit: PAGE_SIZE });
      const pageCount = Math.ceil(firstPage.total / firstPage.limit);
      const remainingPages = pageCount > 1
        ? await Promise.all(
            Array.from({ length: pageCount - 1 }, (_, index) =>
              getAdminSchools({ search: search || undefined, page: index + 2, limit: PAGE_SIZE }),
            ),
          )
        : [];
      if (requestId !== schoolRequestId.current) return;

      const activeSchools = [firstPage, ...remainingPages]
        .flatMap((response) => response.data)
        .filter((school) => school.is_active)
        .sort((left, right) => left.name.localeCompare(right.name));
      setSchools(activeSchools);
      setKnownSchools((current) => {
        const next = new Map(current);
        activeSchools.forEach((school) => {
          next.set(school.id, { school_id: school.id, school_name: school.name });
        });
        return next;
      });
    } catch (error: unknown) {
      if (requestId === schoolRequestId.current) {
        setSchoolLoadError(getErrorMessage(error, 'Unable to load the active school catalog.'));
        setSchools([]);
      }
    } finally {
      if (requestId === schoolRequestId.current) setIsLoadingSchools(false);
    }
  }, []);

  useEffect(() => {
    if (!isSchoolStaff) return;
    const requestId = schoolRequestId.current + 1;
    schoolRequestId.current = requestId;
    void loadSchools(debouncedSearch, requestId);
  }, [debouncedSearch, isSchoolStaff, loadSchools, user.id]);

  const toggleSchool = (school: AdminSchool) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(school.id)) next.delete(school.id);
      else next.add(school.id);
      return next;
    });
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!isSchoolStaff || !hasChanges) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const updatedAssignments = await updateAdminUserSchoolAssignments(user.id, {
        school_ids: [...selectedIds].sort((left, right) => left - right),
      });
      const savedIds = new Set(updatedAssignments.map((school) => school.school_id));
      setSelectedIds(savedIds);
      setPersistedIds(new Set(savedIds));
      setKnownSchools((current) => {
        const next = new Map(current);
        updatedAssignments.forEach((school) => next.set(school.school_id, school));
        return next;
      });

      try {
        const access = await getAdminUserEffectiveAccess(user.id);
        setEffectiveAccess(access);
        onSaved?.(access);
        toast.success(`School assignments updated for ${user.first_name} ${user.last_name}.`);
      } catch (refreshError: unknown) {
        const message = getErrorMessage(
          refreshError,
          'Assignments were saved, but effective access could not be refreshed. Reopen the drawer to reload it.',
        );
        setSaveError(message);
        toast.error(message);
      }
    } catch (error: unknown) {
      const message = getErrorMessage(error, 'Failed to update school assignments.');
      setSaveError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30" role="presentation">
      <button
        type="button"
        aria-label="Close school assignment drawer"
        className="absolute inset-0 h-full w-full bg-slate-950/45 backdrop-blur-sm"
        disabled={isSaving}
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="school-assignment-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-surface-card"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5 sm:p-6 dark:border-white/10">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-2xl border border-teal-100 bg-teal-50 p-3 dark:border-teal-500/20 dark:bg-teal-500/10">
              <Building2 className="h-6 w-6 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="school-assignment-title" className="text-xl font-bold text-slate-900 dark:text-white">
                School assignments
              </h2>
              <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                {user.first_name} {user.last_name} · {user.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-full border border-slate-200 bg-slate-100 p-2.5 text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {!isSchoolStaff ? (
          <div className="m-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            School assignments are available only for school staff accounts.
          </div>
        ) : (
          <>
            <div className="space-y-4 border-b border-slate-200 p-5 sm:p-6 dark:border-white/10">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {selectedIds.size} {selectedIds.size === 1 ? 'school' : 'schools'} selected
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {effectiveAccess
                      ? `${effectiveAccess.assignedSchoolIds.length} currently persisted in effective access`
                      : 'Loading persisted effective access…'}
                  </p>
                </div>
                {hasChanges && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                    Unsaved changes
                  </span>
                )}
              </div>

              {selectedSchools.length > 0 && (
                <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto" aria-label="Selected schools">
                  {selectedSchools.map((school) => (
                    <span
                      key={school.school_id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300"
                    >
                      <Check className="h-3 w-3" aria-hidden="true" />
                      {school.school_name}
                    </span>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search school, district, barangay, or municipality…"
                  aria-label="Search active schools"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 transition-all focus:outline-none focus:ring-2 focus:ring-teal-500/50 dark:border-teal-500/30 dark:bg-surface-input dark:text-white dark:placeholder-slate-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 sm:p-6">
              {(assignmentLoadError || schoolLoadError || saveError) && (
                <div role="alert" className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{saveError ?? assignmentLoadError ?? schoolLoadError}</span>
                  </div>
                  {(assignmentLoadError || schoolLoadError) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (assignmentLoadError) {
                          setSelectedIds(new Set());
                          setPersistedIds(new Set());
                          setEffectiveAccess(null);
                          setAssignmentLoadError(null);
                          setSaveError(null);
                          setIsLoadingAssignments(true);
                          setAssignmentReloadIndex((current) => current + 1);
                          return;
                        }
                        const requestId = schoolRequestId.current + 1;
                        schoolRequestId.current = requestId;
                        void loadSchools(debouncedSearch, requestId);
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-rose-100 px-3 py-1.5 text-xs font-semibold hover:bg-rose-200 dark:bg-rose-500/20 dark:hover:bg-rose-500/30"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Try again
                    </button>
                  )}
                </div>
              )}

              {previewAccess && (
                <div className="mb-4">
                  <EffectiveAccessPreview user={user} access={previewAccess} isDraft={hasChanges} />
                </div>
              )}

              {isLoadingAssignments || isLoadingSchools ? (
                <div className="flex min-h-48 items-center justify-center text-slate-500 dark:text-slate-400">
                  <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
                  Loading schools…
                </div>
              ) : schools.length === 0 && !schoolLoadError ? (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                  <Building2 className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">No active schools found</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Try a different search term.</p>
                </div>
              ) : (
                <div className="space-y-2" role="group" aria-label="Active schools">
                  {schools.map((school) => {
                    const isSelected = selectedIds.has(school.id);
                    const location = [school.barangay_name, school.municipality_name]
                      .filter(Boolean)
                      .join(', ');
                    return (
                      <label
                        key={school.id}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-all',
                          assignmentLoadError && 'cursor-not-allowed opacity-60',
                          isSelected
                            ? 'border-teal-300 bg-teal-50 dark:border-teal-500/40 dark:bg-teal-500/10'
                            : 'border-slate-200 bg-white hover:border-teal-200 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:border-teal-500/30 dark:hover:bg-white/10',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={Boolean(assignmentLoadError)}
                          onChange={() => toggleSchool(school)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-900 dark:text-white">{school.name}</span>
                          <span className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            {location || school.district || 'Location not recorded'}
                          </span>
                        </span>
                        {isSelected && <Check className="h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden="true" />}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-slate-200 p-5 sm:p-6 dark:border-white/10">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Saving replaces this user’s complete active school list.
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-200 disabled:opacity-50 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isSaving || isLoadingAssignments || Boolean(assignmentLoadError) || !hasChanges}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary-action px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/20 transition-all hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-teal-500 dark:shadow-teal-900/30 dark:hover:bg-teal-600"
                >
                  {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {isSaving ? 'Saving…' : 'Save assignments'}
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
    </div>
  );
};

export default SchoolAssignmentDrawer;
