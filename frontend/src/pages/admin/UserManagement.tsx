import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UserPlus,
  Pencil,
  Search,
  Filter,
  Lock,
  Unlock,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  UserCheck,
  Stethoscope,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { DataTable, type Column } from '../../components/common/DataTable';
import { Modal } from '../../components/common/Modal';
import { FormField } from '../../components/common/FormField';
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  updateAdminUserStatus,
} from '../../services/api';
import type {
  AdminUserSummary,
  CreatableAdminUserRole,
  CreateAdminUserPayload,
  UpdateAdminUserPayload,
} from '../../types';
import { cn } from '../../lib/utils';

interface UserFormData {
  first_name: string;
  last_name: string;
  email: string;
  contact_no: string;
  role: CreatableAdminUserRole;
  password: string;
}

interface FormErrors {
  first_name?: string;
  last_name?: string;
  email?: string;
  contact_no?: string;
  password?: string;
  general?: string;
}

const initialFormData: UserFormData = {
  first_name: '',
  last_name: '',
  email: '',
  contact_no: '',
  role: 'teacher',
  password: '',
};

export const UserManagement: React.FC = () => {
  // Data state
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [totalUsers, setTotalUsers] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const limit = 10;
  const [totalPages, setTotalPages] = useState<number>(1);

  // Filters state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<'all' | 'teacher' | 'superuser' | 'admin'>('all');

  // Loading & error states
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Modal & mutation state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<AdminUserSummary | null>(null);
  const [formData, setFormData] = useState<UserFormData>(initialFormData);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Status mutation loading tracking (userId -> boolean)
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const refreshUsers = useCallback(() => {
    setIsLoading(true);
    setRefreshIndex((prev) => prev + 1);
  }, []);

  // Fetch users from API
  useEffect(() => {
    let isMounted = true;

    getAdminUsers({
      search: debouncedSearch || undefined,
      role: selectedRole === 'all' ? undefined : selectedRole,
      page,
      limit,
    })
      .then((res) => {
        if (isMounted) {
          setUsers(res.data);
          setTotalUsers(res.total);
          setTotalPages(Math.max(1, Math.ceil(res.total / limit)));
          setFetchError(null);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          console.error('Failed to fetch admin users:', err);
          setFetchError('Unable to load user accounts. Please check your network connection and try again.');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedSearch, selectedRole, page, limit, refreshIndex]);

  // Extract server error messages safely
  const extractErrorMessage = (err: unknown, fallback: string): string => {
    if (axios.isAxiosError(err)) {
      const errData = err.response?.data?.error;
      if (typeof errData === 'string') return errData;
      if (errData?.fieldErrors) {
        const firstField = Object.keys(errData.fieldErrors)[0];
        if (firstField && errData.fieldErrors[firstField]?.length) {
          return `${firstField}: ${errData.fieldErrors[firstField][0]}`;
        }
      }
      if (err.response?.data?.message) return err.response.data.message;
    }
    return fallback;
  };

  // Open Create Modal
  const openCreateModal = () => {
    setEditingUser(null);
    setFormData(initialFormData);
    setFormErrors({});
    setShowPassword(false);
    setIsModalOpen(true);
  };

  // Open Edit Modal (Password is deliberately left blank)
  const openEditModal = useCallback((user: AdminUserSummary) => {
    setEditingUser(user);
    // Role for creation/editing must be teacher or superuser
    const editableRole: CreatableAdminUserRole = user.role === 'superuser' ? 'superuser' : 'teacher';
    setFormData({
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      contact_no: user.contact_no || '',
      role: editableRole,
      password: '', // Blank unless admin enters replacement
    });
    setFormErrors({});
    setShowPassword(false);
    setIsModalOpen(true);
  }, []);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setFormErrors({});
  };

  // Validate form data
  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    if (!formData.first_name.trim()) {
      errors.first_name = 'First name is required.';
    }

    if (!formData.last_name.trim()) {
      errors.last_name = 'Last name is required.';
    }

    if (!formData.email.trim()) {
      errors.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = 'Please provide a valid email address.';
    }

    if (!editingUser) {
      // Creation: password required >= 8 chars
      if (!formData.password) {
        errors.password = 'Password is required for new accounts.';
      } else if (formData.password.length < 8) {
        errors.password = 'Password must be at least 8 characters long.';
      }
    } else {
      // Edit: password optional, but if entered must be >= 8 chars
      if (formData.password && formData.password.length < 8) {
        errors.password = 'Replacement password must be at least 8 characters long.';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Submit form (Create / Update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setFormErrors((prev) => ({ ...prev, general: undefined }));

    try {
      if (editingUser) {
        // Update user
        const payload: UpdateAdminUserPayload = {
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          email: formData.email.trim().toLowerCase(),
          contact_no: formData.contact_no.trim() || null,
        };

        // If target user is not admin, role can be updated
        if (editingUser.role !== 'admin') {
          payload.role = formData.role;
        }

        // Only include password if entered
        if (formData.password.trim().length > 0) {
          payload.password = formData.password.trim();
        }

        await updateAdminUser(editingUser.id, payload);
        toast.success(`User ${formData.first_name} ${formData.last_name} updated successfully.`);
      } else {
        // Create user
        const payload: CreateAdminUserPayload = {
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          email: formData.email.trim().toLowerCase(),
          contact_no: formData.contact_no.trim() || null,
          role: formData.role,
          password: formData.password,
        };

        await createAdminUser(payload);
        toast.success(`User ${formData.first_name} ${formData.last_name} created successfully.`);
      }

      closeModal();
      refreshUsers();
    } catch (err: unknown) {
      const message = extractErrorMessage(
        err,
        editingUser ? 'Failed to update user profile.' : 'Failed to create user account.'
      );
      setFormErrors((prev) => ({ ...prev, general: message }));
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Status toggle / Unlock handler
  const handleToggleStatus = useCallback(
    async (user: AdminUserSummary, action: 'activate' | 'deactivate' | 'unlock') => {
      if (user.role === 'admin') {
        toast.error('System administrator status cannot be modified.');
        return;
      }

      setUpdatingStatusId(user.id);
      try {
        await updateAdminUserStatus(user.id, { action });
        const actionLabel = action === 'unlock' ? 'unlocked' : action === 'activate' ? 'activated' : 'deactivated';
        toast.success(`Account for ${user.first_name} ${user.last_name} has been ${actionLabel}.`);
        refreshUsers();
      } catch (err: unknown) {
        const message = extractErrorMessage(err, `Failed to ${action} user account.`);
        toast.error(message);
      } finally {
        setUpdatingStatusId(null);
      }
    },
    [refreshUsers]
  );

  const formatDate = (dateString: string) => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(dateString));
    } catch {
      return dateString;
    }
  };

  // Table columns definition
  const columns = useMemo<Column<AdminUserSummary>[]>(
    () => [
      {
        header: 'User',
        cell: (user) => (
          <div>
            <div className="font-semibold text-slate-900 dark:text-white">
              {user.first_name} {user.last_name}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              {user.email}
            </div>
          </div>
        ),
      },
      {
        header: 'Role',
        cell: (user) => {
          switch (user.role) {
            case 'admin':
              return (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold inline-flex items-center space-x-1 bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                  <ShieldCheck className="w-3 h-3 mr-1" aria-hidden="true" />
                  Admin
                </span>
              );
            case 'superuser':
              return (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold inline-flex items-center space-x-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  <Stethoscope className="w-3 h-3 mr-1" aria-hidden="true" />
                  Superuser
                </span>
              );
            case 'teacher':
              return (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold inline-flex items-center space-x-1 bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                  <UserCheck className="w-3 h-3 mr-1" aria-hidden="true" />
                  Teacher
                </span>
              );
            default:
              return null;
          }
        },
      },
      {
        header: 'Status',
        cell: (user) => {
          const isLocked = !user.is_active || user.failed_login_attempts >= 3;
          if (isLocked) {
            return (
              <div className="flex flex-col items-start gap-1">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold inline-flex items-center bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  <Lock className="w-3 h-3 mr-1" aria-hidden="true" />
                  Locked / Inactive
                </span>
                {user.failed_login_attempts > 0 && (
                  <span className="text-[11px] text-rose-500 font-medium">
                    {user.failed_login_attempts} failed attempts
                  </span>
                )}
              </div>
            );
          }

          return (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold inline-flex items-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" aria-hidden="true" />
              Active
            </span>
          );
        },
      },
      {
        header: 'Contact',
        cell: (user) => (
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {user.contact_no || <span className="text-slate-400 dark:text-slate-600">—</span>}
          </span>
        ),
      },
      {
        header: 'Date Created',
        cell: (user) => (
          <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
            {formatDate(user.created_at)}
          </span>
        ),
      },
      {
        header: 'Actions',
        className: 'text-right',
        cell: (user) => {
          const isLocked = !user.is_active || user.failed_login_attempts >= 3;
          const isBusy = updatingStatusId === user.id;

          return (
            <div className="flex items-center justify-end space-x-1.5">
              {/* Unlock / Activate Action */}
              {isLocked ? (
                <button
                  onClick={() => handleToggleStatus(user, 'unlock')}
                  disabled={isBusy || user.role === 'admin'}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors inline-flex items-center space-x-1 disabled:opacity-50"
                  title="Unlock and restore login access"
                  aria-label={`Unlock account for ${user.first_name}`}
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Unlock</span>
                </button>
              ) : (
                <button
                  onClick={() => handleToggleStatus(user, 'deactivate')}
                  disabled={isBusy || user.role === 'admin'}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors inline-flex items-center space-x-1 disabled:opacity-50"
                  title="Deactivate account access"
                  aria-label={`Deactivate account for ${user.first_name}`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Deactivate</span>
                </button>
              )}

              {/* Edit Profile Action */}
              <button
                onClick={() => openEditModal(user)}
                disabled={user.role === 'admin'}
                className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
                title={user.role === 'admin' ? 'Cannot edit system administrator' : 'Edit user details'}
                aria-label={`Edit user ${user.first_name}`}
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          );
        },
      },
    ],
    [updatingStatusId, handleToggleStatus, openEditModal]
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full" role="region" aria-label="User Management">
      {/* Header with Title and Create Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            User Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Provision staff credentials, assign provincial roles, and manage account security status.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 bg-primary-action hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-600 text-white font-semibold text-sm rounded-xl shadow-lg shadow-teal-500/20 dark:shadow-teal-900/30 transition-all flex items-center space-x-2 self-start sm:self-auto"
          aria-label="Open create user modal"
        >
          <UserPlus className="w-4 h-4" />
          <span>Create User</span>
        </button>
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
            onClick={refreshUsers}
            className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs sm:text-sm transition-colors self-start sm:self-auto flex items-center space-x-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            aria-label="Search users by name or email"
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-teal-500/30 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all"
          />
        </div>

        {/* Role Filter Tabs */}
        <div className="flex items-center space-x-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <Filter className="w-4 h-4 text-slate-400 hidden sm:inline" />
          {(['all', 'teacher', 'superuser', 'admin'] as const).map((roleKey) => (
            <button
              key={roleKey}
              onClick={() => {
                setSelectedRole(roleKey);
                setPage(1);
              }}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all whitespace-nowrap',
                selectedRole === roleKey
                  ? 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
            >
              {roleKey === 'all' ? 'All Roles' : roleKey}
            </button>
          ))}
        </div>
      </div>

      {/* User Table with Pagination */}
      <div className="space-y-4">
        <DataTable
          data={users}
          columns={columns}
          isLoading={isLoading}
          pagination={{
            currentPage: page,
            totalPages,
            onPageChange: (newPage) => setPage(newPage),
          }}
        />

        {/* Count summary */}
        {!isLoading && totalUsers > 0 && (
          <div className="text-xs text-slate-500 dark:text-slate-400 px-2">
            Showing <span className="font-semibold text-slate-900 dark:text-white">{users.length}</span> of{' '}
            <span className="font-semibold text-slate-900 dark:text-white">{totalUsers}</span> total users
          </div>
        )}
      </div>

      {/* Create / Edit User Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingUser ? `Edit User: ${editingUser.first_name} ${editingUser.last_name}` : 'Create New User Account'}
        className="max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* General Server Error */}
          {formErrors.general && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center space-x-2"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{formErrors.general}</span>
            </div>
          )}

          {/* Name Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="First Name" error={formErrors.first_name}>
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                placeholder="e.g. Maria"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-teal-500/30 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all"
              />
            </FormField>

            <FormField label="Last Name" error={formErrors.last_name}>
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                placeholder="e.g. Santos"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-teal-500/30 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all"
              />
            </FormField>
          </div>

          {/* Email Address */}
          <FormField label="Email Address" error={formErrors.email}>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="e.g. maria.santos@pho.gov.ph"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-teal-500/30 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all"
            />
          </FormField>

          {/* Contact Number */}
          <FormField label="Contact Number (Optional)" error={formErrors.contact_no}>
            <input
              type="tel"
              value={formData.contact_no}
              onChange={(e) => setFormData({ ...formData, contact_no: e.target.value })}
              placeholder="e.g. 09181234567"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-teal-500/30 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all"
            />
          </FormField>

          {/* Role Selection (Restricted strictly to teacher or superuser) */}
          <FormField label="System Role">
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as CreatableAdminUserRole })}
              disabled={editingUser?.role === 'admin'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-teal-500/30 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all"
            >
              <option value="teacher">Teacher (School Data Encoder)</option>
              <option value="superuser">Superuser (PHO Public Health Officer)</option>
            </select>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Admin privileges cannot be provisioned through this portal.
            </p>
          </FormField>

          {/* Password Field */}
          <FormField
            label={editingUser ? 'Replacement Password (Optional)' : 'Account Password'}
            error={formErrors.password}
          >
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder={editingUser ? 'Leave blank to keep unchanged' : 'Minimum 8 characters'}
                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-teal-500/30 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {editingUser && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Existing passwords are never displayed. Entering a value here resets their login password.
              </p>
            )}
          </FormField>

          {/* Modal Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={closeModal}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-primary-action hover:bg-teal-500 dark:bg-teal-500 dark:hover:bg-teal-600 text-white text-sm font-semibold shadow-md shadow-teal-500/20 transition-all flex items-center space-x-1.5 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{editingUser ? 'Save Changes' : 'Create Account'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default UserManagement;