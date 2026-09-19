import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  FileText,
  Heart,
  Droplets,
  Syringe,
  HeartPulse,
  ChevronUp,
  ChevronDown,
  Pencil,
  AlertTriangle,
  RefreshCw,
  Sliders,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Lock,
} from 'lucide-react';
import { DataTable, type Column } from '../../components/common/DataTable';
import { Modal } from '../../components/common/Modal';
import { FormField } from '../../components/common/FormField';
import { getAdminModules, updateAdminModule } from '../../services/api';
import type { AdminModule, ApprovedModuleSlug, UpdateAdminModulePayload } from '../../types';
import { toast } from 'react-hot-toast';
import { cn } from '../../lib/utils';

// Helper to map approved module slugs to visual icons and color palettes
const getModuleVisuals = (slug: ApprovedModuleSlug, customIconName?: string | null) => {
  const iconKey = customIconName || slug;

  switch (iconKey) {
    case 'patient-info':
    case 'FileText':
      return {
        icon: FileText,
        color: 'teal',
        badgeBg: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
        iconBg: 'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-800/60',
      };
    case 'oral-health':
    case 'Heart':
    case 'Activity':
      return {
        icon: Heart,
        color: 'rose',
        badgeBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
        iconBg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/60',
      };
    case 'deworming':
    case 'Droplets':
      return {
        icon: Droplets,
        color: 'emerald',
        badgeBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        iconBg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60',
      };
    case 'immunization':
    case 'Syringe':
      return {
        icon: Syringe,
        color: 'blue',
        badgeBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
        iconBg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/60',
      };
    case 'vital-signs':
    case 'HeartPulse':
      return {
        icon: HeartPulse,
        color: 'purple',
        badgeBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
        iconBg: 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/60',
      };
    default:
      return {
        icon: Sliders,
        color: 'slate',
        badgeBg: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
        iconBg: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
      };
  }
};

const AVAILABLE_ICONS = [
  { value: 'FileText', label: 'FileText (Demographics & History)' },
  { value: 'Heart', label: 'Heart (Dental & Health)' },
  { value: 'Activity', label: 'Activity (Clinical Diagnostic)' },
  { value: 'Droplets', label: 'Droplets (Deworming & Medication)' },
  { value: 'Syringe', label: 'Syringe (Vaccines & Immunization)' },
  { value: 'HeartPulse', label: 'HeartPulse (Vital Signs Screening)' },
];

