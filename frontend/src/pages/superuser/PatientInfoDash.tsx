import React, { useState, lazy, Suspense, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilterBar } from '../../components/common/FilterBar';
import { Users, FileText, Activity, Search, ChevronRight, UserPlus, X } from 'lucide-react';
import { DataTable } from '../../components/common/DataTable';
import { useMockData } from '../../context/MockDataContext';
import type { Student } from '../../types';

// Lazy load RegistrationForm for optimized bundle splitting
const RegistrationForm = lazy(() => import('../RegistrationForm'));

const PAGE_SIZE = 5;

// Compact Custom SVG Bar Chart
const CustomBarChart = () => (
    <div className="w-full h-full flex flex-col justify-between pt-2">
        <h3 className="text-xs font-semibold text-slate-700 mb-2">Registration by Age Group</h3>
        <div className="flex-1 flex items-end justify-between gap-4 px-2 pb-2 border-b border-slate-100">
            <div className="flex-1 flex flex-col items-center gap-1 group">
                <span className="text-[10px] text-slate-400 group-hover:text-emerald-600 transition-colors">1,350</span>
                <div className="w-full bg-emerald-500 rounded-t-md h-24 transition-all group-hover:bg-emerald-600" />
                <span className="text-[10px] text-slate-500 font-medium">5-9 yrs</span>
            </div>
            <div className="flex-1 flex flex-col items-center gap-1 group">
                <span className="text-[10px] text-slate-400 group-hover:text-emerald-600 transition-colors">1,800</span>
                <div className="w-full bg-emerald-500 rounded-t-md h-32 transition-all group-hover:bg-emerald-600" />
                <span className="text-[10px] text-slate-500 font-medium">10-14 yrs</span>
            </div>
            <div className="flex-1 flex flex-col items-center gap-1 group">
                <span className="text-[10px] text-slate-400 group-hover:text-emerald-600 transition-colors">950</span>
                <div className="w-full bg-emerald-500 rounded-t-md h-16 transition-all group-hover:bg-emerald-600" />
                <span className="text-[10px] text-slate-500 font-medium">15-19 yrs</span>
            </div>
        </div>
    </div>
);

// Compact Custom CSS/SVG Donut Chart
const CustomDonutChart = () => (
    <div className="w-full h-full flex flex-col justify-between pt-2">
        <h3 className="text-xs font-semibold text-slate-700 mb-1">Gender Distribution</h3>
        <div className="flex-1 flex items-center justify-center relative">
            <div className="w-28 h-28 rounded-full border-[10px] border-emerald-500 border-t-blue-500 border-r-blue-500 transform -rotate-45 flex items-center justify-center">
                <div className="text-center">
                    <span className="text-xs font-bold text-slate-800">4,150</span>
                    <span className="block text-[9px] text-slate-400">Total</span>
                </div>
            </div>
        </div>
        <div className="flex justify-center gap-4 text-[11px] pt-1">
            <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                <span className="text-slate-600">Female (52%)</span>
            </div>
            <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span className="text-slate-600">Male (48%)</span>
            </div>
        </div>
    </div>
);

// Compact Custom SVG Line Chart
const CustomLineChart = () => (
    <div className="w-full h-full flex flex-col justify-between pt-2">
        <h3 className="text-xs font-semibold text-slate-700 mb-1">Monthly Registration Trend</h3>
        <div className="flex-1 relative flex items-end pb-4 pt-2">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 300 100" preserveAspectRatio="none">
                <path
                    d="M 10,80 Q 60,60 110,30 T 210,10 T 290,40"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="3"
                />
                <circle cx="10" cy="80" r="4" className="fill-blue-500" />
                <circle cx="70" cy="60" r="4" className="fill-blue-500" />
                <circle cx="130" cy="25" r="4" className="fill-blue-500" />
                <circle cx="190" cy="35" r="4" className="fill-blue-500" />
                <circle cx="250" cy="10" r="4" className="fill-blue-500" />
                <circle cx="290" cy="40" r="4" className="fill-blue-500" />
            </svg>
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 px-1 border-t border-slate-100 pt-1">
            <span>Jan</span>
            <span>Feb</span>
            <span>Mar</span>
            <span>Apr</span>
            <span>May</span>
            <span>Jun</span>
        </div>
    </div>
);

