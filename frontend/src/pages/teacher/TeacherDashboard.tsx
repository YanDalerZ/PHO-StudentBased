import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMockData } from '../../context/MockDataContext';
import { StatCard } from '../../components/common/StatCard';
import {
    Users,
    CheckCircle2,
    Clock,
    AlertCircle,
    ChevronRight,
    UserPlus,
    X
} from 'lucide-react';

// Import your existing registration form component
import RegistrationForm from '../RegistrationForm';

const TeacherDashboard: React.FC = () => {
    const { students = [], moduleStatuses = {} } = useMockData();
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState<boolean>(false);

    // Memoize metric calculations so they only run when students/moduleStatuses change
    const { totalStudents, totalModulesCompleted, pendingModules } = useMemo(() => {
        let completed = 0;
        let pending = 0;

        students.forEach(student => {
            const status = moduleStatuses[student.id || 0];
            if (status) {
                Object.values(status).forEach(modStatus => {
                    if (modStatus === 'Completed') completed++;
                    if (modStatus === 'Pending') pending++;
                });
            }
        });

        return {
            totalStudents: students.length,
            totalModulesCompleted: completed,
            pendingModules: pending
        };
    }, [students, moduleStatuses]);

    // Memoize recent students slicing
    const recentStudents = useMemo(() => {
        return [...students].reverse().slice(0, 4);
    }, [students]);

    // Memoize stats object array creation
    const stats = useMemo(() => [
        {
            id: 1,
            label: 'Total Students',
            value: totalStudents.toString(),
            change: '+2 this month',
            isPositive: true,
            icon: Users,
            iconColor: 'text-emerald-700',
            iconBg: 'bg-emerald-50 border-emerald-100'
        },
        {
            id: 2,
            label: 'Completed Modules',
            value: totalModulesCompleted.toString(),
            change: 'Overall completion',
            isPositive: true,
            icon: CheckCircle2,
            iconColor: 'text-emerald-700',
            iconBg: 'bg-emerald-50 border-emerald-100'
        },
        {
            id: 3,
            label: 'Pending Modules',
            value: pendingModules.toString(),
            change: 'Needs attention',
            isPositive: false,
            icon: Clock,
            iconColor: 'text-amber-700',
            iconBg: 'bg-amber-50 border-amber-100'
        }
    ], [totalStudents, totalModulesCompleted, pendingModules]);

    return (
        <div className="space-y-6 bg-slate-50/50 min-h-screen p-2 md:p-4">
            {/* Welcome Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                    <h1 className="text-2xl font-bold text-black tracking-tight">Teacher Dashboard</h1>
                    <p className="text-sm text-slate-600">Overview of student registrations and module completion.</p>
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
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs lg:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-black">Recent Registrations</h2>
                        <Link to="/teacher/students" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 flex items-center space-x-1">
                            <span>View all</span>
                            <ChevronRight className="w-4 h-4" />
                        </Link>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr>
                                    <th className="py-3 px-4 text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 bg-slate-50/50">Name</th>
                                    <th className="py-3 px-4 text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 bg-slate-50/50">LRN</th>
                                    <th className="py-3 px-4 text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 bg-slate-50/50">Grade</th>
                                    <th className="py-3 px-4 text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 bg-slate-50/50">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentStudents.length > 0 ? recentStudents.map((student) => (
                                    <tr key={student.id} className="hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                                        <td className="py-3.5 px-4 text-sm font-semibold text-black">
                                            {student.first_name} {student.last_name}
                                        </td>
                                        <td className="py-3.5 px-4 text-sm text-slate-800 font-mono">{student.student_lrn}</td>
                                        <td className="py-3.5 px-4 text-sm text-slate-800">{student.grade_level} - {student.section}</td>
                                        <td className="py-3.5 px-4 text-sm">
                                            <Link
                                                to={`/teacher/students/${student.id}`}
                                                className="text-emerald-800 hover:text-emerald-900 font-medium text-xs border border-emerald-200 bg-emerald-50/60 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors inline-block"
                                            >
                                                View Profile
                                            </Link>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={4} className="py-8 text-center text-slate-600 text-sm">
                                            No students registered yet.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Notifications / Alerts Panel */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
                    <h2 className="text-lg font-bold text-black">Action Needed</h2>

                    <div className="space-y-3">
                        {pendingModules > 0 ? (
                            <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl flex items-start space-x-3">
                                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                <div>
                                    <h3 className="text-sm font-bold text-black">Pending Forms</h3>
                                    <p className="text-xs text-slate-700 mt-1">You have {pendingModules} module forms pending completion.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-start space-x-3">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                                <div>
                                    <h3 className="text-sm font-bold text-black">All Caught Up!</h3>
                                    <p className="text-xs text-slate-700 mt-1">No pending forms at the moment.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Registration Form Modal */}
            {isRegisterModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 md:p-6 overflow-y-auto"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col relative overflow-hidden">
                        {/* Header */}
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

                        {/* Form Body */}
                        <div className="p-6 md:p-8 overflow-y-auto flex-1 text-slate-800">
                            <RegistrationForm onClose={() => setIsRegisterModalOpen(false)} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeacherDashboard;