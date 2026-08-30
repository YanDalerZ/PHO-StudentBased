import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMockData } from '../../context/MockDataContext';
import { Search, ChevronRight, FileText } from 'lucide-react';
import { DataTable } from '../../components/common/DataTable';
import { FilterBar } from '../../components/common/FilterBar';
import type { Student } from '../../types';

const StudentLookupDash: React.FC = () => {
    const { students } = useMockData();
    const [searchQuery, setSearchQuery] = useState('');

    const filteredStudents = students.filter((student: Student) => 
        student.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        student.student_lrn.includes(searchQuery)
    );

    const columns = [
        {
            header: 'Name',
            cell: (student: Student) => (
                <div className="flex items-center">
                    <div className="h-8 w-8 rounded-full bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 font-bold flex items-center justify-center text-xs mr-3">
                        {student.first_name[0]}{student.last_name[0]}
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{student.first_name} {student.last_name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{student.date_of_birth}</p>
                    </div>
                </div>
            )
        },
        {
            header: 'LRN',
            accessorKey: 'student_lrn' as keyof Student,
            className: 'text-slate-600 dark:text-slate-400'
        },
        {
            header: 'Sex',
            accessorKey: 'sex' as keyof Student,
            className: 'text-slate-600 dark:text-slate-400'
        },
        {
            header: 'Grade & Section',
            cell: (student: Student) => (
                <span className="text-slate-600 dark:text-slate-400">{student.grade_level} - {student.section}</span>
            )
        },
        {
            header: 'Actions',
            cell: (student: Student) => (
                <Link to={`/teacher/students/${student.id}`} className="text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 font-medium text-sm flex items-center group">
                    View Profile
                    <ChevronRight className="w-4 h-4 ml-1 transform group-hover:translate-x-1 transition-transform" />
                </Link>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Student Lookup</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Search and view student profiles and module completion status across the province.</p>
                </div>
                <div className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium text-sm rounded-xl flex items-center space-x-2 border border-slate-200 dark:border-slate-700">
                    <FileText className="w-4 h-4" />
                    <span>Read Only Access</span>
                </div>
            </div>

            <FilterBar onFilterChange={() => {}} className="mb-6" />

            <div className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
                    <div className="relative w-full sm:w-96">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search by name or LRN..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                        />
                    </div>
                </div>

                <DataTable 
                    data={filteredStudents}
                    columns={columns}
                    pagination={{
                        currentPage: 1,
                        totalPages: 1,
                        onPageChange: () => {}
                    }}
                />
            </div>
        </div>
    );
};

export default StudentLookupDash;
