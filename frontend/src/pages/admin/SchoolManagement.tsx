import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import {
  Building2,
  Plus,
  Search,
  Pencil,
  AlertTriangle,
  RefreshCw,
  X,
  School as SchoolIcon,
  CheckCircle2,
  XCircle,
  Power,
  MapPin,
} from 'lucide-react';
import { DataTable, type Column } from '../../components/common/DataTable';
import { Modal } from '../../components/common/Modal';
import { FormField } from '../../components/common/FormField';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import {
  getAdminSchools,
  createAdminSchool,
  updateAdminSchool,
  getMunicipalities,
  getBarangays,
} from '../../services/api';
import type {
  AdminSchool,
  Municipality,
  Barangay,
  CreateAdminSchoolPayload,
  UpdateAdminSchoolPayload,
} from '../../types';
import { toast } from 'react-hot-toast';
import { cn } from '../../lib/utils';

interface SchoolFormData {
  name: string;
  address: string;
  municipality_id: string;
  barangay_id: string;
  district: string;
  is_active: boolean;
}

interface FormErrors {
  name?: string;
  municipality_id?: string;
  barangay_id?: string;
  district?: string;
  address?: string;
  general?: string;
}

const initialFormData: SchoolFormData = {
  name: '',
  address: '',
  municipality_id: '',
  barangay_id: '',
  district: '',
  is_active: true,
};

