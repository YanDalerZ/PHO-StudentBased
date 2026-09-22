import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  GraduationCap,
  LayoutGrid,
  ShieldCheck,
  Building2,
  RefreshCw,
  AlertTriangle,
  UserPlus,
  ArrowRight,
  UserCheck,
  UserX,
  Stethoscope,
  Clock,
} from 'lucide-react';
import { StatCard } from '../../components/common/StatCard';
import { getAdminDashboard } from '../../services/api';
import type { AdminDashboardStats, AdminUserSummary } from '../../types';
import { cn } from '../../lib/utils';

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchDashboard = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await getAdminDashboard();
      setStats(data);
    } catch (err: unknown) {
      console.error('Failed to load admin dashboard statistics:', err);
      setError('Unable to load system administration statistics. Please check your network connection or try again.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    getAdminDashboard()
      .then((data) => {
        if (isMounted) {
          setStats(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (isMounted) {
          console.error('Failed to load admin dashboard statistics:', err);
          setError('Unable to load system administration statistics. Please check your network connection or try again.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return dateString;
    }
  };

  const getRoleBadge = (role: AdminUserSummary['role']) => {
    switch (role) {
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
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full" role="region" aria-label="Admin System Dashboard">
      {/* Header with Title and Quick Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            System Administration
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time provincial metrics, user accounts, and module configuration overview.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => fetchDashboard(true)}
            disabled={loading || isRefreshing}
            aria-label="Refresh dashboard metrics"
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 font-medium text-sm transition-all flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <RefreshCw className={cn('w-4 h-4', (loading || isRefreshing) && 'animate-spin text-teal-500')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <Link
            to="/admin/schools"
            className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 font-medium text-sm transition-all flex items-center space-x-2 shadow-sm"
          >
            <Building2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>Manage Schools</span>
          </Link>

          <Link
            to="/admin/users"
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-600 text-white font-semibold text-sm shadow-md shadow-teal-600/20 transition-all flex items-center space-x-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>Manage Users</span>
          </Link>
        </div>
      </div>

      {/* Recoverable Error Banner */}
      {error && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
        >
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
          <button
            onClick={() => fetchDashboard(false)}
            className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs sm:text-sm transition-colors self-start sm:self-auto flex items-center space-x-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      )}

      {/* Metric Cards Section */}
      <section aria-label="System Metrics">
        {loading && !stats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-busy="true">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 p-5 rounded-2xl shadow-sm h-32 animate-pulse flex flex-col justify-between"
              >
                <div className="flex justify-between items-center">
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24"></div>
                  <div className="h-10 w-10 bg-slate-200 dark:bg-slate-700 rounded-xl"></div>
                </div>
                <div className="h-7 bg-slate-200 dark:bg-slate-700 rounded w-16 mt-2"></div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-36"></div>
              </div>
            ))}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Users with Breakdown */}
            <StatCard
              title="Total System Users"
              value={stats.users_by_role.total}
              icon={Users}
              iconBgClass="bg-blue-100 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20"
              iconColorClass="text-blue-600 dark:text-blue-400"
              subtitle={
                <div className="flex flex-wrap items-center gap-1.5 mt-1 font-medium">
                  <span className="text-teal-600 dark:text-teal-400">
                    {stats.users_by_role.teacher} Teachers
                  </span>
                  <span>•</span>
                  <span className="text-indigo-600 dark:text-indigo-400">
                    {stats.users_by_role.superuser} Superusers
                  </span>
                  <span>•</span>
                  <span className="text-purple-600 dark:text-purple-400">
                    {stats.users_by_role.admin} Admins
                  </span>
                </div>
              }
            />

            {/* Total Students */}
            <StatCard
              title="Registered Students"
              value={stats.total_students.toLocaleString()}
              icon={GraduationCap}
              iconBgClass="bg-teal-100 dark:bg-teal-500/10 border-teal-200 dark:border-teal-500/20"
              iconColorClass="text-teal-600 dark:text-teal-400"
              subtitle="Province-wide student population"
            />

            {/* Active Modules */}
            <StatCard
              title="Active Health Modules"
              value={`${stats.active_modules} / 5`}
              icon={LayoutGrid}
              iconBgClass="bg-amber-100 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20"
              iconColorClass="text-amber-600 dark:text-amber-400"
              subtitle="Digitized clinical modules enabled"
            />

            {/* System Status / Health */}
            <StatCard
              title="System Security Status"
              value="Enforced"
              icon={ShieldCheck}
              iconBgClass="bg-emerald-100 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20"
              iconColorClass="text-emerald-600 dark:text-emerald-400"
              subtitle="JWT Auth & Admin RBAC Active"
            />
          </div>
        ) : null}
      </section>

      {/* Recent Account Creations Section */}
      <section
        aria-label="Recent Account Creations"
        className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm backdrop-blur-sm"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-500/10 border border-teal-100 dark:border-teal-500/20 text-teal-600 dark:text-teal-400">
              <Clock className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Recent Account Creations
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Latest ten staff accounts provisioned across the provincial system.
              </p>
            </div>
          </div>

          <Link
            to="/admin/users"
            className="text-xs sm:text-sm font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors inline-flex items-center space-x-1 self-start sm:self-auto"
          >
            <span>View All Users</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>

        {/* Table Content */}
        <div className="mt-4 overflow-x-auto">
          {loading && !stats ? (
            <div className="space-y-3 py-4" aria-busy="true">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800/40 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : stats && stats.recent_users.length > 0 ? (
            <table className="w-full text-sm text-left border-collapse" aria-label="Recent Accounts Table">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th scope="col" className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    User
                  </th>
                  <th scope="col" className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Role
                  </th>
                  <th scope="col" className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Contact
                  </th>
                  <th scope="col" className="py-3 px-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Created At
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {stats.recent_users.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {user.first_name} {user.last_name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {user.email}
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {getRoleBadge(user.role)}
                    </td>

                    <td className="py-3.5 px-4">
                      {user.is_active ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium inline-flex items-center space-x-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" aria-hidden="true" />
                          Active
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium inline-flex items-center space-x-1 bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                          <UserX className="w-3 h-3 mr-1" aria-hidden="true" />
                          Locked
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400">
                      {user.contact_no || <span className="text-slate-400 dark:text-slate-600">None</span>}
                    </td>

                    <td className="py-3.5 px-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {formatDate(user.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* Empty State */
            <div className="py-12 text-center flex flex-col items-center justify-center">
              <div className="p-3.5 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-400 mb-3">
                <Users className="w-6 h-6" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                No Recent Accounts Found
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                No user account creations recorded in the system yet.
              </p>
              <Link
                to="/admin/users"
                className="mt-4 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs sm:text-sm transition-colors shadow-sm inline-flex items-center space-x-1.5"
              >
                <UserPlus className="w-4 h-4" />
                <span>Create User</span>
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default AdminDashboard;
