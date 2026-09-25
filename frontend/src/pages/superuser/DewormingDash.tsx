import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Pill,
    CheckCircle2,
    Target,
    Users,
    Building2,
    Search,
    ChevronRight,
    AlertTriangle,
    RefreshCw,
    Loader2,
    FileText,
    Printer,
    X,
} from 'lucide-react';
import { FilterBar } from '../../components/common/FilterBar';
import { DataTable } from '../../components/common/DataTable';
import { BarChart } from '../../components/charts/BarChart';
import { DonutChart } from '../../components/charts/DonutChart';
import { LineChart } from '../../components/charts/LineChart';
import { ProgressRing } from '../../components/charts/ProgressRing';
import { getDewormingDashboard, getDewormingReport, getStudents } from '../../services/api';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { hasModulePermission } from '../../lib/access';
import type {
    Student,
    DashboardFilters,
    DewormingDashboardResponse,
    DewormingReportResponse,
    DewormingMunicipalitySummary,
} from '../../types';

const PAGE_SIZE = 5;

// Helper to format default current period as YYYY-MM
const getCurrentPeriod = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
};

export const DewormingDash: React.FC = () => {
    const navigate = useNavigate();
    const { effectiveAccess } = useAuth();
    const hasPatientInfoAccess = hasModulePermission(effectiveAccess, 'patient-info', 'can_view');

    // Dashboard State
    const [filters, setFilters] = useState<DashboardFilters>({});
    const [dashboardData, setDashboardData] = useState<DewormingDashboardResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Students Registry State (live from DB)
    const [students, setStudents] = useState<Student[]>([]);
    const [studentsLoading, setStudentsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // Municipality search filter
    const [munSearch, setMunSearch] = useState('');

    // Consolidation Report Modal State
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportPeriod, setReportPeriod] = useState(getCurrentPeriod);
    const [reportData, setReportData] = useState<DewormingReportResponse | null>(null);
    const [reportLoading, setReportLoading] = useState(false);
    const [reportError, setReportError] = useState<string | null>(null);

    // Fetch dashboard data
    const fetchDashboard = useCallback(async (currentFilters: DashboardFilters) => {
        setLoading(true);
        setError(null);
        try {
            const data = await getDewormingDashboard(currentFilters);
            setDashboardData(data);
        } catch (err) {
            console.error('Failed to load Deworming dashboard:', err);
            setError('Failed to load Deworming analytics. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch students list for quick registry navigation
    const fetchStudentsList = useCallback(async (currentFilters: DashboardFilters) => {
        if (!hasPatientInfoAccess) {
            setStudents([]);
            setStudentsLoading(false);
            return;
        }
        setStudentsLoading(true);
        try {
            const params: { school_id?: number } = {};
            if (currentFilters.school_id) {
                params.school_id = currentFilters.school_id;
            }
            const res = await getStudents(params);
            setStudents(res.data || []);
        } catch (err) {
            console.error('Failed to load students list:', err);
            setStudents([]);
        } finally {
            setStudentsLoading(false);
        }
    }, [hasPatientInfoAccess]);

    // Initial load
    useEffect(() => {
        let isMounted = true;
        Promise.all([
            getDewormingDashboard(filters),
            hasPatientInfoAccess
                ? getStudents(filters.school_id ? { school_id: filters.school_id } : undefined)
                : Promise.resolve({ data: [] as Student[], total: 0 }),
        ])
            .then(([dashRes, studentsRes]) => {
                if (isMounted) {
                    setDashboardData(dashRes);
                    setStudents(studentsRes.data || []);
                    setLoading(false);
                    setStudentsLoading(false);
                }
            })
            .catch((err) => {
                if (isMounted) {
                    console.error('Initial deworming load failed:', err);
                    setError('Failed to load Deworming dashboard data.');
                    setLoading(false);
                    setStudentsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Handle filter changes
    const handleFilterChange = useCallback((newFilters: DashboardFilters) => {
        setFilters(newFilters);
        setCurrentPage(1);
        void fetchDashboard(newFilters);
        void fetchStudentsList(newFilters);
    }, [fetchDashboard, fetchStudentsList]);

    // Retry handler
    const handleRetry = () => {
        void fetchDashboard(filters);
        void fetchStudentsList(filters);
    };

    // Load consolidation report
    const fetchReport = useCallback(async (period: string) => {
        setReportLoading(true);
        setReportError(null);
        try {
            const data = await getDewormingReport(period);
            setReportData(data);
        } catch (err) {
            console.error('Failed to load deworming consolidation report:', err);
            setReportError('Failed to load consolidation report for selected period.');
        } finally {
            setReportLoading(false);
        }
    }, []);

    const openReportModal = () => {
        setIsReportModalOpen(true);
        void fetchReport(reportPeriod);
    };

    const handlePeriodChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newPeriod = e.target.value;
        setReportPeriod(newPeriod);
        if (/^\d{4}-\d{2}$/.test(newPeriod)) {
            void fetchReport(newPeriod);
        }
    };

    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
        setCurrentPage(1);
    }, []);

    const filteredStudents = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return students;
        return students.filter((student: Student) =>
            student.first_name.toLowerCase().includes(query) ||
            student.last_name.toLowerCase().includes(query) ||
            (student.student_lrn && student.student_lrn.includes(query))
        );
    }, [students, searchQuery]);

    const totalPages = useMemo(() => {
        return Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
    }, [filteredStudents.length]);

    const paginatedStudents = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return filteredStudents.slice(start, start + PAGE_SIZE);
    }, [filteredStudents, currentPage]);

    const handlePageChange = useCallback((page: number) => {
        setCurrentPage(page);
    }, []);

    // Formatted chart datasets
    const progressRingData = useMemo(() => {
        if (!dashboardData) return [];
        const accomplished = dashboardData.province_total.total_accomplished;
        const target = dashboardData.province_total.target;
        const remaining = Math.max(0, target - accomplished);
        return [
            { name: 'Accomplished', value: accomplished },
            { name: 'Remaining Target', value: remaining },
        ];
    }, [dashboardData]);

    const ageGroupChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.deworming_by_age_group.map((item) => ({
            name: `Age ${item.age_group}`,
            Students: item.count,
        }));
    }, [dashboardData]);

    const publicVsPrivateData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.public_vs_private.map((item) => ({
            name: item.school_type.charAt(0).toUpperCase() + item.school_type.slice(1),
            value: item.count,
        }));
    }, [dashboardData]);

    const monthlyTrendData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.monthly_trend.map((item) => ({
            name: item.month,
            Dewormed: item.count,
        }));
    }, [dashboardData]);

    // Filtered municipality table rows
    const filteredMunicipalities = useMemo(() => {
        if (!dashboardData) return [];
        const query = munSearch.toLowerCase().trim();
        if (!query) return dashboardData.municipality_summary;
        return dashboardData.municipality_summary.filter((m) =>
            m.municipality_name.toLowerCase().includes(query)
        );
    }, [dashboardData, munSearch]);

    // Student table columns
    const columns = useMemo(() => [
        {
            header: 'Name',
            cell: (student: Student) => (
                <div className="flex items-center min-w-[140px]">
                    <div className="h-7 w-7 rounded-full bg-teal-50 dark:bg-teal-900/30 border border-teal-100 dark:border-teal-800 text-teal-700 dark:text-teal-400 font-bold flex items-center justify-center text-xs mr-2.5 shrink-0">
                        {student.first_name[0]}{student.last_name[0]}
                    </div>
                    <div className="truncate">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {student.first_name} {student.last_name}
                        </p>
                        <p className="text-[10px] text-slate-400">{student.date_of_birth}</p>
                    </div>
                </div>
            ),
        },
        {
            header: 'LRN',
            accessorKey: 'student_lrn' as keyof Student,
            className: 'text-slate-600 dark:text-slate-300 font-mono text-xs',
        },
        {
            header: 'Sex',
            accessorKey: 'sex' as keyof Student,
            className: 'text-slate-600 dark:text-slate-300 text-xs',
        },
        {
            header: 'Grade & Section',
            cell: (student: Student) => (
                <span className="text-slate-600 dark:text-slate-300 font-medium text-xs whitespace-nowrap">
                    {student.grade_level || 'N/A'} - {student.section || 'N/A'}
                </span>
            ),
        },
        {
            header: 'Actions',
            cell: (student: Student) => (
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate(`/superuser/students/${student.id}/deworming`)}
                        className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 font-semibold text-xs flex items-center group cursor-pointer whitespace-nowrap"
                    >
                        Deworming
                        <ChevronRight className="w-3.5 h-3.5 ml-0.5 transform group-hover:translate-x-1 transition-transform" />
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate(`/superuser/students/${student.id}`)}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs cursor-pointer whitespace-nowrap"
                    >
                        Profile
                    </button>
                </div>
            ),
        },
    ], [navigate]);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-3 sm:p-6 space-y-4 sm:space-y-6 text-slate-700 dark:text-slate-200 font-sans max-w-full overflow-x-hidden flex flex-col">

            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm shrink-0">
                <div>
                    <h1 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                        Deworming Analytics &amp; Consolidation
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        National Mass Drug Administration, coverage rates vs target, and municipality consolidation report.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                    <button
                        type="button"
                        onClick={openReportModal}
                        className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs sm:text-sm font-semibold rounded-xl transition-colors cursor-pointer"
                    >
                        <FileText className="w-4 h-4" />
                        <span>Consolidation Report</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/superuser/students')}
                        className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors shadow-sm cursor-pointer"
                    >
                        <Pill className="w-4 h-4" />
                        <span>Record Deworming</span>
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="shrink-0">
                <FilterBar onFilterChange={handleFilterChange} className="w-full" />
            </div>

            {/* Loading Skeleton */}
            {loading && (
                <div className="flex flex-col items-center justify-center p-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                    <Loader2 className="w-8 h-8 text-teal-500 animate-spin mb-3" />
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                        Calculating deworming coverage, targets, and age distributions...
                    </p>
                </div>
            )}

            {/* Error Banner */}
            {error && !loading && (
                <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                        <span className="text-sm text-red-700 dark:text-red-300 font-medium">{error}</span>
                    </div>
                    <button
                        type="button"
                        onClick={handleRetry}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors cursor-pointer"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry
                    </button>
                </div>
            )}

            {/* Main Content when loaded */}
            {!loading && !error && dashboardData && (
                <>
                    {/* Stat Cards Grid (4 key metrics) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 shrink-0">
                        {/* 1. Total Dewormed */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Total Dewormed
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.total_dewormed.toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    Distinct students covered
                                </p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-teal-50 dark:bg-teal-900/30 rounded-xl text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-800 shrink-0">
                                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>

                        {/* 2. Accomplishment Rate */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Accomplishment Rate
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.province_total.accomplishment_rate}%
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    {dashboardData.province_total.total_accomplished} of {dashboardData.province_total.target} target
                                </p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800 shrink-0">
                                <Target className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>

                        {/* 3. Target Population */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Target Population
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.province_total.target.toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    Registered student base
                                </p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 shrink-0">
                                <Users className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>

                        {/* 4. In-School vs Out-of-School */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Setting Coverage
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.in_school_vs_out_of_school.in_school.toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    In-School ({dashboardData.in_school_vs_out_of_school.out_of_school} Out-of-School)
                                </p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 shrink-0">
                                <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>
                    </div>

                    {/* Visualizations Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 shrink-0">
                        {/* 1. Progress Ring: Accomplishment */}
                        <div className="lg:col-span-1">
                            <ProgressRing
                                title="Province Accomplishment %"
                                data={progressRingData}
                                completedColor="#10b981"
                                remainingColor="#e2e8f0"
                            />
                        </div>

                        {/* 2. Bar Chart: Deworming by Age Group */}
                        <div className="lg:col-span-2">
                            <BarChart
                                title="Dewormed Students by Age Group (1-4, 5-9, 10-14, 15-19)"
                                data={ageGroupChartData}
                                dataKey="Students"
                                xAxisKey="name"
                                colors={['#14b8a6']}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 shrink-0">
                        {/* 3. Donut Chart: Public vs Private */}
                        <DonutChart
                            title="Public vs Private School Breakdown"
                            data={publicVsPrivateData}
                            colors={['#14b8a6', '#6366f1', '#f59e0b']}
                        />

                        {/* 4. Line Chart: Monthly Trend */}
                        <LineChart
                            title="Monthly Deworming Administration Trend"
                            data={monthlyTrendData}
                            dataKey="Dewormed"
                            xAxisKey="name"
                            color="#0d9488"
                        />
                    </div>

                    {/* Municipality Accomplishment Table */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 shrink-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                            <div>
                                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                                    Municipality Target vs Accomplished
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Target population is based on registered students enrolled in each municipality.
                                </p>
                            </div>
                            <div className="relative w-full sm:w-64">
                                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={munSearch}
                                    onChange={(e) => setMunSearch(e.target.value)}
                                    placeholder="Filter municipality..."
                                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                />
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                                <thead className="text-[11px] uppercase bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                    <tr>
                                        <th className="py-2.5 px-3 font-semibold">Municipality</th>
                                        <th className="py-2.5 px-3 font-semibold text-right">Target</th>
                                        <th className="py-2.5 px-3 font-semibold text-right">Male</th>
                                        <th className="py-2.5 px-3 font-semibold text-right">Female</th>
                                        <th className="py-2.5 px-3 font-semibold text-right">Total Accomplished</th>
                                        <th className="py-2.5 px-3 font-semibold text-right min-w-[140px]">Coverage %</th>
                                        <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {filteredMunicipalities.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="py-6 text-center text-slate-400">
                                                No municipality data matching &quot;{munSearch}&quot;
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredMunicipalities.map((m: DewormingMunicipalitySummary) => {
                                            const rate = m.accomplishment_rate;
                                            const isHigh = rate >= 80;
                                            const isMed = rate >= 50 && rate < 80;

                                            return (
                                                <tr key={m.municipality_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                                                    <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-white">
                                                        {m.municipality_name}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                                                        {m.target.toLocaleString()}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                                                        {m.male_accomplished.toLocaleString()}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                                                        {m.female_accomplished.toLocaleString()}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right font-mono font-bold text-teal-700 dark:text-teal-400">
                                                        {m.total_accomplished.toLocaleString()}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <div className="w-16 bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                                                                <div
                                                                    className={cn(
                                                                        "h-1.5 rounded-full",
                                                                        isHigh ? "bg-emerald-500" : isMed ? "bg-amber-500" : "bg-teal-500"
                                                                    )}
                                                                    style={{ width: `${Math.min(100, rate)}%` }}
                                                                />
                                                            </div>
                                                            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 min-w-[38px]">
                                                                {rate}%
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-center">
                                                        <span className={cn(
                                                            "px-2 py-0.5 rounded-full text-[10px] font-semibold",
                                                            isHigh
                                                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                                                : isMed
                                                                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                                                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                                                        )}>
                                                            {isHigh ? 'High' : isMed ? 'Moderate' : 'Low'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                                {dashboardData.municipality_summary.length > 0 && (
                                    <tfoot className="bg-slate-100 dark:bg-slate-800/80 font-bold border-t-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white">
                                        <tr>
                                            <td className="py-3 px-3">PROVINCE TOTAL</td>
                                            <td className="py-3 px-3 text-right font-mono">
                                                {dashboardData.province_total.target.toLocaleString()}
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono">
                                                {dashboardData.municipality_summary.reduce((acc, curr) => acc + curr.male_accomplished, 0).toLocaleString()}
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono">
                                                {dashboardData.municipality_summary.reduce((acc, curr) => acc + curr.female_accomplished, 0).toLocaleString()}
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono text-teal-700 dark:text-teal-400">
                                                {dashboardData.province_total.total_accomplished.toLocaleString()}
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                                                {dashboardData.province_total.accomplishment_rate}%
                                            </td>
                                            <td className="py-3 px-3 text-center">
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300">
                                                    Province
                                                </span>
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                    {/* Students Registry Navigation Table */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 shrink-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                            <div>
                                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                                    Student Deworming Records
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Select a student to view or record semi-annual deworming administration.
                                </p>
                            </div>
                            <div className="relative w-full sm:w-72">
                                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={handleSearchChange}
                                    placeholder="Search by student name or LRN..."
                                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                />
                            </div>
                        </div>

                        <DataTable
                            columns={columns}
                            data={paginatedStudents}
                            isLoading={studentsLoading}
                            pagination={{
                                currentPage,
                                totalPages,
                                onPageChange: handlePageChange,
                            }}
                        />
                    </div>
                </>
            )}

            {/* Consolidation Report Modal */}
            {isReportModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">

                        {/* Modal Header Toolbar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                                        Deworming Municipality Consolidation Report
                                    </h2>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Official PHO provincial consolidation across all 17 municipalities
                                    </p>
                                </div>
                            </div>

                            {/* Controls: Month picker, Print, Close */}
                            <div className="flex items-center gap-2 self-end sm:self-auto">
                                <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg text-xs">
                                    <span className="text-slate-400 font-medium">Period:</span>
                                    <input
                                        type="month"
                                        value={reportPeriod}
                                        onChange={handlePeriodChange}
                                        className="bg-transparent text-slate-800 dark:text-slate-100 font-semibold focus:outline-none cursor-pointer text-xs"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => window.print()}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                                >
                                    <Printer className="w-3.5 h-3.5 text-slate-500" />
                                    <span>Print</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsReportModalOpen(false)}
                                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body / Report Printable Container */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 print:p-0">
                            {reportLoading && (
                                <div className="flex flex-col items-center justify-center p-12">
                                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                        Generating consolidation report for period {reportPeriod}...
                                    </p>
                                </div>
                            )}

                            {reportError && !reportLoading && (
                                <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl flex items-center justify-between text-xs text-red-700 dark:text-red-300">
                                    <span>{reportError}</span>
                                    <button
                                        type="button"
                                        onClick={() => void fetchReport(reportPeriod)}
                                        className="font-semibold underline cursor-pointer"
                                    >
                                        Try again
                                    </button>
                                </div>
                            )}

                            {!reportLoading && !reportError && reportData && (
                                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-6 bg-white dark:bg-slate-900 shadow-sm print:border-none print:shadow-none">
                                    {/* Formal PHO Header */}
                                    <div className="text-center pb-4 mb-4 border-b border-slate-200 dark:border-slate-800 space-y-0.5">
                                        <p className="text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-semibold">
                                            Republic of the Philippines • Province of Aklan
                                        </p>
                                        <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white uppercase tracking-tight">
                                            PROVINCIAL HEALTH OFFICE (PHO) — AKLAN
                                        </h3>
                                        <p className="text-xs sm:text-sm font-bold text-teal-700 dark:text-teal-400">
                                            DEWORMING MUNICIPALITY CONSOLIDATION REPORT
                                        </p>
                                        <p className="text-xs text-slate-500 font-medium">
                                            Reporting Period: <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{reportData.period}</span>
                                        </p>
                                    </div>

                                    {/* Consolidated Municipalities Table */}
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                            <thead className="text-[11px] uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                                                <tr>
                                                    <th className="py-2.5 px-3 font-bold w-12 text-center">#</th>
                                                    <th className="py-2.5 px-3 font-bold">Municipality</th>
                                                    <th className="py-2.5 px-3 font-bold text-right">Target Pop</th>
                                                    <th className="py-2.5 px-3 font-bold text-right">Male</th>
                                                    <th className="py-2.5 px-3 font-bold text-right">Female</th>
                                                    <th className="py-2.5 px-3 font-bold text-right">Total Accomplished</th>
                                                    <th className="py-2.5 px-3 font-bold text-right">Accomplishment %</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                {reportData.municipalities.map((row, idx) => (
                                                    <tr key={row.municipality_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                                        <td className="py-2 px-3 text-center text-slate-400 font-mono">
                                                            {idx + 1}
                                                        </td>
                                                        <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">
                                                            {row.municipality_name}
                                                        </td>
                                                        <td className="py-2 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                                                            {row.target.toLocaleString()}
                                                        </td>
                                                        <td className="py-2 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                                                            {row.male_accomplished.toLocaleString()}
                                                        </td>
                                                        <td className="py-2 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                                                            {row.female_accomplished.toLocaleString()}
                                                        </td>
                                                        <td className="py-2 px-3 text-right font-mono font-bold text-teal-700 dark:text-teal-400">
                                                            {row.total_accomplished.toLocaleString()}
                                                        </td>
                                                        <td className="py-2 px-3 text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
                                                            {row.accomplishment_rate}%
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="bg-slate-100 dark:bg-slate-800 font-bold border-t-2 border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white">
                                                <tr>
                                                    <td colSpan={2} className="py-3 px-3 uppercase tracking-wider text-xs">
                                                        PROVINCE TOTALS
                                                    </td>
                                                    <td className="py-3 px-3 text-right font-mono">
                                                        {reportData.province_totals.target.toLocaleString()}
                                                    </td>
                                                    <td className="py-3 px-3 text-right font-mono">
                                                        {reportData.province_totals.male_accomplished.toLocaleString()}
                                                    </td>
                                                    <td className="py-3 px-3 text-right font-mono">
                                                        {reportData.province_totals.female_accomplished.toLocaleString()}
                                                    </td>
                                                    <td className="py-3 px-3 text-right font-mono text-teal-700 dark:text-teal-400">
                                                        {reportData.province_totals.total_accomplished.toLocaleString()}
                                                    </td>
                                                    <td className="py-3 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                                                        {reportData.province_totals.accomplishment_rate}%
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>

                                    {/* Sign-off certification block */}
                                    <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-8 text-xs text-slate-500 dark:text-slate-400">
                                        <div>
                                            <p className="font-semibold text-slate-700 dark:text-slate-300 mb-6">Prepared by:</p>
                                            <div className="border-b border-slate-300 dark:border-slate-600 w-48 mb-1" />
                                            <p className="font-bold text-slate-800 dark:text-slate-200">PHO Deworming Program Coordinator</p>
                                            <p className="text-[10px]">Provincial Health Office - Aklan</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-semibold text-slate-700 dark:text-slate-300 mb-6">Approved by:</p>
                                            <div className="border-b border-slate-300 dark:border-slate-600 w-48 mb-1 ml-auto" />
                                            <p className="font-bold text-slate-800 dark:text-slate-200">Provincial Health Officer II</p>
                                            <p className="text-[10px]">Provincial Health Office - Aklan</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            )}

        </div>
    );
};

export default DewormingDash;
