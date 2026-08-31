import React, { useState, useMemo, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useMockData } from '../../context/MockDataContext';
import { Search, ChevronRight, UserPlus, X } from 'lucide-react';
import { DataTable } from '../../components/common/DataTable';
import { FilterBar } from '../../components/common/FilterBar';
import type { Student } from '../../types';
import RegistrationForm from '../RegistrationForm';


// Static columns definition moved out of render pass to prevent recreation per frame
const columns = [
    {
        header: 'Name',
        cell: (student: Student) => (
            <div className="flex items-center">
                <div className="h-8 w-8 rounded-full bg-teal-100 text-teal-700 font-bold flex items-center justify-center text-xs mr-3">
                    {student.first_name[0]}{student.last_name[0]}
                </div>
                <div>
                    <p className="text-sm font-medium text-slate-900">{student.first_name} {student.last_name}</p>
                    <p className="text-xs text-slate-500">{student.date_of_birth}</p>
                </div>
            </div>
        )
    },
    {
        header: 'LRN',
        accessorKey: 'student_lrn' as keyof Student,
        className: 'text-slate-600'
    },
    {
        header: 'Sex',
        accessorKey: 'sex' as keyof Student,
        className: 'text-slate-600'
    },
    {
        header: 'Grade & Section',
        cell: (student: Student) => (
            <span className="text-slate-600">{student.grade_level} - {student.section}</span>
        )
    },
    {
        header: 'Actions',
        cell: (student: Student) => (
            <Link to={`/teacher/students/${student.id}`} className="text-teal-600 hover:text-teal-800 font-medium text-sm flex items-center group">
                View Profile
                <ChevronRight className="w-4 h-4 ml-1 transform group-hover:translate-x-1 transition-transform" />
            </Link>
        )
    }
];

const StudentRegistry: React.FC = () => {
    const { students = [] } = useMockData();
    const [searchQuery, setSearchQuery] = useState('');
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

    // Memoize search array evaluation to decouple state changes from modal toggles
    const filteredStudents = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return students;

        return students.filter((student: Student) =>
            student.first_name.toLowerCase().includes(query) ||
            student.last_name.toLowerCase().includes(query) ||
            student.student_lrn.includes(query)
        );
    }, [students, searchQuery]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Student Registry</h1>
                    <p className="text-sm text-slate-500">Manage and view all registered students.</p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsRegisterModalOpen(true)}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm rounded-xl shadow-xs transition-colors self-start md:self-auto flex items-center space-x-2 cursor-pointer"
                >
                    <UserPlus className="w-4 h-4" />
                    <span>Register Student</span>
                </button>
            </div>

            <FilterBar onFilterChange={() => { }} className="mb-6" />

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
                    <div className="relative w-full sm:w-96">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search by name or LRN..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                        />
                    </div>
                </div>

                <DataTable
                    data={filteredStudents}
                    columns={columns}
                    pagination={{
                        currentPage: 1,
                        totalPages: 1,
                        onPageChange: () => { }
                    }}
                />
            </div>

            {/* Registration Form Modal */}
            {isRegisterModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 md:p-6 overflow-y-auto"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col relative overflow-hidden">

                        {/* Modal Header without expensive backdrop-blur */}
                        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sticky top-0 bg-white z-20 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="h-2 w-2 rounded-full bg-indigo-600"></div>
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Register New Student</h2>
                                    <p className="text-xs text-slate-500 mt-0.5">Fill in the student credentials and required details below.</p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsRegisterModalOpen(false)}
                                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-200"
                                aria-label="Close Modal"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Lazy Loaded Form Content */}
                        <div className="p-6 md:p-8 overflow-y-auto flex-1 text-slate-800">
                            <Suspense fallback={
                                <div className="flex h-48 w-full items-center justify-center">
                                    <p className="text-sm font-medium text-slate-400">Loading form components...</p>
                                </div>
                            }>
                                <RegistrationForm onClose={() => setIsRegisterModalOpen(false)} />
                            </Suspense>
                        </div>

                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentRegistry;