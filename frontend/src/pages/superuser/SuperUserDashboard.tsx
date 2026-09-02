import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Users,
    Calendar,
    AlertTriangle,
    Shield,
    TrendingUp,
    Activity,
    Syringe,
    Stethoscope,
    Brain,
    ChevronRight,
} from 'lucide-react';

export const NurseDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // Dynamically detect current role prefix (e.g., 'superuser' or 'nurse')
    const currentRoleSegment = location.pathname.split('/')[1] || 'superuser';

    const recentStudents = [
        { name: 'Dela Cruz, Juan Miguel', grade: 'Grade 10 - STEM A', date: 'May 27, 2026', status: 'Seen', statusColor: 'bg-emerald-100 text-emerald-700' },
        { name: 'Santos, Maria Angela', grade: 'Grade 9 - STEM B', date: 'May 27, 2026', status: 'Seen', statusColor: 'bg-emerald-100 text-emerald-700' },
        { name: 'Reyes, Christian Paul', grade: 'Grade 8 - A', date: 'May 26, 2026', status: 'Follow-up', statusColor: 'bg-amber-100 text-amber-700' },
        { name: 'Garcia, Alexa Mae', grade: 'Grade 11 - HUMSS A', date: 'May 26, 2026', status: 'Pending', statusColor: 'bg-rose-100 text-rose-700' },
        { name: 'Lim, Nathaniel Kyle', grade: 'Grade 7 - B', date: 'May 25, 2026', status: 'Seen', statusColor: 'bg-emerald-100 text-emerald-700' },
    ];

    const quickAccessModules = [
        {
            title: 'Patient Info',
            subtitle: 'Client Registry',
            desc: 'Manage student profiles and medical history.',
            icon: Users,
            iconBg: 'bg-emerald-50 text-emerald-600',
            btnBg: 'bg-emerald-500 hover:bg-emerald-600',
            route: 'patient-info',
        },
        {
            title: 'Vital Signs',
            subtitle: '',
            desc: 'Record and monitor vital signs.',
            icon: Activity,
            iconBg: 'bg-sky-50 text-sky-500',
            btnBg: 'bg-sky-500 hover:bg-sky-600',
            route: 'vital-signs',
        },
        {
            title: 'Immunization',
            subtitle: '',
            desc: 'Manage immunization records.',
            icon: Syringe,
            iconBg: 'bg-purple-50 text-purple-500',
            btnBg: 'bg-purple-500 hover:bg-purple-600',
            route: 'immunization',
        },
        {
            title: 'Oral Health',
            subtitle: '',
            desc: 'Dental check-up and oral health records.',
            icon: Stethoscope,
            iconBg: 'bg-teal-50 text-teal-500',
            btnBg: 'bg-teal-500 hover:bg-teal-600',
            route: 'oral-health',
        },
        {
            title: 'Mental Health',
            subtitle: '',
            desc: 'Screening, assessment and referrals.',
            icon: Brain,
            iconBg: 'bg-rose-50 text-rose-500',
            btnBg: 'bg-rose-400 hover:bg-rose-500',
            route: 'mental-health',
        },
    ];

    return (
        <div className="min-h-screen bg-slate-50/60 p-2 space-y-4 text-slate-700 font-sans">

            {/* Welcome Banner Header */}
            <div>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h2>
                <p className="text-sm text-slate-500">
                    Welcome back, <span className="font-semibold text-slate-700">Nurse Admin!</span> Here's what's happening today.
                </p>
            </div>

            {/* Top Stat Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Students */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-start">
                    <div>
                        <p className="text-xs font-medium text-slate-500">Total Students</p>
                        <h3 className="text-2xl font-bold text-slate-800 mt-1">1,245</h3>
                        <p className="text-xs text-slate-400 mt-1">Active students</p>
                        <div className="flex items-center gap-1 text-emerald-600 text-xs font-semibold mt-3">
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span>↑ 12 this month</span>
                        </div>
                    </div>
                    <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-500">
                        <Users className="w-6 h-6" />
                    </div>
                </div>

                {/* Today's Appointments */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-start">
                    <div>
                        <p className="text-xs font-medium text-slate-500">Today's Appointments</p>
                        <h3 className="text-2xl font-bold text-slate-800 mt-1">18</h3>
                        <p className="text-xs text-slate-400 mt-1">Scheduled today</p>
                        <button className="text-xs text-sky-500 font-semibold mt-3 hover:underline flex items-center gap-0.5">
                            View all <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div className="p-3 bg-sky-50 rounded-2xl text-sky-500">
                        <Calendar className="w-6 h-6" />
                    </div>
                </div>

                {/* Pending Referrals */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-start">
                    <div>
                        <p className="text-xs font-medium text-slate-500">Pending Referrals</p>
                        <h3 className="text-2xl font-bold text-slate-800 mt-1">7</h3>
                        <p className="text-xs text-slate-400 mt-1">For follow-up</p>
                        <button className="text-xs text-amber-500 font-semibold mt-3 hover:underline flex items-center gap-0.5">
                            View all <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div className="p-3 bg-amber-50 rounded-2xl text-amber-500">
                        <AlertTriangle className="w-6 h-6" />
                    </div>
                </div>

                {/* Immunization Due */}
                <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-start">
                    <div>
                        <p className="text-xs font-medium text-slate-500">Immunization Due</p>
                        <h3 className="text-2xl font-bold text-slate-800 mt-1">23</h3>
                        <p className="text-xs text-slate-400 mt-1">Students</p>
                        <button
                            onClick={() => navigate(`/${currentRoleSegment}/immunization`)}
                            className="text-xs text-purple-500 font-semibold mt-3 hover:underline flex items-center gap-0.5 cursor-pointer"
                        >
                            View all <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-2xl text-purple-500">
                        <Shield className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Middle Grid Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Recent Students Table (5 cols) */}
                <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-slate-800">Recent Students</h3>
                        <button
                            onClick={() => navigate(`/${currentRoleSegment}/patient-info`)}
                            className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                            View all students
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-100 text-[11px] font-semibold text-slate-400">
                                    <th className="pb-2">Name</th>
                                    <th className="pb-2">Grade & Section</th>
                                    <th className="pb-2">Last Visit</th>
                                    <th className="pb-2 text-right">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 text-xs">
                                {recentStudents.map((student, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50">
                                        <td className="py-2.5 font-medium text-slate-700">{student.name}</td>
                                        <td className="py-2.5 text-slate-400">{student.grade}</td>
                                        <td className="py-2.5 text-slate-400">{student.date}</td>
                                        <td className="py-2.5 text-right">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${student.statusColor}`}>
                                                {student.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Health Overview Donut Chart Section (4 cols) */}
                <div className="lg:col-span-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-slate-800">Health Overview</h3>
                        <select className="text-xs text-slate-500 border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none">
                            <option>This Month</option>
                        </select>
                    </div>

                    <div className="flex items-center justify-center my-4">
                        <div className="relative w-44 h-44">
                            {/* CSS Donut Chart Ring */}
                            <div
                                className="w-full h-full rounded-full"
                                style={{
                                    background: `conic-gradient(
                                        #4ade80 0% 65%, 
                                        #38bdf8 65% 82%, 
                                        #fbbf24 82% 94%, 
                                        #f87171 94% 100%
                                    )`,
                                }}
                            />
                            <div className="absolute inset-6 bg-white rounded-full flex flex-col items-center justify-center shadow-inner">
                                <span className="text-xs text-slate-400">Total Records</span>
                                <span className="text-xl font-bold text-slate-800">1,245</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-slate-600">
                                <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Normal
                            </span>
                            <span className="font-semibold text-slate-700">820 (65%)</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-slate-600">
                                <span className="w-2 h-2 rounded-full bg-sky-400"></span> For Monitoring
                            </span>
                            <span className="font-semibold text-slate-700">210 (17%)</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-slate-600">
                                <span className="w-2 h-2 rounded-full bg-amber-400"></span> Needs Follow-up
                            </span>
                            <span className="font-semibold text-slate-700">150 (12%)</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-slate-600">
                                <span className="w-2 h-2 rounded-full bg-rose-400"></span> Referred
                            </span>
                            <span className="font-semibold text-slate-700">65 (6%)</span>
                        </div>
                    </div>
                </div>

                {/* Upcoming Activities (3 cols) */}
                <div className="lg:col-span-3 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="font-bold text-slate-800 mb-4">Upcoming Activities</h3>
                        <div className="space-y-3">
                            <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 flex items-start gap-3">
                                <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg mt-0.5">
                                    <Stethoscope className="w-4 h-4" />
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold text-slate-800">Dental Check-up</h4>
                                    <p className="text-[11px] text-slate-400">May 30, 2026 • 8:00 AM</p>
                                    <p className="text-[11px] text-slate-500">Grade 7 & 8 Students</p>
                                </div>
                            </div>

                            <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100 flex items-start gap-3">
                                <div className="p-2 bg-purple-100 text-purple-600 rounded-lg mt-0.5">
                                    <Syringe className="w-4 h-4" />
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold text-slate-800">Immunization Day</h4>
                                    <p className="text-[11px] text-slate-400">June 02, 2026 • 8:00 AM</p>
                                    <p className="text-[11px] text-slate-500">HPV Vaccination</p>
                                </div>
                            </div>

                            <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-100 flex items-start gap-3">
                                <div className="p-2 bg-rose-100 text-rose-500 rounded-lg mt-0.5">
                                    <Brain className="w-4 h-4" />
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold text-slate-800">Mental Health Webinar</h4>
                                    <p className="text-[11px] text-slate-400">June 05, 2026 • 1:00 PM</p>
                                    <p className="text-[11px] text-slate-500">All Students</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button className="text-xs text-sky-500 font-semibold mt-4 hover:underline flex items-center justify-between w-full cursor-pointer">
                        <span>View all activities</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Bottom Row Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Quick Access Modules (9 cols) */}
                <div className="lg:col-span-9 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4">Quick Access Modules</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        {quickAccessModules.map((item, idx) => {
                            const IconComponent = item.icon;
                            return (
                                <div key={idx} className="border border-slate-100 rounded-xl p-3 flex flex-col justify-between items-center text-center bg-slate-50/30 hover:shadow-sm transition-all">
                                    <div className={`p-3 rounded-2xl mb-2 ${item.iconBg}`}>
                                        <IconComponent className="w-6 h-6" />
                                    </div>
                                    <h4 className="text-xs font-bold text-slate-800 leading-tight">{item.title}</h4>
                                    {item.subtitle && <p className="text-[10px] font-semibold text-slate-400 leading-tight">{item.subtitle}</p>}
                                    <p className="text-[10px] text-slate-400 mt-1 mb-3 leading-tight min-h-[28px]">{item.desc}</p>
                                    <button
                                        type="button"
                                        onClick={() => navigate(`/${currentRoleSegment}/${item.route}`)}
                                        className={`w-full text-white text-[10px] font-medium py-1.5 px-2 rounded-lg transition-colors cursor-pointer ${item.btnBg}`}
                                    >
                                        Go to Module
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Alerts & Reminders (3 cols) */}
                <div className="lg:col-span-3 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="font-bold text-slate-800 mb-4">Alerts & Reminders</h3>
                        <div className="space-y-3 text-xs">
                            <div className="p-3 bg-rose-50/50 rounded-xl border border-rose-100 flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                                    <p className="text-slate-600 text-[11px]">
                                        <span className="font-bold text-slate-800">23 students</span> have pending immunization.
                                    </p>
                                </div>
                                <button
                                    onClick={() => navigate(`/${currentRoleSegment}/immunization`)}
                                    className="text-[11px] text-sky-500 hover:underline font-semibold shrink-0 cursor-pointer"
                                >
                                    View
                                </button>
                            </div>

                            <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100 flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                                    <p className="text-slate-600 text-[11px]">
                                        <span className="font-bold text-slate-800">7 referrals</span> for follow-up consultation.
                                    </p>
                                </div>
                                <button
                                    onClick={() => navigate(`/${currentRoleSegment}/patient-info`)}
                                    className="text-[11px] text-sky-500 hover:underline font-semibold shrink-0 cursor-pointer"
                                >
                                    View
                                </button>
                            </div>

                            <div className="p-3 bg-sky-50/50 rounded-xl border border-sky-100 flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2">
                                    <Activity className="w-4 h-4 text-sky-500 mt-0.5 shrink-0" />
                                    <p className="text-slate-600 text-[11px]">
                                        <span className="font-bold text-slate-800">18 students</span> need vital signs monitoring.
                                    </p>
                                </div>
                                <button
                                    onClick={() => navigate(`/${currentRoleSegment}/vital-signs`)}
                                    className="text-[11px] text-sky-500 hover:underline font-semibold shrink-0 cursor-pointer"
                                >
                                    View
                                </button>
                            </div>
                        </div>
                    </div>

                    <button className="text-xs text-sky-500 font-semibold mt-4 hover:underline flex items-center justify-between w-full cursor-pointer">
                        <span>View all alerts</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-4 border-t border-slate-200">
                <p>© 2026 School-Based HEALTHCARE SERVICES. All rights reserved.</p>
                <p>Version 1.0.0</p>
            </div>
        </div>
    );
};

export default NurseDashboard;