const PatientInfoDash: React.FC = () => {
    const { students } = useMockData();
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

    const handleOpenModal = useCallback(() => setIsRegisterModalOpen(true), []);
    const handleCloseModal = useCallback(() => setIsRegisterModalOpen(false), []);

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
            student.student_lrn.includes(query)
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

    const columns = useMemo(() => [
        {
            header: 'Name',
            cell: (student: Student) => (
                <div className="flex items-center min-w-[140px]">
                    <div className="h-7 w-7 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs mr-2.5 shrink-0">
                        {student.first_name[0]}{student.last_name[0]}
                    </div>
                    <div className="truncate">
                        <p className="text-xs font-semibold text-black truncate">{student.first_name} {student.last_name}</p>
                        <p className="text-[10px] text-slate-400">{student.date_of_birth}</p>
                    </div>
                </div>
            )
        },
        {
            header: 'LRN',
            accessorKey: 'student_lrn' as keyof Student,
            className: 'text-slate-600 font-mono text-xs'
        },
        {
            header: 'Sex',
            accessorKey: 'sex' as keyof Student,
            className: 'text-slate-600 text-xs'
        },
        {
            header: 'Grade & Section',
            cell: (student: Student) => (
                <span className="text-slate-600 font-medium text-xs whitespace-nowrap">{student.grade_level} - {student.section}</span>
            )
        },
        {
            header: 'Actions',
            cell: (student: Student) => (
                <button
                    type="button"
                    onClick={() => navigate(`/superuser/students/${student.id}`)}
                    className="text-emerald-600 hover:text-emerald-700 font-semibold text-xs flex items-center group cursor-pointer whitespace-nowrap"
                >
                    View Profile
                    <ChevronRight className="w-3.5 h-3.5 ml-0.5 transform group-hover:translate-x-1 transition-transform" />
                </button>
            )
        }
    ], [navigate]);

    return (
        <div className="min-h-screen bg-slate-50/60 p-3 sm:p-6 space-y-4 sm:space-y-6 text-slate-700 font-sans max-w-full overflow-x-hidden flex flex-col">

            {/* Header Title Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-xl border border-slate-100 shadow-sm shrink-0">
                <div>
                    <h1 className="text-lg sm:text-2xl font-bold text-black tracking-tight">Patient Registry &amp; Analytics</h1>
                    <p className="text-xs text-slate-500 mt-0.5">Analytics and searchable registry for student health records.</p>
                </div>
                <button
                    type="button"
                    onClick={handleOpenModal}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-emerald-200 cursor-pointer shrink-0"
                >
                    <UserPlus className="w-4 h-4" />
                    <span>Register New Student</span>
                </button>
            </div>

            {/* Filter Bar */}
            <div className="shrink-0">
                <FilterBar onFilterChange={() => { }} className="w-full" />
            </div>

            {/* Stat Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 shrink-0">
                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center">
                    <div>
                        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Registered Students</p>
                        <h3 className="text-xl sm:text-2xl font-bold text-black mt-0.5">4,150</h3>
                        <p className="text-[10px] text-slate-400">Active patient files</p>
                    </div>
                    <div className="p-2.5 sm:p-3 bg-emerald-50 rounded-xl text-emerald-600 border border-emerald-100 shrink-0">
                        <Users className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center">
                    <div>
                        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Indigenous Peoples (IPs)</p>
                        <h3 className="text-xl sm:text-2xl font-bold text-black mt-0.5">342</h3>
                        <p className="text-[10px] text-slate-400">Enrolled students</p>
                    </div>
                    <div className="p-2.5 sm:p-3 bg-amber-50 rounded-xl text-amber-600 border border-amber-100 shrink-0">
                        <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center">
                    <div>
                        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Students with PWD</p>
                        <h3 className="text-xl sm:text-2xl font-bold text-black mt-0.5">128</h3>
                        <p className="text-[10px] text-slate-400">Special assistance required</p>
                    </div>
                    <div className="p-2.5 sm:p-3 bg-purple-50 rounded-xl text-purple-600 border border-purple-100 shrink-0">
                        <Activity className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                </div>
            </div>

            {/* Fixed Analytics Charts Grid (Clean, Responsive & Non-Overlapping) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm min-h-[220px] h-[220px] overflow-hidden">
                    <CustomBarChart />
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm min-h-[220px] h-[220px] overflow-hidden">
                    <CustomDonutChart />
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm min-h-[220px] h-[220px] overflow-hidden">
                    <CustomLineChart />
                </div>
            </div>

            {/* Data Table Section */}
            <div className="bg-white border border-slate-100 rounded-xl p-4 sm:p-6 shadow-sm shrink-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 sm:mb-6">
                    <div>
                        <h2 className="text-base sm:text-lg font-bold text-black">Student Registry</h2>
                        <p className="text-xs text-slate-400">Manage and view records of registered students</p>
                    </div>
                    <div className="relative w-full sm:w-80">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search by name or LRN..."
                            value={searchQuery}
                            onChange={handleSearchChange}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-black placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <DataTable
                        data={paginatedStudents}
                        columns={columns}
                        pagination={{
                            currentPage: currentPage,
                            totalPages: totalPages,
                            onPageChange: handlePageChange
                        }}
                    />
                </div>
            </div>

            {/* Modal */}
            {isRegisterModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6 overflow-y-auto"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col relative overflow-hidden">
                        <div className="flex items-center justify-between border-b border-slate-100 px-4 sm:px-6 py-3.5 sticky top-0 bg-white z-20 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="h-2.5 w-2.5 rounded-full bg-emerald-600"></div>
                                <div>
                                    <h2 className="text-base sm:text-lg font-bold text-black tracking-tight">Register New Student</h2>
                                    <p className="text-[11px] sm:text-xs text-slate-500">Fill in the student credentials and required details below.</p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleCloseModal}
                                className="p-1.5 text-slate-400 hover:text-black hover:bg-slate-100 rounded-xl transition-colors cursor-pointer focus:outline-none"
                                aria-label="Close Modal"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 sm:p-8 overflow-y-auto flex-1 text-slate-800 overscroll-contain">
                            <Suspense fallback={
                                <div className="flex h-48 w-full items-center justify-center">
                                    <p className="text-sm font-medium text-slate-400">Loading form components...</p>
                                </div>
                            }>
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