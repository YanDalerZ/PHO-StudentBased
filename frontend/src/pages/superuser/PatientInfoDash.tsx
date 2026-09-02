import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FilterBar } from '../../components/common/FilterBar';
import { StatCard } from '../../components/common/StatCard';
import { Users, FileText, Activity, Search, ChevronRight } from 'lucide-react';
import { DataTable } from '../../components/common/DataTable';
import { useMockData } from '../../context/MockDataContext';
import type { Student } from '../../types';
import { BarChart } from '../../components/charts/BarChart';
import { DonutChart } from '../../components/charts/DonutChart';
import { LineChart } from '../../components/charts/LineChart';
import { mockAgeGroupDistribution, mockGenderDistribution, mockMonthlyRegistrations } from '../../utils/mockChartData';

const PatientInfoDash: React.FC = () => {
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
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Patient Registry & Analytics</h1>
                    <p className="text-sm text-slate-500">Analytics and searchable registry for student health records.</p>
                </div>
            </div>

            <FilterBar onFilterChange={() => {}} className="mb-6" />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard 
                    title="Total Registered Students"
                    value="4,150"
                    icon={Users}
                    iconBgClass="bg-blue-100 border-blue-200"
                    iconColorClass="text-blue-600"
                />
                <StatCard 
                    title="Indigenous Peoples (IPs)"
                    value="342"
                    icon={FileText}
                    iconBgClass="bg-amber-100 border-amber-200"
                    iconColorClass="text-amber-600"
                />
                <StatCard 
                    title="Students with PWD"
                    value="128"
                    icon={Activity}
                    iconBgClass="bg-purple-100 border-purple-200"
                    iconColorClass="text-purple-600"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <BarChart 
                    title="Registration by Age Group" 
                    data={mockAgeGroupDistribution} 
                    dataKey="students" 
                />
                <DonutChart 
                    title="Gender Distribution" 
                    data={mockGenderDistribution} 
                />
            </div>
            
            <div className="grid grid-cols-1 gap-6">
                <LineChart 
                    title="Monthly Registration Trend" 
                    data={mockMonthlyRegistrations} 
                    dataKey="count" 
                />
            </div>

            <div className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm mt-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Student Registry</h2>
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

export default PatientInfoDash;
