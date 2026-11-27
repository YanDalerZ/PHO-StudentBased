import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { StatCard } from '../../components/common/StatCard';
import {
    Users,
    CheckCircle2,
    Clock,
    ChevronRight,
    UserPlus,
    X,
    Loader2
} from 'lucide-react';
import { getStudentDashboard } from '../../services/api';
import type { StudentDashboardSummary } from '../../types';
import RegistrationForm from '../RegistrationForm';
import { useAuth } from '../../contexts/AuthContext';
import { hasModulePermission } from '../../lib/access';

const TeacherDashboard: React.FC = () => {
    const { effectiveAccess } = useAuth();
    const canCreateStudent = hasModulePermission(effectiveAccess, 'patient-info', 'can_create');
    const [summary, setSummary] = useState<StudentDashboardSummary | null>(null);
    const requests = useRef({ version: 0 });
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState<boolean>(false);

    const fetchDashboardData = useCallback(async () => {
        const version = ++requests.current.version;
        setLoading(true);
        try {
            const data = await getStudentDashboard();
            if (version !== requests.current.version) return;
            setSummary(data);
            setError(null);
        } catch (err: unknown) {
            if (version !== requests.current.version) return;
            console.error('Failed to load teacher dashboard students:', err);
            setSummary(null);
            setError('Unable to load student data. Please check your connection.');
        } finally {
            if (version === requests.current.version) setLoading(false);
        }
    }, []);

    useEffect(() => {
        const requestState = requests.current;
        const refresh = () => { if (!document.hidden) void fetchDashboardData(); };
        const storage = (event: StorageEvent) => {
            if (event.key === 'pho:student-records-changed') refresh();
        };
        const initialRefresh = window.setTimeout(() => void fetchDashboardData(), 0);
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        window.addEventListener('pho:student-records-changed', refresh);
        window.addEventListener('storage', storage);
        return () => {
            window.clearTimeout(initialRefresh);
            requestState.version++;
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
            window.removeEventListener('pho:student-records-changed', refresh);
            window.removeEventListener('storage', storage);
        };
    }, [fetchDashboardData, effectiveAccess]);

    const totalStudents = summary?.total_students ?? 0;
    const totalModulesCompleted = summary?.completed ?? 0;
    const pendingModules = summary?.pending ?? 0;
    const recentStudents = summary?.recent_students ?? [];

    const stats = useMemo(() => [
        {
            id: 1,
            label: 'Total Students',
            value: totalStudents.toString(),
            change: `${totalStudents} registered`,
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
                    <h1 className="text-2xl font-bold text-black tracking-tight">School Nurse Dashboard</h1>
                    <p className="text-sm text-slate-600">Overview of student registrations and module completion.</p>
                </div>
                {canCreateStudent && <button
                    type="button"
                    onClick={() => setIsRegisterModalOpen(true)}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm rounded-xl shadow-xs transition-colors self-start md:self-auto flex items-center space-x-2 cursor-pointer"
                >
                    <UserPlus className="w-4 h-4" />
                    <span>Register Student</span>
                </button>}
            </div>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center justify-between">
                    <span>{error}</span>
                    <button
                        onClick={fetchDashboardData}
                        className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy={loading}>
                {stats.map((stat) => (
                    <StatCard
                        key={stat.id}
                        title={stat.label}
                        value={loading ? 'Loading…' : error ? 'Unavailable' : stat.value}
                        icon={stat.icon}
                        subtitle={loading ? 'Loading saved form counts' : error ? 'Please retry' : stat.change}
                        iconBgClass={stat.iconBg}
                        iconColorClass={stat.iconColor}
                    />
                ))}
            </div>
            {!loading && !error && <p className="text-xs text-slate-600">
                {summary?.applicable_modules.length ?? 0} enabled modules you can view · {summary?.applicable_pairs ?? 0} applicable student–module pairs.
                {' '}Disabled modules are excluded.
            </p>}

            <section aria-labelledby="recent-registrations-heading" className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                    <h2 id="recent-registrations-heading" className="text-lg font-bold text-black">Recent Registrations</h2>
                    <Link to="/teacher/students" className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 flex items-center space-x-1">
                        <span>View all</span>
                        <ChevronRight className="w-4 h-4" />
                    </Link>
                </div>

                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="py-12 flex flex-col items-center justify-center space-y-2">
                            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                            <span className="text-xs text-slate-500">Loading student records...</span>
                        </div>
                    ) : error ? <p className="py-8 text-sm text-slate-600">Student records are unavailable.</p> : (
                        <table className="w-full text-left">
                            <thead>
                                <tr>
                                    <th className="py-3 px-4 text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 bg-slate-50/50">Name</th>
                                    <th className="py-3 px-4 text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 bg-slate-50/50">LRN</th>
                                    <th className="py-3 px-4 text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200 bg-slate-50/50">Grade & Section</th>
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
                                        <td className="py-3.5 px-4 text-sm text-slate-800">
                                            {student.grade_level} {student.section ? `- ${student.section}` : ''}
                                        </td>
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
                                            {canCreateStudent
                                                ? 'No students registered yet. Click "Register Student" to begin.'
                                                : 'No students are available in your current scope.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>

            {/* Registration Form Modal */}
            {canCreateStudent && isRegisterModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 md:p-6 overflow-y-auto"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col relative overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sticky top-0 bg-white z-20 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="h-2 w-2 rounded-full bg-emerald-600"></div>
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
                            <RegistrationForm
                                onClose={() => setIsRegisterModalOpen(false)}
                                onSuccess={() => {
                                    setIsRegisterModalOpen(false);
                                    fetchDashboardData();
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeacherDashboard;