const ModuleManagement: React.FC = () => {
  const [modules, setModules] = useState<AdminModule[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState<number>(0);

  // Reorder loading tracker
  const [reorderingId, setReorderingId] = useState<number | null>(null);

  // Active / Inactive toggle confirmation modal state
  const [confirmToggleModule, setConfirmToggleModule] = useState<AdminModule | null>(null);
  const [isTogglingStatus, setIsTogglingStatus] = useState<boolean>(false);

  // Edit Modal state
  const [editingModule, setEditingModule] = useState<AdminModule | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editFormData, setEditFormData] = useState<{
    description: string;
    icon: string;
    sort_order: number;
    is_active: boolean;
  }>({
    description: '',
    icon: 'FileText',
    sort_order: 0,
    is_active: true,
  });
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);

  // Trigger data refresh
  const triggerRefresh = useCallback(() => {
    setIsLoading(true);
    setRefreshIndex((prev) => prev + 1);
  }, []);

  // Fetch live module configuration
  useEffect(() => {
    let isMounted = true;

    getAdminModules()
      .then((data) => {
        if (isMounted) {
          // Keep sorted by sort_order ascending, then id
          const sorted = [...data].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
          setModules(sorted);
          setFetchError(null);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          console.error('Failed to load admin module configurations:', err);
          setFetchError('Unable to load module configurations. Please check network connectivity and try again.');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [refreshIndex]);

  // Extract server error messages safely
  const extractErrorMessage = (err: unknown, fallback: string): string => {
    if (axios.isAxiosError(err)) {
      const errData = err.response?.data?.error;
      if (typeof errData === 'string') return errData;
      if (errData?.fieldErrors) {
        const firstKey = Object.keys(errData.fieldErrors)[0];
        if (firstKey && errData.fieldErrors[firstKey]?.length) {
          return `${firstKey}: ${errData.fieldErrors[firstKey][0]}`;
        }
      }
      if (err.response?.data?.message) return err.response.data.message;
    }
    return fallback;
  };

  // Reordering handler (Move Up or Move Down)
  const handleReorder = useCallback(
    async (mod: AdminModule, direction: 'up' | 'down') => {
      const currentIndex = modules.findIndex((m) => m.id === mod.id);
      if (currentIndex === -1) return;

      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= modules.length) return;

      const targetModule = modules[targetIndex];
      if (!targetModule) return;

      setReorderingId(mod.id);

      // Optimistic reorder
      const tempOrder = mod.sort_order;
      const targetOrder = targetModule.sort_order;

      // Swap sort orders or calculate distinct integers
      const newModOrder = targetOrder;
      const newTargetOrder = tempOrder === targetOrder ? (direction === 'up' ? targetOrder + 1 : targetOrder - 1) : tempOrder;

      try {
        await Promise.all([
          updateAdminModule(mod.id, { sort_order: newModOrder }),
          updateAdminModule(targetModule.id, { sort_order: newTargetOrder }),
        ]);

        toast.success(`Updated sort order for ${mod.name}.`);
        triggerRefresh();
      } catch (err: unknown) {
        console.error('Failed to update sort order:', err);
        const msg = extractErrorMessage(err, 'Failed to update module order.');
        toast.error(msg);
        triggerRefresh();
      } finally {
        setReorderingId(null);
      }
    },
    [modules, triggerRefresh]
  );

  // Status toggle confirmation launcher
  const openConfirmToggle = useCallback((mod: AdminModule) => {
    setConfirmToggleModule(mod);
  }, []);

  const closeConfirmToggle = () => {
    if (isTogglingStatus) return;
    setConfirmToggleModule(null);
  };

  // Execute confirmed status toggle
  const handleExecuteStatusToggle = async () => {
    if (!confirmToggleModule) return;

    setIsTogglingStatus(true);
    const targetId = confirmToggleModule.id;
    const nextActiveState = !confirmToggleModule.is_active;

    try {
      await updateAdminModule(targetId, { is_active: nextActiveState });
      toast.success(`${confirmToggleModule.name} is now ${nextActiveState ? 'Active' : 'Inactive'}.`);
      setConfirmToggleModule(null);
      triggerRefresh();
    } catch (err: unknown) {
      console.error('Failed to toggle module status:', err);
      const msg = extractErrorMessage(err, `Failed to update status for ${confirmToggleModule.name}.`);
      toast.error(msg);
    } finally {
      setIsTogglingStatus(false);
    }
  };

  // Open Edit Modal
  const openEditModal = useCallback((mod: AdminModule) => {
    setEditingModule(mod);
    setEditFormData({
      description: mod.description || '',
      icon: mod.icon || 'FileText',
      sort_order: mod.sort_order,
      is_active: mod.is_active,
    });
    setEditErrors({});
    setIsEditModalOpen(true);
  }, []);

  const closeEditModal = () => {
    if (isSubmittingEdit) return;
    setIsEditModalOpen(false);
    setEditingModule(null);
    setEditErrors({});
  };

  // Validate and submit Edit form
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModule) return;

    const errors: Record<string, string> = {};
    if (!editFormData.description.trim()) {
      errors.description = 'Module description cannot be blank.';
    }
    if (editFormData.sort_order < 0) {
      errors.sort_order = 'Sort order must be a non-negative integer.';
    }

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }

    setIsSubmittingEdit(true);
    setEditErrors({});

    try {
      const payload: UpdateAdminModulePayload = {
        description: editFormData.description.trim(),
        icon: editFormData.icon.trim(),
        sort_order: Number(editFormData.sort_order),
        is_active: editFormData.is_active,
      };

      await updateAdminModule(editingModule.id, payload);
      toast.success(`Module "${editingModule.name}" updated successfully.`);
      closeEditModal();
      triggerRefresh();
    } catch (err: unknown) {
      console.error('Failed to update module:', err);
      const msg = extractErrorMessage(err, 'Failed to save module modifications.');
      setEditErrors({ general: msg });
      toast.error(msg);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Active module summary stats
  const activeCount = useMemo(() => modules.filter((m) => m.is_active).length, [modules]);

  // DataTable columns definition
  const columns = useMemo<Column<AdminModule>[]>(
    () => [
      {
        header: 'Order',
        cell: (mod) => {
          const index = modules.findIndex((m) => m.id === mod.id);
          const isFirst = index === 0;
          const isLast = index === modules.length - 1;
          const isReordering = reorderingId === mod.id;

          return (
            <div className="flex items-center space-x-2">
              <span className="w-7 h-7 flex items-center justify-center font-mono text-xs font-bold rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300">
                {mod.sort_order}
              </span>
              <div className="flex flex-col space-y-0.5">
                <button
                  type="button"
                  onClick={() => handleReorder(mod, 'up')}
                  disabled={isFirst || isReordering}
                  aria-label={`Move ${mod.name} up in sort order`}
                  className="p-1 rounded text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleReorder(mod, 'down')}
                  disabled={isLast || isReordering}
                  aria-label={`Move ${mod.name} down in sort order`}
                  className="p-1 rounded text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        },
      },
      {
        header: 'Module Definition',
        cell: (mod) => {
          const visuals = getModuleVisuals(mod.slug, mod.icon);
          const Icon = visuals.icon;

          return (
            <div className="flex items-center space-x-3.5">
              <div
                className={cn(
                  'w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 shadow-xs',
                  visuals.iconBg
                )}
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 dark:text-white tracking-tight flex items-center space-x-2">
                  <span>{mod.name}</span>
                  <span className="font-mono text-[11px] font-normal text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-1.5 py-0.5 rounded">
                    {mod.slug}
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                  {mod.description || 'No description configured.'}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        header: 'Availability',
        cell: (mod) => (
          <div className="flex items-center space-x-3">
            {/* Accessible Toggle Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={mod.is_active}
              aria-label={`Toggle active state for ${mod.name}`}
              onClick={() => openConfirmToggle(mod)}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:ring-offset-2 dark:focus:ring-offset-slate-900',
                mod.is_active ? 'bg-teal-500 dark:bg-teal-600' : 'bg-slate-300 dark:bg-slate-700'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out',
                  mod.is_active ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </button>

            {/* Status Semantic Badge */}
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                mod.is_active
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              )}
            >
              {mod.is_active ? (
                <>
                  <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" />
                  Active
                </>
              ) : (
                <>
                  <XCircle className="w-3 h-3 mr-1 text-slate-400" />
                  Inactive
                </>
              )}
            </span>
          </div>
        ),
      },
      {
        header: 'Actions',
        align: 'right',
        cell: (mod) => (
          <div className="flex items-center justify-end space-x-1">
            <button
              type="button"
              onClick={() => openEditModal(mod)}
              className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title={`Edit configuration for ${mod.name}`}
              aria-label={`Edit ${mod.name}`}
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>
        ),
      },
    ],
    [modules, reorderingId, handleReorder, openConfirmToggle, openEditModal]
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full" role="region" aria-label="Module Configuration">
      {/* Header with Title and Summary Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Module Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure the 5 approved provincial student health modules, update service descriptions, manage display ordering, and control active status.
          </p>
        </div>

        <div className="flex items-center space-x-3 self-start sm:self-auto">
          {/* Active Modules Counter Badge */}
          <div className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400 text-xs font-semibold">
            <ShieldCheck className="w-4 h-4" />
            <span>
              {activeCount} of {modules.length} Modules Active
            </span>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={triggerRefresh}
            disabled={isLoading}
            className="p-2 rounded-xl bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs disabled:opacity-50"
            title="Refresh module configurations"
            aria-label="Refresh module data"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Recoverable Fetch Error Banner */}
      {fetchError && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
        >
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0" />
            <p className="text-sm font-medium">{fetchError}</p>
          </div>
          <button
            type="button"
            onClick={triggerRefresh}
            className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs sm:text-sm transition-colors self-start sm:self-auto flex items-center space-x-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      )}

      {/* Main Module Table Card */}
      <div className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm">
        <DataTable
          data={modules}
          columns={columns}
          isLoading={isLoading}
        />
      </div>

      {/* Edit Module Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={closeEditModal}
        title={`Edit Module: ${editingModule?.name || ''}`}
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          {editErrors.general && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{editErrors.general}</span>
            </div>
          )}

          {/* Module Name (Approved Core - Read Only Notice) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Module Name
            </label>
            <div className="w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-surface-input border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-sm flex items-center justify-between">
              <span>{editingModule?.name}</span>
              <span className="flex items-center text-xs text-slate-400 space-x-1">
                <Lock className="w-3 h-3" />
                <span>Protected Core</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              The 5 health modules correspond strictly to official PHO paper forms and cannot be renamed or deleted.
            </p>
          </div>

          {/* Module Slug (Read Only) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              System Slug
            </label>
            <div className="w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-surface-input border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-mono text-sm">
              {editingModule?.slug}
            </div>
          </div>

          {/* Description */}
          <FormField
            label="Service Description *"
            error={editErrors.description}
          >
            <textarea
              value={editFormData.description}
              onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
              rows={3}
              placeholder="Describe the clinical or screening purpose of this module..."
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-teal-500/30 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all text-sm resize-none"
            />
          </FormField>

          {/* Icon Selector */}
          <FormField label="Visual Icon" error={editErrors.icon}>
            <select
              value={editFormData.icon}
              onChange={(e) => setEditFormData({ ...editFormData, icon: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-teal-500/30 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all"
            >
              {AVAILABLE_ICONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </FormField>

          {/* Sort Order */}
          <FormField
            label="Display Sort Order (Numeric) *"
            error={editErrors.sort_order}
          >
            <input
              type="number"
              min={0}
              value={editFormData.sort_order}
              onChange={(e) =>
                setEditFormData({ ...editFormData, sort_order: parseInt(e.target.value, 10) || 0 })
              }
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-teal-500/30 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all"
            />
          </FormField>

          {/* Active Status Switch */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-white/10">
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-white">
                Module Active Status
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Inactive modules are hidden from teacher data entry.
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={editFormData.is_active}
              onClick={() => setEditFormData({ ...editFormData, is_active: !editFormData.is_active })}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500/50',
                editFormData.is_active ? 'bg-teal-500 dark:bg-teal-600' : 'bg-slate-300 dark:bg-slate-700'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out',
                  editFormData.is_active ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </button>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-white/10">
            <button
              type="button"
              onClick={closeEditModal}
              disabled={isSubmittingEdit}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingEdit}
              className="px-5 py-2 rounded-xl bg-primary-action hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-600 text-white text-sm font-semibold shadow-md shadow-teal-500/20 transition-all flex items-center space-x-2 disabled:opacity-70"
            >
              {isSubmittingEdit ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Modal for Active/Inactive Toggle */}
      <Modal
        isOpen={Boolean(confirmToggleModule)}
        onClose={closeConfirmToggle}
        title={confirmToggleModule?.is_active ? 'Deactivate Module?' : 'Activate Module?'}
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-200 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              {confirmToggleModule?.is_active ? (
                <>
                  Are you sure you want to deactivate{' '}
                  <span className="font-semibold">{confirmToggleModule?.name}</span>? When deactivated, teachers and school encoders across the province will not be able to enter new records or view forms for this module.
                </>
              ) : (
                <>
                  Are you sure you want to reactivate{' '}
                  <span className="font-semibold">{confirmToggleModule?.name}</span>? This will immediately restore data entry and reporting capabilities across all schools in Aklan.
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={closeConfirmToggle}
              disabled={isTogglingStatus}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExecuteStatusToggle}
              disabled={isTogglingStatus}
              className={cn(
                'px-5 py-2 rounded-xl text-white text-sm font-semibold shadow-md transition-all flex items-center space-x-2 disabled:opacity-70',
                confirmToggleModule?.is_active
                  ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                  : 'bg-primary-action hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-600 shadow-teal-500/20'
              )}
            >
              {isTogglingStatus ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : confirmToggleModule?.is_active ? (
                <span>Confirm Deactivation</span>
              ) : (
                <span>Confirm Activation</span>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ModuleManagement;
