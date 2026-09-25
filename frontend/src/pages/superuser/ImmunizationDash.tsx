import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Syringe,
    ShieldCheck,
    Layers,
    AlertTriangle,
    Search,
    ChevronRight,
    RefreshCw,
    Loader2,
    Info,
    CheckCircle2,
} from 'lucide-react';
import { FilterBar } from '../../components/common/FilterBar';
import { DataTable } from '../../components/common/DataTable';
import { BarChart } from '../../components/charts/BarChart';
import { DonutChart } from '../../components/charts/DonutChart';
import { LineChart } from '../../components/charts/LineChart';
import { getImmunizationDashboard, getStudents } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { hasModulePermission } from '../../lib/access';
import type {
    Student,
    DashboardFilters,
    ImmunizationDashboardResponse,
} from '../../types';

const PAGE_SIZE = 5;

export const ImmunizationDash: React.FC = () => {
    const navigate = useNavigate();
    const { effectiveAccess } = useAuth();
    const hasPatientInfoAccess = hasModulePermission(effectiveAccess, 'patient-info', 'can_view');

    // Dashboard State
    const [filters, setFilters] = useState<DashboardFilters>({});
    const [dashboardData, setDashboardData] = useState<ImmunizationDashboardResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Students Registry State (live from DB)
    const [students, setStudents] = useState<Student[]>([]);
    const [studentsLoading, setStudentsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // Fetch dashboard data
    const fetchDashboard = useCallback(async (currentFilters: DashboardFilters) => {
        setLoading(true);
        setError(null);
        try {
            const data = await getImmunizationDashboard(currentFilters);
            setDashboardData(data);
        } catch (err) {
            console.error('Failed to load Immunization dashboard:', err);
            setError('Failed to load Immunization analytics. Please check your connection and try again.');
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
            getImmunizationDashboard(filters),
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
                    console.error('Initial immunization load failed:', err);
                    setError('Failed to load Immunization dashboard data.');
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
    const consentChartData = useMemo(() => {
        if (!dashboardData) return [];
        const { consented_students, refused_students, deferred_students } = dashboardData.consent_distribution;
        return [
            { name: 'Consented', value: consented_students },
            { name: 'Refused', value: refused_students },
            { name: 'Deferred', value: deferred_students },
        ];
    }, [dashboardData]);

    const educationalLevelChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.vaccination_by_educational_level.map((item) => ({
            name: item.educational_level,
            Vaccinated: item.vaccinated_students,
        }));
    }, [dashboardData]);

    const refusalReasonsChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.refusal_reasons.map((item) => ({
            name: item.label.length > 28 ? `${item.label.slice(0, 28)}...` : item.label,
            Refusals: item.count,
        }));
    }, [dashboardData]);

    const schoolCoverageChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.coverage_by_school.map((item) => ({
            name: item.school_name,
            Vaccinated: item.count,
        }));
    }, [dashboardData]);

    const trendChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.monthly_trend.map((item) => ({
            name: item.month,
            Vaccinated: item.count,
        }));
    }, [dashboardData]);

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
                        onClick={() => navigate(`/superuser/students/${student.id}/immunization`)}
                        className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 font-semibold text-xs flex items-center group cursor-pointer whitespace-nowrap"
                    >
                        Immunization
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

            {/* Header Title Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm shrink-0">
                <div>
                    <h1 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                        Student Immunization &amp; Antigen Surveillance
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Province-wide antigen coverage, vaccine doses, school coverage, and refusal tracking.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/superuser/students')}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors shadow-sm cursor-pointer shrink-0"
                >
                    <Syringe className="w-4 h-4" />
                    <span>Record Immunization</span>
                </button>
            </div>

            {/* Surveillance Contract / Definition Notice Banner */}
            <div className="bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200/80 dark:border-teal-800/60 rounded-xl p-3.5 sm:p-4 text-xs text-teal-900 dark:text-teal-200 shadow-xs shrink-0 flex items-start gap-3">
                <Info className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold uppercase tracking-wider text-[11px] text-teal-800 dark:text-teal-300">
                            Immunization Surveillance Protocol
                        </span>
                        <span className="px-2 py-0.5 bg-teal-200/60 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300 font-semibold rounded-full text-[10px]">
                            DOH / DepEd Standard
                        </span>
                    </div>
                    <p className="text-teal-800/90 dark:text-teal-300/90 leading-relaxed">
                        Distinct student coverage counts individuals who received $\ge 1$ vaccine antigen. Doses are tracked independently across all six antigens (Td1, MR1, HPV1, HPV2, Td2, MR2) and are non-mutually exclusive. Refusals and deferrals follow official standardized surveillance reason codes.
                    </p>
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
                        Aggregating immunization coverage and antigen surveillance data...
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
                        {/* 1. Total Vaccinated Students */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Students Vaccinated
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.total_students_vaccinated.toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    Distinct student coverage (&ge;1 dose)
                                </p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-teal-50 dark:bg-teal-900/30 rounded-xl text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-800 shrink-0">
                                <Syringe className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>

                        {/* 2. Total Evaluated Students */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Total Evaluated
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.total_evaluated_students.toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    Students assessed in campaign
                                </p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 shrink-0">
                                <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>

                        {/* 3. Total Doses Administered */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Total Doses Given
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.total_doses_administered.toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    Across all 6 antigens
                                </p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-purple-50 dark:bg-purple-900/30 rounded-xl text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-800 shrink-0">
                                <Layers className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>

                        {/* 4. Refusal Rate */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Refusal Rate
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.consent_distribution.refusal_rate}%
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    {dashboardData.consent_distribution.refused_students} refused students
                                </p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-rose-50 dark:bg-rose-900/30 rounded-xl text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-800 shrink-0">
                                <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>
                    </div>

                    {/* 6 Vaccine Antigen Metrics Row */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm shrink-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
                            <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                                Vaccine Antigen Breakdown (Doses &amp; Student Coverage)
                            </h2>
                            <span className="text-[11px] text-slate-400">
                                Non-mutually exclusive doses across visit logs
                            </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                            {dashboardData.vaccine_antigens.map((antigen) => (
                                <div key={antigen.antigen} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700/50">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wider">
                                            {antigen.antigen.toUpperCase()}
                                        </span>
                                        <Syringe className="w-3.5 h-3.5 text-slate-400" />
                                    </div>
                                    <p className="text-base font-extrabold text-slate-900 dark:text-white">
                                        {antigen.doses.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">doses</span>
                                    </p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        {antigen.students.toLocaleString()} students
                                    </p>
                                    <p className="text-[9px] text-slate-400 truncate mt-1" title={antigen.label}>
                                        {antigen.label.split('(')[0].trim()}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Visualizations Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 shrink-0">
                        {/* 1. Consent vs Refusal vs Deferral (DonutChart) */}
                        <DonutChart
                            title="Consent & Refusal Distribution"
                            data={consentChartData}
                            colors={['#14b8a6', '#f43f5e', '#f59e0b']}
                        />

                        {/* 2. Educational Level Coverage (BarChart) */}
                        <BarChart
                            title="Vaccination by Educational Level"
                            data={educationalLevelChartData}
                            dataKey="Vaccinated"
                            xAxisKey="name"
                            colors={['#3b82f6']}
                        />

                        {/* 3. Refusal Reasons (BarChart) */}
                        {refusalReasonsChartData.length > 0 ? (
                            <BarChart
                                title="Reported Reasons for Refusal (Codes 1–18)"
                                data={refusalReasonsChartData}
                                dataKey="Refusals"
                                xAxisKey="name"
                                colors={['#f43f5e']}
                            />
                        ) : (
                            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center justify-center text-center">
                                <CheckCircle2 className="w-10 h-10 text-teal-500 mb-2" />
                                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                    Zero Vaccine Refusals
                                </h3>
                                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                                    There are no recorded vaccine refusals for the current geographical filter and date range.
                                </p>
                            </div>
                        )}

                        {/* 4. Top Schools by Coverage (BarChart) */}
                        <BarChart
                            title="Top Schools by Vaccinated Students"
                            data={schoolCoverageChartData}
                            dataKey="Vaccinated"
                            xAxisKey="name"
                            colors={['#14b8a6']}
                        />
                    </div>

                    {/* Monthly Trend (Full-width LineChart) */}
                    <div className="shrink-0">
                        <LineChart
                            title="Monthly Immunization Trend"
                            data={trendChartData}
                            dataKey="Vaccinated"
                            xAxisKey="name"
                            color="#14b8a6"
                        />
                    </div>

                    {/* Student Registry Quick Navigation Table */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 shrink-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                            <div>
                                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                                    Enrolled Students Registry
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Select a student to view historical immunization doses, record catch-up vaccinations, or manage records.
                                </p>
                            </div>
                            <div className="relative w-full sm:w-72">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Search by student name or LRN..."
                                    value={searchQuery}
                                    onChange={handleSearchChange}
                                    className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-colors"
                                />
                            </div>
                        </div>

                        {/* Data Table */}
                        <DataTable
                            data={paginatedStudents}
                            columns={columns}
                            pagination={{
                                currentPage,
                                totalPages,
                                onPageChange: handlePageChange,
                            }}
                            isLoading={studentsLoading}
                        />
                    </div>
                </>
            )}
        </div>
    );
};

export default ImmunizationDash;
