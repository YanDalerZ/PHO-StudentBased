import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Activity,
    HeartPulse,
    Thermometer,
    Search,
    ChevronRight,
    AlertTriangle,
    RefreshCw,
    Loader2,
    Info,
    Building2,
} from 'lucide-react';
import { FilterBar } from '../../components/common/FilterBar';
import { DataTable } from '../../components/common/DataTable';
import { BarChart } from '../../components/charts/BarChart';
import { DonutChart } from '../../components/charts/DonutChart';
import { LineChart } from '../../components/charts/LineChart';
import { getVitalSignsDashboard, getStudents } from '../../services/api';
import type {
    Student,
    DashboardFilters,
    VitalSignsDashboardResponse,
} from '../../types';

const PAGE_SIZE = 5;

export const VitalSignsDash: React.FC = () => {
    const navigate = useNavigate();

    // Dashboard State
    const [filters, setFilters] = useState<DashboardFilters>({});
    const [dashboardData, setDashboardData] = useState<VitalSignsDashboardResponse | null>(null);
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
            const data = await getVitalSignsDashboard(currentFilters);
            setDashboardData(data);
        } catch (err) {
            console.error('Failed to load Vital Signs dashboard:', err);
            setError('Failed to load Vital Signs analytics. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch students list for quick registry navigation
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
            getVitalSignsDashboard(filters),
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
                    console.error('Initial vital signs load failed:', err);
                    setError('Failed to load Vital Signs dashboard data.');
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
    const bmiChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.bmi_distribution.map((item) => ({
            name: item.interval,
            Students: item.count,
        }));
    }, [dashboardData]);

    const systolicChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.blood_pressure_systolic_distribution.map((item) => ({
            name: item.interval,
            value: item.count,
        }));
    }, [dashboardData]);

    const tempChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.temperature_distribution.map((item) => ({
            name: item.interval,
            value: item.count,
        }));
    }, [dashboardData]);

    const trendChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.monthly_trend.map((item) => ({
            name: item.month,
            Screened: item.count,
        }));
    }, [dashboardData]);

    const schoolCoverageChartData = useMemo(() => {
        if (!dashboardData) return [];
        return dashboardData.coverage_by_school.map((item) => ({
            name: item.school_name,
            Screened: item.count,
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
                        onClick={() => navigate(`/superuser/students/${student.id}/vital-signs`)}
                        className="text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 font-semibold text-xs flex items-center group cursor-pointer whitespace-nowrap"
                    >
                        Vital Signs
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
                        Vital Signs &amp; Physical Screening Analytics
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Basic student physical screening, measurement distributions, and school coverage.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/superuser/students')}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors shadow-sm cursor-pointer shrink-0"
                >
                    <Activity className="w-4 h-4" />
                    <span>Record Vital Signs</span>
                </button>
            </div>

            {/* Clinical-Threshold Safeguard Notice Banner */}
            <div className="bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 rounded-xl p-3.5 sm:p-4 text-xs text-amber-900 dark:text-amber-200 shadow-xs shrink-0 flex items-start gap-3">
                <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold uppercase tracking-wider text-[11px] text-amber-800 dark:text-amber-300">
                            Clinical-Threshold Safeguard Notice
                        </span>
                        <span className="px-2 py-0.5 bg-amber-200/60 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-semibold rounded-full text-[10px]">
                            Policy: Pending PHO Approval
                        </span>
                    </div>
                    <p className="text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                        Classifications for pediatric student blood pressure percentiles, BMI-for-age z-scores, and temperature abnormalities are awaiting formal PHO/DepEd policy approval. To ensure clinical safety and avoid inappropriate adult diagnostic labels on children, metrics below display objective raw measurement distributions and screening coverage only.
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
                        Aggregating vital signs screenings and measurement distributions...
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
                        {/* 1. Total Screened Students */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Students Screened
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.total_screened.toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    Distinct student coverage
                                </p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-teal-50 dark:bg-teal-900/30 rounded-xl text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-800 shrink-0">
                                <Activity className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>

                        {/* 2. Total Screenings / Records */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Total Screenings
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.total_screenings.toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    Total clinical visit logs
                                </p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 shrink-0">
                                <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>

                        {/* 3. Elevated Temperature (Raw > 37.5°C) */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Temp &gt; 37.5 °C
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.elevated_temperature_count.toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    Elevated temp readings
                                </p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-amber-50 dark:bg-amber-900/30 rounded-xl text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-800 shrink-0">
                                <Thermometer className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>

                        {/* 4. BP Measurement Coverage */}
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex justify-between items-center">
                            <div>
                                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    BP Coverage
                                </p>
                                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.measurement_coverage.bp_recorded.toLocaleString()}
                                </h3>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    Students with BP captured
                                </p>
                            </div>
                            <div className="p-2.5 sm:p-3 bg-rose-50 dark:bg-rose-900/30 rounded-xl text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-800 shrink-0">
                                <HeartPulse className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                        </div>
                    </div>

                    {/* Measurement Completeness Summary Row */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm shrink-0">
                        <h2 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-3">
                            Measurement Completeness Across Screened Students
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                                <p className="text-[10px] text-slate-400 font-medium uppercase">Blood Pressure</p>
                                <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.measurement_coverage.bp_recorded}
                                </p>
                            </div>
                            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                                <p className="text-[10px] text-slate-400 font-medium uppercase">BMI Calculated</p>
                                <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.measurement_coverage.bmi_recorded}
                                </p>
                            </div>
                            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                                <p className="text-[10px] text-slate-400 font-medium uppercase">Temperature</p>
                                <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.measurement_coverage.temperature_recorded}
                                </p>
                            </div>
                            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                                <p className="text-[10px] text-slate-400 font-medium uppercase">Pulse / Heart Rate</p>
                                <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.measurement_coverage.pulse_recorded}
                                </p>
                            </div>
                            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                                <p className="text-[10px] text-slate-400 font-medium uppercase">Respiratory Rate</p>
                                <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                                    {dashboardData.measurement_coverage.respiratory_recorded}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Visualizations Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 shrink-0">
                        {/* 1. BMI Value Intervals (BarChart) */}
                        <BarChart
                            title="BMI Value Distribution (Raw Numerical Intervals)"
                            data={bmiChartData}
                            dataKey="Students"
                            xAxisKey="name"
                            colors={['#14b8a6']}
                        />

                        {/* 2. Systolic Blood Pressure Intervals (DonutChart) */}
                        <DonutChart
                            title="Systolic Blood Pressure Intervals (mmHg)"
                            data={systolicChartData}
                            colors={['#3b82f6', '#14b8a6', '#f59e0b', '#ef4444']}
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 shrink-0">
                        {/* 3. Temperature Distribution (DonutChart) */}
                        <DonutChart
                            title="Body Temperature Distribution (°C)"
                            data={tempChartData}
                            colors={['#0ea5e9', '#10b981', '#f59e0b']}
                        />

                        {/* 4. Monthly Trend (LineChart) */}
                        <LineChart
                            title="Monthly Screening Volume Trend"
                            data={trendChartData}
                            dataKey="Screened"
                            xAxisKey="name"
                            color="#6366f1"
                        />
                    </div>

                    {/* School Screening Coverage (BarChart) */}
                    {dashboardData.coverage_by_school.length > 0 && (
                        <div className="shrink-0">
                            <BarChart
                                title="Screening Coverage by School (Top Schools)"
                                data={schoolCoverageChartData}
                                dataKey="Screened"
                                xAxisKey="name"
                                colors={['#0d9488']}
                            />
                        </div>
                    )}

                    {/* Student Registry Table for Quick Vital Signs Navigation */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 shrink-0">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                            <div>
                                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                                    Student Screening Scope
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Select a student to view or record physical screening and vital signs history.
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

        </div>
    );
};

export default VitalSignsDash;
