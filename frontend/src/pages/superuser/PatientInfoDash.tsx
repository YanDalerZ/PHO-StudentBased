import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Users,
    FileText,
    Activity,
    Search,
    ChevronRight,
    UserPlus,
    X,
    AlertTriangle,
    HeartHandshake,
    RefreshCw,
    Loader2,
} from 'lucide-react';
import { FilterBar } from '../../components/common/FilterBar';
import { DataTable } from '../../components/common/DataTable';
import { BarChart } from '../../components/charts/BarChart';
import { DonutChart } from '../../components/charts/DonutChart';
import { LineChart } from '../../components/charts/LineChart';
import { getPatientInfoDashboard, getStudents } from '../../services/api';
import type {
    Student,
    DashboardFilters,
    PatientInfoDashboardResponse,
} from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { hasModulePermission } from '../../lib/access';

// Lazy load RegistrationForm for optimized bundle splitting
const RegistrationForm = lazy(() => import('../RegistrationForm'));

const PAGE_SIZE = 5;

export const PatientInfoDash: React.FC = () => {
    const navigate = useNavigate();
    const { effectiveAccess } = useAuth();
    const canCreateStudent = hasModulePermission(effectiveAccess, 'patient-info', 'can_create');

    // Dashboard State
    const [filters, setFilters] = useState<DashboardFilters>({});
    const [dashboardData, setDashboardData] = useState<PatientInfoDashboardResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Students Registry State (live from DB)
    const [students, setStudents] = useState<Student[]>([]);
    const [studentsLoading, setStudentsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

    // Fetch dashboard data
    const fetchDashboard = useCallback(async (currentFilters: DashboardFilters) => {
        setLoading(true);
        setError(null);
        try {
            const data = await getPatientInfoDashboard(currentFilters);
            setDashboardData(data);
        } catch (err) {
            console.error('Failed to load Patient Info dashboard:', err);
            setError('Failed to load Patient Info analytics. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch students list for registry table
    const fetchStudentsList = useCallback(async (currentFilters: DashboardFilters) => {
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
    }, []);

    // Initial load
    useEffect(() => {
        let isMounted = true;
        Promise.all([
            getPatientInfoDashboard(filters),
            getStudents(filters.school_id ? { school_id: filters.school_id } : undefined),
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
                    console.error('Initial patient info load failed:', err);
                    setError('Failed to load Patient Info dashboard data.');
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

    const handleOpenModal = useCallback(() => setIsRegisterModalOpen(true), []);
    const handleCloseModal = useCallback(() => {
        setIsRegisterModalOpen(false);
        // Refresh data on modal close
        void fetchDashboard(filters);
        void fetchStudentsList(filters);
    }, [fetchDashboard, fetchStudentsList, filters]);

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
    const genderChartData = useMemo(() => {
        if (!dashboardData) return [];
        return [
            { name: 'Male', value: dashboardData.gender_distribution.male },
            { name: 'Female', value: dashboardData.gender_distribution.female },
        ];
    }, [dashboardData]);

    const ageGroupChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.age_group_distribution.map((item) => ({
            name: item.age_group,
            Students: item.count,
        }));
    }, [dashboardData]);

    const philhealthCoverageChartData = useMemo(() => {
        if (!dashboardData) return [];
        return [
            { name: 'Covered', value: dashboardData.philhealth_coverage.covered },
            { name: 'Not Covered', value: dashboardData.philhealth_coverage.not_covered },
        ];
    }, [dashboardData]);

    const philhealthCategoryChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.philhealth_category_breakdown.map((item) => ({
            name: item.category,
            Count: item.count,
        }));
    }, [dashboardData]);

    const municipalityChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.registration_by_municipality.map((item) => ({
            name: item.municipality_name,
            Registrations: item.count,
        }));
    }, [dashboardData]);

    const trendChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.registration_trend.map((item) => ({
            name: item.month,
            Registrations: item.count,
        }));
    }, [dashboardData]);

    const bloodTypeChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.blood_type_distribution.map((item) => ({
            name: item.blood_type,
            Count: item.count,
        }));
    }, [dashboardData]);

    const pwdChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.pwd_distribution.map((item) => ({
            name: item.pwd_type,
            Count: item.count,
        }));
    }, [dashboardData]);

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
                <button
                    type="button"
                    onClick={() => navigate(`/superuser/students/${student.id}`)}
                    className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 font-semibold text-xs flex items-center group cursor-pointer whitespace-nowrap"
                >
                    View Profile
                    <ChevronRight className="w-3.5 h-3.5 ml-0.5 transform group-hover:translate-x-1 transition-transform" />
                </button>
            ),
        },
    ], [navigate]);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-3 sm:p-6 space-y-4 sm:space-y-6 text-slate-700 dark:text-slate-200 font-sans max-w-full overflow-x-hidden flex flex-col">

            {/* Header Title Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm shrink-0">
                <div>
                    <h1 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                        Patient Registry &amp; Analytics
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Client registry demographics, animal bite tracking, and health insurance coverage.
                    </p>
                </div>
                {canCreateStudent && <button
                    type="button"
                    onClick={handleOpenModal}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors shadow-sm cursor-pointer shrink-0"
                >
                    <UserPlus className="w-4 h-4" />
                    <span>Register New Student</span>
                </button>}
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
                        Aggregating patient demographics and health metrics...
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
                    {/* Stat Cards Grid (5 key metrics) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 shrink-0">
                        {/* 1. Total Registered Students */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Total Registered
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.total_students.toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">Active student records</p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-teal-50 dark:bg-teal-900/30 rounded-xl text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-800 shrink-0">
                                <Users className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>

                        {/* 2. 4Ps Members */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    4Ps Beneficiaries
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.four_ps_count.toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    {dashboardData.total_students > 0
                                        ? `${Math.round((dashboardData.four_ps_count / dashboardData.total_students) * 100)}% of total`
                                        : '0%'}
                                </p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 shrink-0">
                                <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>

                        {/* 3. Indigenous Peoples (IPs) */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Indigenous (IP)
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.indigenous_count.toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">Enrolled IP students</p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-amber-50 dark:bg-amber-900/30 rounded-xl text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-800 shrink-0">
                                <HeartHandshake className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>

                        {/* 4. Students with PWD */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Students with PWD
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.pwd_total.toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">Special assistance</p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-purple-50 dark:bg-purple-900/30 rounded-xl text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-800 shrink-0">
                                <Activity className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>

                        {/* 5. Animal Bite Active Cases (Alert Card) */}
                        <div className={`p-4 rounded-xl border shadow-sm flex justify-between items-center ${
                            dashboardData.animal_bites_active_cases > 0
                                ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                        }`}>
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Animal Bite Cases
                                </p>
                                <h3 className={`text-xl sm:text-2xl font-bold mt-0.5 ${
                                    dashboardData.animal_bites_active_cases > 0
                                        ? 'text-red-600 dark:text-red-400'
                                        : 'text-slate-900 dark:text-white'
                                }`}>
                                    {dashboardData.animal_bites_active_cases.toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">Active exposure cases</p>
                            </div>
                            <div className={`p-2.5 sm:p-3 rounded-xl shrink-0 ${
                                dashboardData.animal_bites_active_cases > 0
                                    ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-700'
                                    : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700'
                            }`}>
                                <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>
                    </div>

                    {/* Empty State Warning if 0 students */}
                    {dashboardData.total_students === 0 && (
                        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-center">
                            <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-300 font-medium">
                                No registered students match the selected filters. Clear or adjust your filter selection above.
                            </p>
                        </div>
                    )}

                    {/* Charts Grid Row 1: Demographics (Gender, Age Groups, PhilHealth Coverage) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                        {/* Gender Distribution */}
                        <DonutChart
                            data={genderChartData}
                            title="Gender Distribution"
                            colors={['#0d9488', '#3b82f6']}
                        />

                        {/* Age Group Distribution */}
                        <BarChart
                            data={ageGroupChartData}
                            title="Age Group Distribution (Years)"
                            dataKey="Students"
                            xAxisKey="name"
                            colors={['#0d9488']}
                        />

                        {/* PhilHealth Coverage */}
                        <DonutChart
                            data={philhealthCoverageChartData}
                            title={`PhilHealth Coverage (${dashboardData.philhealth_coverage.coverage_rate}%)`}
                            colors={['#10b981', '#94a3b8']}
                        />
                    </div>

                    {/* Charts Grid Row 2: Breakdowns (PhilHealth Category, Blood Type, PWD Type) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                        {/* PhilHealth Category Breakdown */}
                        <BarChart
                            data={philhealthCategoryChartData.length > 0 ? philhealthCategoryChartData : [{ name: 'None', Count: 0 }]}
                            title="PhilHealth Category Breakdown"
                            dataKey="Count"
                            xAxisKey="name"
                            colors={['#3b82f6']}
                        />

                        {/* Blood Type Distribution */}
                        <BarChart
                            data={bloodTypeChartData.length > 0 ? bloodTypeChartData : [{ name: 'None', Count: 0 }]}
                            title="Blood Type Distribution"
                            dataKey="Count"
                            xAxisKey="name"
                            colors={['#ef4444']}
                        />

                        {/* PWD Distribution by Type */}
                        <BarChart
                            data={pwdChartData.length > 0 ? pwdChartData : [{ name: 'None', Count: 0 }]}
                            title="PWD Breakdown by Disability Type"
                            dataKey="Count"
                            xAxisKey="name"
                            colors={['#a855f7']}
                        />
                    </div>

                    {/* Charts Grid Row 3: Municipality & Registration Trend */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 shrink-0">
                        {/* Registration by Municipality */}
                        <BarChart
                            data={municipalityChartData.length > 0 ? municipalityChartData : [{ name: 'None', Registrations: 0 }]}
                            title="Student Registration by Municipality"
                            dataKey="Registrations"
                            xAxisKey="name"
                            colors={['#14b8a6']}
                        />

                        {/* Monthly Registration Trend */}
                        <LineChart
                            data={trendChartData.length > 0 ? trendChartData : [{ name: 'None', Registrations: 0 }]}
                            title="Monthly Registration Trend"
                            dataKey="Registrations"
                            xAxisKey="name"
                            color="#3b82f6"
                        />
                    </div>
                </>
            )}

            {/* Data Table Section (Live Students) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-6 shadow-sm shrink-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 sm:mb-6">
                    <div>
                        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Student Registry</h2>
                        <p className="text-xs text-slate-400">
                            {studentsLoading
                                ? 'Loading registered students...'
                                : `Showing ${filteredStudents.length} registered students under current scope`}
                        </p>
                    </div>
                    <div className="relative w-full sm:w-80">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search by name or LRN..."
                            value={searchQuery}
                            onChange={handleSearchChange}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {studentsLoading ? (
                        <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2">
                            <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
                            <span>Loading student records...</span>
                        </div>
                    ) : (
                        <DataTable
                            data={paginatedStudents}
                            columns={columns}
                            pagination={{
                                currentPage: currentPage,
                                totalPages: totalPages,
                                onPageChange: handlePageChange,
                            }}
                        />
                    )}
                </div>
            </div>

            {/* Register New Student Modal */}
            {canCreateStudent && isRegisterModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6 overflow-y-auto"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col relative overflow-hidden">
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 sm:px-6 py-3.5 sticky top-0 bg-white dark:bg-slate-900 z-20 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="h-2.5 w-2.5 rounded-full bg-teal-600"></div>
                                <div>
                                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                                        Register New Student
                                    </h2>
                                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
                                        Fill in the student credentials and required details below.
                                    </p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleCloseModal}
                                className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer focus:outline-none"
                                aria-label="Close Modal"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 sm:p-8 overflow-y-auto flex-1 text-slate-800 dark:text-slate-100 overscroll-contain">
                            <Suspense
                                fallback={
                                    <div className="flex h-48 w-full items-center justify-center">
                                        <p className="text-sm font-medium text-slate-400">Loading form components...</p>
                                    </div>
                                }
                            >
                                <RegistrationForm onClose={handleCloseModal} />
                            </Suspense>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PatientInfoDash;
