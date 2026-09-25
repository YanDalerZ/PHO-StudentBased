import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Users,
    TrendingUp,
    Activity,
    Syringe,
    Stethoscope,
    Droplets,
    FileText,
    ChevronRight,
    AlertTriangle,
    RefreshCw,
    Loader2,
    BarChart3,
    PieChart,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { FilterBar } from '../../components/common/FilterBar';
import { getDashboardOverview } from '../../services/api';
import type { DashboardFilters, DashboardOverviewResponse, ModuleSlug } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { hasModulePermission } from '../../lib/access';

export const NurseDashboard: React.FC = () => {
    const { effectiveAccess } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const currentRoleSegment = location.pathname.split('/')[1] || 'superuser';

    // State
    const [filters, setFilters] = useState<DashboardFilters>({});
    const [data, setData] = useState<DashboardOverviewResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch overview data (for manual user interactions)
    const fetchOverview = useCallback(async (currentFilters: DashboardFilters) => {
        setLoading(true);
        setError(null);
        try {
            const result = await getDashboardOverview(currentFilters);
            setData(result);
        } catch (err) {
            console.error('Dashboard overview error:', err);
            setError('Failed to load dashboard data. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial load
    useEffect(() => {
        let isMounted = true;
        getDashboardOverview(filters)
            .then((result) => {
                if (isMounted) {
                    setData(result);
                    setLoading(false);
                }
            })
            .catch((err) => {
                if (isMounted) {
                    console.error('Dashboard overview error:', err);
                    setError('Failed to load dashboard data. Please try again.');
                    setLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Handle filter changes
    const handleFilterChange = useCallback((newFilters: DashboardFilters) => {
        setFilters(newFilters);
        void fetchOverview(newFilters);
    }, [fetchOverview]);

    // Retry handler
    const handleRetry = () => {
        void fetchOverview(filters);
    };

    // Quick access modules (only the 5 approved modules)
    const quickAccessCandidates: Array<{
        title: string;
        subtitle: string;
        desc: string;
        icon: typeof FileText;
        iconBg: string;
        btnBg: string;
        route: ModuleSlug;
    }> = [
        {
            title: 'Patient Info',
            subtitle: 'Client Registry',
            desc: 'Manage student profiles and medical history.',
            icon: FileText,
            iconBg: 'bg-emerald-50 text-emerald-600',
            btnBg: 'bg-emerald-500 hover:bg-emerald-600',
            route: 'patient-info',
        },
        {
            title: 'Oral Health',
            subtitle: 'RPOC Tracking',
            desc: 'Dental check-up and oral health records.',
            icon: Stethoscope,
            iconBg: 'bg-teal-50 text-teal-500',
            btnBg: 'bg-teal-500 hover:bg-teal-600',
            route: 'oral-health',
        },
        {
            title: 'Deworming',
            subtitle: '',
            desc: 'Track deworming doses and coverage.',
            icon: Droplets,
            iconBg: 'bg-sky-50 text-sky-500',
            btnBg: 'bg-sky-500 hover:bg-sky-600',
            route: 'deworming',
        },
        {
            title: 'Immunization',
            subtitle: '',
            desc: 'Manage immunization records.',
            icon: Syringe,
            iconBg: 'bg-purple-50 text-purple-500',
            btnBg: 'bg-purple-500 hover:bg-purple-600',
            route: 'immunization',
        },
        {
            title: 'Vital Signs',
            subtitle: '',
            desc: 'Record and monitor vital signs.',
            icon: Activity,
            iconBg: 'bg-rose-50 text-rose-500',
            btnBg: 'bg-rose-500 hover:bg-rose-600',
            route: 'vital-signs',
        },
    ];
    const quickAccessModules = quickAccessCandidates.filter((module) =>
        hasModulePermission(effectiveAccess, module.route, 'can_view')
    );

    // ─── Loading State ──────────────────────────────────────────────
    if (loading && !data) {
        return (
            <div className="min-h-screen bg-slate-50/60 p-2 space-y-4 text-slate-700 font-sans">
                <FilterBar onFilterChange={handleFilterChange} />
                <div className="flex items-center justify-center py-32">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
                        <p className="text-sm text-slate-500">Loading dashboard data...</p>
                    </div>
                </div>
            </div>
        );
    }

    // ─── Error State ────────────────────────────────────────────────
    if (error && !data) {
        return (
            <div className="min-h-screen bg-slate-50/60 p-2 space-y-4 text-slate-700 font-sans">
                <FilterBar onFilterChange={handleFilterChange} />
                <div className="flex items-center justify-center py-32">
                    <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                        <AlertTriangle className="w-8 h-8 text-rose-500" />
                        <p className="text-sm text-slate-700 font-medium">{error}</p>
                        <button
                            onClick={handleRetry}
                            className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-xl transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ─── Empty State ────────────────────────────────────────────────
    if (data && data.total_students === 0) {
        return (
            <div className="min-h-screen bg-slate-50/60 p-2 space-y-4 text-slate-700 font-sans">
                <FilterBar onFilterChange={handleFilterChange} />
                <div className="flex items-center justify-center py-32">
                    <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                        <Users className="w-10 h-10 text-slate-300" />
                        <h3 className="text-lg font-bold text-slate-700">No students found</h3>
                        <p className="text-sm text-slate-500">
                            {Object.keys(filters).length > 0
                                ? 'Try adjusting or clearing your filters.'
                                : 'No students have been registered yet.'}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Ensure data is available for render
    const overview = data!;

    // Compute module completion summary for the donut
    const totalModuleRecords = overview.module_completion.reduce((sum, m) => sum + m.count, 0);

    return (
        <div className="min-h-screen bg-slate-50/60 p-2 space-y-4 text-slate-700 font-sans">

            {/* Filter Bar */}
            <FilterBar onFilterChange={handleFilterChange} />

            {/* Welcome Banner Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h2>
                    <p className="text-sm text-slate-500">
                        Province-wide overview of student health data.
                        {loading && <span className="ml-2 text-teal-500">Updating...</span>}
                    </p>
                </div>
            </div>

            {/* Top Stat Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Students */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-start">
                    <div>
                        <p className="text-xs font-medium text-slate-500">Total Students</p>
                        <h3 className="text-2xl font-bold text-slate-800 mt-1">
                            {overview.total_students.toLocaleString()}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">Registered students</p>
                        {overview.recent_registrations.length > 0 && (
                            <div className="flex items-center gap-1 text-emerald-600 text-xs font-semibold mt-3">
                                <TrendingUp className="w-3.5 h-3.5" />
                                <span>Latest: {new Date(overview.recent_registrations[0]!.created_at).toLocaleDateString()}</span>
                            </div>
                        )}
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-500">
                        <Users className="w-6 h-6" />
                    </div>
                </div>

                {/* Male Students */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-start">
                    <div>
                        <p className="text-xs font-medium text-slate-500">Male Students</p>
                        <h3 className="text-2xl font-bold text-slate-800 mt-1">
                            {overview.gender_distribution.male.toLocaleString()}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                            {overview.total_students > 0
                                ? `${Math.round((overview.gender_distribution.male / overview.total_students) * 100)}% of total`
                                : '0%'}
                        </p>
                    </div>
                    <div className="p-3 bg-sky-50 rounded-2xl text-sky-500">
                        <BarChart3 className="w-6 h-6" />
                    </div>
                </div>

                {/* Female Students */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-start">
                    <div>
                        <p className="text-xs font-medium text-slate-500">Female Students</p>
                        <h3 className="text-2xl font-bold text-slate-800 mt-1">
                            {overview.gender_distribution.female.toLocaleString()}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                            {overview.total_students > 0
                                ? `${Math.round((overview.gender_distribution.female / overview.total_students) * 100)}% of total`
                                : '0%'}
                        </p>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-2xl text-purple-500">
                        <PieChart className="w-6 h-6" />
                    </div>
                </div>

                {/* Module Coverage */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-start">
                    <div>
                        <p className="text-xs font-medium text-slate-500">Total Module Records</p>
                        <h3 className="text-2xl font-bold text-slate-800 mt-1">
                            {totalModuleRecords.toLocaleString()}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">Across 5 modules</p>
                    </div>
                    <div className="p-3 bg-amber-50 rounded-2xl text-amber-500">
                        <Activity className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Middle Grid Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Recent Students Table (5 cols) */}
                <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-slate-800">Recent Registrations</h3>
                        <button
                            onClick={() => navigate(`/${currentRoleSegment}/students`)}
                            className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                            View all students
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        {overview.recent_registrations.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-8">No recent registrations</p>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400">
                                        <th className="pb-2">Name</th>
                                        <th className="pb-2">School</th>
                                        <th className="pb-2">Municipality</th>
                                        <th className="pb-2 text-right">Date</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 text-xs">
                                    {overview.recent_registrations.map((student) => (
                                        <tr
                                            key={student.id}
                                            className="hover:bg-slate-50/50 cursor-pointer"
                                            onClick={() => navigate(`/${currentRoleSegment}/students/${student.id}`)}
                                        >
                                            <td className="py-2.5 font-medium text-slate-700">
                                                {student.last_name}, {student.first_name}
                                            </td>
                                            <td className="py-2.5 text-slate-400 truncate max-w-[120px]">
                                                {student.school_name}
                                            </td>
                                            <td className="py-2.5 text-slate-400">
                                                {student.municipality_name}
                                            </td>
                                            <td className="py-2.5 text-right text-slate-400">
                                                {new Date(student.created_at).toLocaleDateString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Module Completion Overview (4 cols) */}
                <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-slate-800">Module Coverage</h3>
                    </div>

                    {/* Module completion donut (CSS ring) */}
                    <div className="flex items-center justify-center my-4">
                        <div className="relative w-44 h-44">
                            <div
                                className="w-full h-full rounded-full"
                                style={{
                                    background: overview.total_students > 0
                                        ? `conic-gradient(
                                            #4ade80 0% ${overview.module_completion[0]?.rate ?? 0}%,
                                            #38bdf8 ${overview.module_completion[0]?.rate ?? 0}% ${(overview.module_completion[0]?.rate ?? 0) + (overview.module_completion[1]?.rate ?? 0)}%,
                                            #a78bfa ${(overview.module_completion[0]?.rate ?? 0) + (overview.module_completion[1]?.rate ?? 0)}% ${(overview.module_completion[0]?.rate ?? 0) + (overview.module_completion[1]?.rate ?? 0) + (overview.module_completion[2]?.rate ?? 0)}%,
                                            #fbbf24 ${(overview.module_completion[0]?.rate ?? 0) + (overview.module_completion[1]?.rate ?? 0) + (overview.module_completion[2]?.rate ?? 0)}% ${(overview.module_completion[0]?.rate ?? 0) + (overview.module_completion[1]?.rate ?? 0) + (overview.module_completion[2]?.rate ?? 0) + (overview.module_completion[3]?.rate ?? 0)}%,
                                            #f87171 ${(overview.module_completion[0]?.rate ?? 0) + (overview.module_completion[1]?.rate ?? 0) + (overview.module_completion[2]?.rate ?? 0) + (overview.module_completion[3]?.rate ?? 0)}% 100%
                                          )`
                                        : 'conic-gradient(#e2e8f0 0% 100%)',
                                }}
                            />
                            <div className="absolute inset-6 bg-white rounded-full flex flex-col items-center justify-center shadow-inner">
                                <span className="text-xs text-slate-400">Total Students</span>
                                <span className="text-xl font-bold text-slate-800">
                                    {overview.total_students.toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Module legend */}
                    <div className="space-y-2 text-xs pt-2 border-t border-slate-100">
                        {overview.module_completion.map((mod, idx) => {
                            const colors = ['bg-emerald-400', 'bg-sky-400', 'bg-violet-400', 'bg-amber-400', 'bg-rose-400'];
                            return (
                                <div key={mod.module} className="flex items-center justify-between">
                                    <span className="flex items-center gap-1.5 text-slate-600">
                                        <span className={cn('w-2 h-2 rounded-full', colors[idx])} />
                                        {mod.module}
                                    </span>
                                    <span className="font-semibold text-slate-700">
                                        {mod.count.toLocaleString()} ({mod.rate}%)
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Students by Municipality (3 cols) */}
                <div className="lg:col-span-3 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col">
                    <h3 className="font-bold text-slate-800 mb-4">By Municipality</h3>
                    {overview.students_by_municipality.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-8">No data</p>
                    ) : (
                        <div className="space-y-2 overflow-y-auto max-h-60">
                            {overview.students_by_municipality.map((mun) => {
                                const pct = overview.total_students > 0
                                    ? Math.round((mun.count / overview.total_students) * 100)
                                    : 0;
                                return (
                                    <div key={mun.municipality_name} className="space-y-1">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-slate-600 truncate max-w-[120px]">
                                                {mun.municipality_name}
                                            </span>
                                            <span className="font-semibold text-slate-700">{mun.count}</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-teal-500 rounded-full transition-all duration-500"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Row Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Quick Access Modules (9 cols) */}
                <div className="lg:col-span-9 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4">Quick Access Modules</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        {quickAccessModules.map((item, idx) => {
                            const IconComponent = item.icon;
                            const moduleData = overview.module_completion[idx];
                            return (
                                <div key={item.route} className="border border-slate-100 rounded-xl p-3 flex flex-col justify-between items-center text-center bg-slate-50/30 hover:shadow-sm transition-all">
                                    <div className={cn('p-3 rounded-2xl mb-2', item.iconBg)}>
                                        <IconComponent className="w-6 h-6" />
                                    </div>
                                    <h4 className="text-xs font-bold text-slate-800 leading-tight">{item.title}</h4>
                                    {item.subtitle && <p className="text-[10px] font-semibold text-slate-400 leading-tight">{item.subtitle}</p>}
                                    {moduleData && (
                                        <p className="text-[10px] text-teal-600 font-semibold mt-1">
                                            {moduleData.count} records ({moduleData.rate}%)
                                        </p>
                                    )}
                                    <p className="text-[10px] text-slate-400 mt-1 mb-3 leading-tight min-h-[28px]">{item.desc}</p>
                                    <button
                                        type="button"
                                        onClick={() => navigate(`/${currentRoleSegment}/${item.route}`)}
                                        className={cn('w-full text-white text-[10px] font-medium py-1.5 px-2 rounded-lg transition-colors cursor-pointer', item.btnBg)}
                                    >
                                        Go to Module
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Alerts & Summary (3 cols) */}
                <div className="lg:col-span-3 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="font-bold text-slate-800 mb-4">Data Summary</h3>
                        <div className="space-y-3 text-xs">
                            {overview.module_completion
                                .filter((m) => m.rate < 50)
                                .map((m) => (
                                    <div
                                        key={m.module}
                                        className="p-3 bg-amber-50/50 rounded-xl border border-amber-100 flex items-start gap-2"
                                    >
                                        <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                        <p className="text-slate-600 text-[11px]">
                                            <span className="font-bold text-slate-800">{m.module}</span> coverage is at{' '}
                                            <span className="font-bold text-amber-600">{m.rate}%</span>
                                        </p>
                                    </div>
                                ))}

                            {overview.module_completion.every((m) => m.rate >= 50) && (
                                <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 flex items-start gap-2">
                                    <TrendingUp className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                    <p className="text-slate-600 text-[11px]">
                                        All modules have <span className="font-bold text-emerald-600">50%+</span> coverage.
                                    </p>
                                </div>
                            )}

                            <div className="p-3 bg-sky-50/50 rounded-xl border border-sky-100 flex items-start gap-2">
                                <Activity className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
                                <p className="text-slate-600 text-[11px]">
                                    <span className="font-bold text-slate-800">{overview.students_by_municipality.length}</span> municipalities with registered students.
                                </p>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => navigate(`/${currentRoleSegment}/students`)}
                        className="text-xs text-sky-500 font-semibold mt-4 hover:underline flex items-center justify-between w-full cursor-pointer"
                    >
                        <span>View all students</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-4 border-t border-slate-200">
                <p>© 2026 School-Based HEALTHCARE SERVICES. All rights reserved.</p>
                <p>Version 1.0.0</p>
            </div>
        </div>
    );
};

export default NurseDashboard;