export const SchoolManagement: React.FC = () => {
  // Data state
  const [schools, setSchools] = useState<AdminSchool[]>([]);
  const [totalSchools, setTotalSchools] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const limit = 10;
  const [totalPages, setTotalPages] = useState<number>(1);

  // Filters state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Loading & error states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Lookups state for modal
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [modalBarangays, setModalBarangays] = useState<Barangay[]>([]);
  const [isLoadingMunicipalities, setIsLoadingMunicipalities] = useState<boolean>(false);
  const [isLoadingBarangays, setIsLoadingBarangays] = useState<boolean>(false);

  // Modal & mutation state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingSchool, setEditingSchool] = useState<AdminSchool | null>(null);
  const [formData, setFormData] = useState<SchoolFormData>(initialFormData);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Status toggle confirmation modal
  const [isToggleConfirmOpen, setIsToggleConfirmOpen] = useState<boolean>(false);
  const [schoolToToggle, setSchoolToToggle] = useState<AdminSchool | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Refresh trigger
  const [refreshIndex, setRefreshIndex] = useState<number>(0);

  const refreshSchools = useCallback(() => {
    setIsLoading(true);
    setRefreshIndex((prev) => prev + 1);
  }, []);

  // Debounce search input (350ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch schools from API
  useEffect(() => {
    let isMounted = true;

    getAdminSchools({
      search: debouncedSearch.trim() || undefined,
      page,
      limit,
    })
      .then((response) => {
        if (isMounted) {
          setSchools(response.data);
          setTotalSchools(response.total);
          setTotalPages(Math.max(1, Math.ceil(response.total / limit)));
          setFetchError(null);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          const msg = err instanceof Error ? err.message : 'Failed to load schools from server.';
          setFetchError(msg);
          toast.error('Failed to load schools.');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedSearch, page, limit, refreshIndex]);

  // Load municipalities lookup when opening modal
  const loadMunicipalities = useCallback(async () => {
    if (municipalities.length > 0) return;
    setIsLoadingMunicipalities(true);
    try {
      const data = await getMunicipalities();
      setMunicipalities(data);
    } catch {
      toast.error('Failed to load municipalities lookup.');
    } finally {
      setIsLoadingMunicipalities(false);
    }
  }, [municipalities.length]);

  // Load barangays whenever the selected municipality changes in the modal
  const handleMunicipalityChange = async (munId: string) => {
    setFormData((prev) => ({
      ...prev,
      municipality_id: munId,
      barangay_id: '', // Reset barangay selection when municipality changes
    }));

    // Clear related field errors
    setFormErrors((prev) => ({
      ...prev,
      municipality_id: undefined,
      barangay_id: undefined,
    }));

    if (!munId) {
      setModalBarangays([]);
      return;
    }

    setIsLoadingBarangays(true);
    try {
      const bgys = await getBarangays(munId);
      setModalBarangays(bgys);
    } catch {
      toast.error('Failed to load barangays for selected municipality.');
      setModalBarangays([]);
    } finally {
      setIsLoadingBarangays(false);
    }
  };

  // Open Create Modal
  const handleOpenCreateModal = useCallback(async () => {
    setEditingSchool(null);
    setFormData(initialFormData);
    setFormErrors({});
    setModalBarangays([]);
    setIsModalOpen(true);
    await loadMunicipalities();
  }, [loadMunicipalities]);

  // Open Edit Modal
  const handleOpenEditModal = useCallback(async (school: AdminSchool) => {
    setEditingSchool(school);
    setFormErrors({});
    setIsModalOpen(true);
    await loadMunicipalities();

    const munIdStr = school.municipality_id ? String(school.municipality_id) : '';
    const bgyIdStr = school.barangay_id ? String(school.barangay_id) : '';

    setFormData({
      name: school.name,
      address: school.address || '',
      municipality_id: munIdStr,
      barangay_id: bgyIdStr,
      district: school.district || '',
      is_active: school.is_active,
    });

    if (munIdStr) {
      setIsLoadingBarangays(true);
      try {
        const bgys = await getBarangays(munIdStr);
        setModalBarangays(bgys);
      } catch {
        toast.error('Failed to load barangays for editing school.');
        setModalBarangays([]);
      } finally {
        setIsLoadingBarangays(false);
      }
    } else {
      setModalBarangays([]);
    }
  }, [loadMunicipalities]);

  // Validate form client-side
  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    if (!formData.name.trim()) {
      errors.name = 'School name is required.';
    }

    if (!formData.municipality_id) {
      errors.municipality_id = 'Municipality selection is required.';
    }

    if (!formData.barangay_id) {
      errors.barangay_id = 'Barangay selection is required.';
    } else if (modalBarangays.length > 0) {
      // Validate that the selected barangay actually belongs to the selected municipality
      const belongs = modalBarangays.some((b) => String(b.id) === String(formData.barangay_id));
      if (!belongs) {
        errors.barangay_id = 'Selected barangay does not belong to the selected municipality.';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit Create or Edit Form
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setFormErrors({});

    try {
      const bgyId = Number(formData.barangay_id);
      const munId = Number(formData.municipality_id);

      if (editingSchool) {
        // Edit mode
        const payload: UpdateAdminSchoolPayload = {
          name: formData.name.trim(),
          address: formData.address.trim() || null,
          barangay_id: bgyId,
          municipality_id: munId,
          district: formData.district.trim() || null,
          is_active: formData.is_active,
        };

        await updateAdminSchool(editingSchool.id, payload);
        toast.success(`School "${formData.name.trim()}" updated successfully.`);
      } else {
        // Create mode
        const payload: CreateAdminSchoolPayload = {
          name: formData.name.trim(),
          address: formData.address.trim() || null,
          barangay_id: bgyId,
          municipality_id: munId,
          district: formData.district.trim() || null,
          is_active: formData.is_active,
        };

        await createAdminSchool(payload);
        toast.success(`School "${formData.name.trim()}" created successfully.`);
      }

      setIsModalOpen(false);
      refreshSchools();
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const resData = err.response?.data as {
          error?: string | { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
          message?: string;
        };

        if (resData?.error && typeof resData.error === 'object' && 'fieldErrors' in resData.error) {
          const fieldErrors = resData.error.fieldErrors || {};
          setFormErrors({
            name: fieldErrors.name?.[0],
            barangay_id: fieldErrors.barangay_id?.[0],
            municipality_id: fieldErrors.municipality_id?.[0],
            district: fieldErrors.district?.[0],
            address: fieldErrors.address?.[0],
            general: resData.error.formErrors?.[0],
          });
        } else {
          const generalMsg =
            (typeof resData?.error === 'string' ? resData.error : null) ||
            resData?.message ||
            (err.response?.status === 409
              ? 'Conflict: A school with this name already exists in this barangay.'
              : 'Failed to save school.');
          setFormErrors({ general: generalMsg });
          toast.error(generalMsg);
        }
      } else {
        const generalMsg = err instanceof Error ? err.message : 'Unexpected error saving school.';
        setFormErrors({ general: generalMsg });
        toast.error(generalMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open active status toggle confirmation
  const handleInitiateToggleStatus = useCallback((school: AdminSchool) => {
    setSchoolToToggle(school);
    setIsToggleConfirmOpen(true);
  }, []);

  // Confirm active status toggle
  const handleConfirmToggleStatus = async () => {
    if (!schoolToToggle) return;

    setIsUpdatingStatus(true);
    const newStatus = !schoolToToggle.is_active;

    try {
      await updateAdminSchool(schoolToToggle.id, {
        is_active: newStatus,
      });

      toast.success(
        `School "${schoolToToggle.name}" has been ${newStatus ? 'activated' : 'deactivated'}.`
      );
      setIsToggleConfirmOpen(false);
      setSchoolToToggle(null);
      refreshSchools();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update school status.';
      toast.error(msg);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Quick stats calculations
  const activeCount = useMemo(() => schools.filter((s) => s.is_active).length, [schools]);
  const distinctMunicipalitiesCount = useMemo(() => {
    const munSet = new Set<string>();
    schools.forEach((s) => {
      if (s.municipality_name) munSet.add(s.municipality_name);
    });
    return munSet.size;
  }, [schools]);

  // DataTable columns definition
  const columns: Column<AdminSchool>[] = useMemo(
    () => [
      {
        header: 'School Details',
        className: 'min-w-[240px]',
        cell: (school) => (
          <div className="flex items-start space-x-3 py-1">
            <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 mt-0.5 shrink-0">
              <SchoolIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-slate-900 dark:text-white leading-tight">
                {school.name}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center space-x-1">
                <span>ID: #{school.id}</span>
                {school.district && (
                  <>
                    <span>•</span>
                    <span className="text-teal-400 font-medium">{school.district}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        ),
      },
      {
        header: 'Municipality',
        className: 'min-w-[150px]',
        cell: (school) => (
          <div className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
            <MapPin className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span>{school.municipality_name || '—'}</span>
          </div>
        ),
      },
      {
        header: 'Barangay',
        className: 'min-w-[150px]',
        cell: (school) => (
          <div className="text-sm text-slate-700 dark:text-slate-300">
            {school.barangay_name || '—'}
          </div>
        ),
      },
      {
        header: 'Address',
        className: 'min-w-[180px]',
        cell: (school) => (
          <div className="text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate" title={school.address || undefined}>
            {school.address || '—'}
          </div>
        ),
      },
      {
        header: 'Status',
        className: 'w-32',
        cell: (school) => (
          <span
            className={cn(
              'inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
              school.is_active
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            )}
          >
            {school.is_active ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Active</span>
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5" />
                <span>Inactive</span>
              </>
            )}
          </span>
        ),
      },
      {
        header: 'Actions',
        className: 'w-44 text-right',
        cell: (school) => (
          <div className="flex items-center justify-end space-x-2">
            <button
              onClick={() => handleOpenEditModal(school)}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
              title="Edit school details"
            >
              <Pencil className="w-3.5 h-3.5 text-teal-400" />
              <span>Edit</span>
            </button>

            <button
              onClick={() => handleInitiateToggleStatus(school)}
              className={cn(
                'inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                school.is_active
                  ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/20'
                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
              )}
              title={school.is_active ? 'Deactivate school' : 'Activate school'}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{school.is_active ? 'Deactivate' : 'Activate'}</span>
            </button>
          </div>
        ),
      },
    ],
    [handleOpenEditModal, handleInitiateToggleStatus]
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                School Management
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Manage registered educational institutions and geographical assignments across Aklan.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="px-4 py-2.5 bg-linear-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 text-white font-medium text-sm rounded-xl shadow-md hover:shadow-lg transition-all self-start md:self-auto flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>Register School</span>
        </button>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Total Schools
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            {totalSchools}
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Registered in province
          </div>
        </div>

        <div className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            Active Schools
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {activeCount}
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Available for student enrollment
          </div>
        </div>

        <div className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-sm">
          <div className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">
            Municipalities Active
          </div>
          <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 mt-1">
            {distinctMunicipalitiesCount}
          </div>
          <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Covered by current school list
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search school, district, or municipality..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-9 py-2 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 self-end sm:self-auto">
          Showing <span className="font-semibold text-slate-700 dark:text-slate-300">{schools.length}</span> of{' '}
          <span className="font-semibold text-slate-700 dark:text-slate-300">{totalSchools}</span> schools
        </div>
      </div>

      {/* Error Alert Banner */}
      {fetchError && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-semibold text-rose-300">Failed to load schools</h4>
            <p className="text-xs text-rose-400/80 mt-0.5">{fetchError}</p>
          </div>
          <button
            onClick={refreshSchools}
            className="inline-flex items-center space-x-1 text-xs font-semibold text-rose-300 hover:text-rose-200 underline"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Main DataTable */}
      <DataTable<AdminSchool>
        data={schools}
        columns={columns}
        isLoading={isLoading}
        pagination={{
          currentPage: page,
          totalPages,
          onPageChange: (newPage) => setPage(newPage),
        }}
      />

      {/* Create / Edit School Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => !isSubmitting && setIsModalOpen(false)}
        title={editingSchool ? 'Edit School Details' : 'Register New School'}
      >
        <form onSubmit={handleSubmitForm} className="space-y-4">
          {formErrors.general && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{formErrors.general}</span>
            </div>
          )}

          {/* School Name */}
          <FormField label="School Name *" error={formErrors.name}>
            <input
              type="text"
              required
              placeholder="e.g., Kalibo Integrated Special Education Center"
              value={formData.name}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, name: e.target.value }));
                if (formErrors.name) setFormErrors((prev) => ({ ...prev, name: undefined }));
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </FormField>

          {/* Cascading Municipality Dropdown */}
          <FormField label="Municipality *" error={formErrors.municipality_id}>
            <select
              required
              disabled={isLoadingMunicipalities || isSubmitting}
              value={formData.municipality_id}
              onChange={(e) => handleMunicipalityChange(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-60"
            >
              <option value="">
                {isLoadingMunicipalities ? 'Loading municipalities...' : '-- Select Municipality --'}
              </option>
              {municipalities.map((mun) => (
                <option key={mun.id} value={String(mun.id)}>
                  {mun.name}
                </option>
              ))}
            </select>
          </FormField>

          {/* Cascading Barangay Dropdown */}
          <FormField label="Barangay *" error={formErrors.barangay_id}>
            <select
              required
              disabled={!formData.municipality_id || isLoadingBarangays || isSubmitting}
              value={formData.barangay_id}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, barangay_id: e.target.value }));
                if (formErrors.barangay_id) setFormErrors((prev) => ({ ...prev, barangay_id: undefined }));
              }}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-60"
            >
              <option value="">
                {!formData.municipality_id
                  ? '-- Select Municipality First --'
                  : isLoadingBarangays
                  ? 'Loading barangays...'
                  : modalBarangays.length === 0
                  ? 'No barangays found'
                  : '-- Select Barangay --'}
              </option>
              {modalBarangays.map((bgy) => (
                <option key={bgy.id} value={String(bgy.id)}>
                  {bgy.name}
                </option>
              ))}
            </select>
          </FormField>

          {/* District (Optional) */}
          <FormField label="District (Optional)" error={formErrors.district}>
            <input
              type="text"
              placeholder="e.g., District I, District II"
              value={formData.district}
              onChange={(e) => setFormData((prev) => ({ ...prev, district: e.target.value }))}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </FormField>

          {/* Address (Optional) */}
          <FormField label="Street Address (Optional)" error={formErrors.address}>
            <input
              type="text"
              placeholder="e.g., Poblacion St., Purok 4"
              value={formData.address}
              onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </FormField>

          {/* Active Status Toggle */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  Active Enrollment Status
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Allow teachers to register and enroll students under this school.
                </p>
              </div>
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-500 relative shrink-0 ml-4"></div>
            </label>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-linear-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 text-white text-sm font-semibold rounded-xl shadow-md transition-all flex items-center space-x-2 disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <LoadingSpinner size={16} className="p-0" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{editingSchool ? 'Save Changes' : 'Register School'}</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Modal for Active/Inactive Status Toggle */}
      <Modal
        isOpen={isToggleConfirmOpen}
        onClose={() => !isUpdatingStatus && setIsToggleConfirmOpen(false)}
        title={schoolToToggle?.is_active ? 'Deactivate School' : 'Activate School'}
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <div
              className={cn(
                'p-3 rounded-2xl shrink-0 mt-0.5',
                schoolToToggle?.is_active
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              )}
            >
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-slate-900 dark:text-white">
                {schoolToToggle?.is_active
                  ? `Deactivate "${schoolToToggle.name}"?`
                  : `Activate "${schoolToToggle?.name}"?`}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                {schoolToToggle?.is_active
                  ? 'Deactivating this school will remove it from the teacher registration lookup cascade. Teachers will not be able to select this school for new student enrollments. Existing enrolled student records will remain preserved.'
                  : 'Activating this school will restore it to the teacher registration lookup cascade. Teachers will be able to select it for new student enrollments.'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              disabled={isUpdatingStatus}
              onClick={() => setIsToggleConfirmOpen(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isUpdatingStatus}
              onClick={handleConfirmToggleStatus}
              className={cn(
                'px-5 py-2.5 text-white text-sm font-semibold rounded-xl shadow-md transition-all flex items-center space-x-2 disabled:opacity-60',
                schoolToToggle?.is_active
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              )}
            >
              {isUpdatingStatus ? (
                <>
                  <LoadingSpinner size={16} className="p-0" />
                  <span>Updating...</span>
                </>
              ) : (
                <span>{schoolToToggle?.is_active ? 'Deactivate School' : 'Activate School'}</span>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default SchoolManagement;
