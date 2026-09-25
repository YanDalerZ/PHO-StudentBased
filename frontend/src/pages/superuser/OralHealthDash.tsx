import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Smile,
    CheckCircle2,
    Users,
    Building2,
    Search,
    ChevronRight,
    AlertTriangle,
    RefreshCw,
    Loader2,
    Clock,
} from 'lucide-react';
import { FilterBar } from '../../components/common/FilterBar';
import { DataTable } from '../../components/common/DataTable';
import { BarChart } from '../../components/charts/BarChart';
import { DonutChart } from '../../components/charts/DonutChart';
import { LineChart } from '../../components/charts/LineChart';
import { getOralHealthDashboard, getStudents } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { hasModulePermission } from '../../lib/access';
import type {
    Student,
    DashboardFilters,
    OralHealthDashboardResponse,
} from '../../types';

const PAGE_SIZE = 5;

export const OralHealthDash: React.FC = () => {
    const navigate = useNavigate();
    const { effectiveAccess } = useAuth();
    const hasPatientInfoAccess = hasModulePermission(effectiveAccess, 'patient-info', 'can_view');

    // Dashboard State
    const [filters, setFilters] = useState<DashboardFilters>({});
    const [dashboardData, setDashboardData] = useState<OralHealthDashboardResponse | null>(null);
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
            const data = await getOralHealthDashboard(currentFilters);
            setDashboardData(data);
        } catch (err) {
            console.error('Failed to load Oral Health dashboard:', err);
            setError('Failed to load Oral Health analytics. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch students list for registry table
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
            getOralHealthDashboard(filters),
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
                    console.error('Initial oral health load failed:', err);
                    setError('Failed to load Oral Health dashboard data.');
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
    const rpocStepsChartData = useMemo(() => {
        if (!dashboardData) return [];
        return [
            { name: 'Screening', Students: dashboardData.rpoc_steps.screening },
            { name: 'Risk Assessment', Students: dashboardData.rpoc_steps.risk_assessment },
            { name: 'Prophylaxis', Students: dashboardData.rpoc_steps.prophylaxis },
            { name: 'Counseling', Students: dashboardData.rpoc_steps.counseling },
            { name: 'Fluoride Varnish', Students: dashboardData.rpoc_steps.fluoride_varnish },
        ];
    }, [dashboardData]);

    const facilityChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.facility_distribution.map((item) => ({
            name: item.location,
            value: item.count,
        }));
    }, [dashboardData]);

    const visitTypeChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.visit_type_distribution.map((item) => ({
            name: item.visit_type,
            value: item.count,
        }));
    }, [dashboardData]);

    const schoolCoverageChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.coverage_by_school.map((item) => ({
            name: item.school_name,
            Examined: item.count,
        }));
    }, [dashboardData]);

    const trendChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.monthly_trend.map((item) => ({
            name: item.month,
            Examined: item.count,
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
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate(`/superuser/students/${student.id}/oral-health`)}
                        className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 font-semibold text-xs flex items-center group cursor-pointer whitespace-nowrap"
                    >
                        Oral Health
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
                        Oral Health &amp; RPOC Analytics
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Routine Preventive Oral Care (RPOC), examination coverage, and visit location metrics.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/superuser/students')}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors shadow-sm cursor-pointer shrink-0"
                >
                    <Smile className="w-4 h-4" />
                    <span>Record Oral Examination</span>
                </button>
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
                        Aggregating oral health examinations and RPOC completion rates...
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
                        {/* 1. Total Students Examined */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Students Examined
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.total_students_examined.toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    Distinct student coverage
                                </p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-teal-50 dark:bg-teal-900/30 rounded-xl text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-800 shrink-0">
                                <Users className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>

                        {/* 2. RPOC Completion Rate */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    RPOC Complete Rate
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.rpoc_completion.completion_rate}%
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    {dashboardData.rpoc_completion.completed} of {dashboardData.total_students_examined} complete
                                </p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800 shrink-0">
                                <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>

                        {/* 3. Total Examinations / Visits */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Total Visits
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.total_examinations.toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    All examination records
                                </p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 shrink-0">
                                <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>

                        {/* 4. Facility Service Location */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Facility Delivery
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.facility_distribution.find(f => f.location === 'FACILITY')?.count ?? 0}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    {dashboardData.facility_distribution.find(f => f.location === 'NON-FACILITY')?.count ?? 0} Non-Facility
                                </p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 shrink-0">
                                <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>
                    </div>

                    {/* Empty State Warning if 0 examined */}
                    {dashboardData.total_students_examined === 0 && (
                        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-center">
                            <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-300 font-medium">
                                No oral health examination records match the selected filters. Clear or adjust your filter selection above.
                            </p>
                        </div>
                    )}

                    {/* Charts Grid Row 1: RPOC Steps (Wide) & Visit Distributions */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0">
                        {/* 5 RPOC Steps Breakdown */}
                        <div className="lg:col-span-2">
                            <BarChart
                                data={rpocStepsChartData}
                                title="Routine Preventive Oral Care (RPOC) Steps Completed"
                                dataKey="Students"
                                xAxisKey="name"
                                colors={['#0d9488']}
                            />
                        </div>

                        {/* Facility vs Non-Facility */}
                        <DonutChart
                            data={facilityChartData.length > 0 ? facilityChartData : [{ name: 'None', value: 0 }]}
                            title="Service Location Delivery"
                            colors={['#0d9488', '#f59e0b']}
                        />
                    </div>

                    {/* Charts Grid Row 2: Visit Type, School Coverage & Monthly Trend */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                        {/* 1st Visit vs 2nd Visit */}
                        <DonutChart
                            data={visitTypeChartData.length > 0 ? visitTypeChartData : [{ name: 'None', value: 0 }]}
                            title="Visit Type Distribution"
                            colors={['#3b82f6', '#8b5cf6']}
                        />

                        {/* Coverage by School */}
                        <BarChart
                            data={schoolCoverageChartData.length > 0 ? schoolCoverageChartData : [{ name: 'None', Examined: 0 }]}
                            title="Examination Coverage by School"
                            dataKey="Examined"
                            xAxisKey="name"
                            colors={['#14b8a6']}
                        />

                        {/* Monthly Examination Trend */}
                        <LineChart
                            data={trendChartData.length > 0 ? trendChartData : [{ name: 'None', Examined: 0 }]}
                            title="Monthly Examination Trend"
                            dataKey="Examined"
                            xAxisKey="name"
                            color="#0d9488"
                        />
                    </div>
                </>
            )}

            {/* Student Registry Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-6 shadow-sm shrink-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 sm:mb-6">
                    <div>
                        <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                            Student Examination Scope
                        </h2>
                        <p className="text-xs text-slate-400">
                            {studentsLoading
                                ? 'Loading students...'
                                : `Showing ${filteredStudents.length} students under active filter`}
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
        </div>
    );
};

export default OralHealthDash;
