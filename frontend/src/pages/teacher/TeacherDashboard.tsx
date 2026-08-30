import React from 'react';
import { Link } from 'react-router-dom';
import { useMockData } from '../../context/MockDataContext';
import { StatCard } from '../../components/common/StatCard';
import {
    Users,
    CheckCircle2,
    Clock,
    AlertCircle,
    ChevronRight,
    UserPlus
} from 'lucide-react';

const TeacherDashboard: React.FC = () => {
    const { students, moduleStatuses } = useMockData();

    // Calculate metrics
    const totalStudents = students.length;
    
    let totalModulesCompleted = 0;
    let pendingModules = 0;
    
    students.forEach(student => {
        const status = moduleStatuses[student.id || 0];
        if (status) {
            Object.values(status).forEach(modStatus => {
                if (modStatus === 'Completed') totalModulesCompleted++;
                if (modStatus === 'Pending') pendingModules++;
            });
        }
    });

    const stats = [
        {
            id: 1,
            label: 'Total Students',
            value: totalStudents.toString(),
            change: '+2 this month',
            isPositive: true,
            icon: Users,
            iconColor: 'text-teal-600',
            iconBg: 'bg-teal-100 border-teal-200'
        },
        {
            id: 2,
            label: 'Completed Modules',
            value: totalModulesCompleted.toString(),
            change: 'Overall completion',
            isPositive: true,
            icon: CheckCircle2,
            iconColor: 'text-emerald-600',
            iconBg: 'bg-emerald-100 border-emerald-200'
        },
        {
            id: 3,
            label: 'Pending Modules',
            value: pendingModules.toString(),
            change: 'Needs attention',
            isPositive: false,
            icon: Clock,
            iconColor: 'text-amber-600',
            iconBg: 'bg-amber-100 border-amber-200'
        }
    ];

    // Recent students (last 4)
    const recentStudents = [...students].reverse().slice(0, 4);

    return (
        <div className="space-y-6">
            {/* Welcome Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Teacher Dashboard</h1>
                    <p className="text-sm text-slate-500">Overview of student registrations and module completion.</p>
                </div>
                <Link to="/registration-form" className="px-4 py-2.5 bg-linear-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 text-white font-medium text-sm rounded-xl shadow-md transition-all self-start md:self-auto flex items-center space-x-2">
                    <UserPlus className="w-4 h-4" />
                    <span>Register Student</span>
                </Link>
            </div>

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {stats.map((stat) => (
                    <StatCard 
                        key={stat.id}
                        title={stat.label}
                        value={stat.value}
                        icon={stat.icon}
                        trend={{
                            value: parseInt(stat.change.replace(/[^0-9]/g, '')) || 0,
                            label: stat.change.replace(/[0-9+]/g, '').trim(),
                            isPositive: stat.isPositive
                        }}
                        iconBgClass={stat.iconBg}
                        iconColorClass={stat.iconColor}
                    />
                ))}
            </div>

            {/* Activity & Quick Actions Split */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Registrations Table */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm lg:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-slate-900">Recent Registrations</h2>
                        <Link to="/teacher/students" className="text-sm text-teal-600 hover:underline flex items-center space-x-1">
                            <span>View all</span>
                            <ChevronRight className="w-4 h-4" />
                        </Link>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr>
                                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Name</th>
                                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">LRN</th>
                                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Grade</th>
                                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentStudents.length > 0 ? recentStudents.map((student) => (
                                    <tr key={student.id} className="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                                        <td className="py-3.5 px-4 text-sm font-medium text-slate-900">
                                            {student.first_name} {student.last_name}
                                        </td>
                                        <td className="py-3.5 px-4 text-sm text-slate-600">{student.student_lrn}</td>
                                        <td className="py-3.5 px-4 text-sm text-slate-600">{student.grade_level} - {student.section}</td>
                                        <td className="py-3.5 px-4 text-sm">
                                            <Link to={`/teacher/students/${student.id}`} className="text-teal-600 hover:text-teal-700 font-medium text-xs border border-teal-200 bg-teal-50 px-2.5 py-1 rounded-md">
                                                View Profile
                                            </Link>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={4} className="py-8 text-center text-slate-500 text-sm">
                                            No students registered yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Notifications / Alerts Panel */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                    <h2 className="text-lg font-semibold text-slate-900">Action Needed</h2>

                    <div className="space-y-3">
                        {pendingModules > 0 ? (
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-3">
                                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                <div>
                                    <h3 className="text-sm font-semibold text-amber-800">Pending Forms</h3>
                                    <p className="text-xs text-amber-600 mt-1">You have {pendingModules} module forms pending completion.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start space-x-3">
                                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                                <div>
                                    <h3 className="text-sm font-semibold text-emerald-800">All Caught Up!</h3>
                                    <p className="text-xs text-emerald-600 mt-1">No pending forms at the moment.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TeacherDashboard;
