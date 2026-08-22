import React, { useState } from 'react';
import {
    LayoutDashboard,
    User,
    FileText,
    Calendar,
    Settings,
    LogOut,
    Search,
    Bell,
    HeartPulse,
    Activity,
    Clock,
    CheckCircle2,
    AlertCircle,
    ChevronRight
} from 'lucide-react';
import '../../assets/css/UserDashboard.css';

interface QuickStat {
    id: number;
    label: string;
    value: string;
    change: string;
    isPositive: boolean;
    icon: React.ElementType;
    iconColor: string;
    iconBg: string;
}

interface ActivityItem {
    id: number;
    title: string;
    category: string;
    date: string;
    status: 'Completed' | 'Pending' | 'Action Required';
}

const Dashboard: React.FC = () => {
    const [searchQuery, setSearchQuery] = useState('');

    const stats: QuickStat[] = [
        {
            id: 1,
            label: 'Health Clearance',
            value: 'Approved',
            change: 'Valid until 2027',
            isPositive: true,
            icon: HeartPulse,
            iconColor: 'text-teal-400',
            iconBg: 'bg-teal-500/10 border-teal-500/20'
        },
        {
            id: 2,
            label: 'Active Requests',
            value: '02',
            change: '+1 pending review',
            isPositive: true,
            icon: Activity,
            iconColor: 'text-blue-400',
            iconBg: 'bg-blue-500/10 border-blue-500/20'
        },
        {
            id: 3,
            label: 'Completed Submissions',
            value: '14',
            change: '100% completion rate',
            isPositive: true,
            icon: CheckCircle2,
            iconColor: 'text-emerald-400',
            iconBg: 'bg-emerald-500/10 border-emerald-500/20'
        },
        {
            id: 4,
            label: 'Upcoming Appointments',
            value: '01',
            change: 'Next: Tomorrow, 10 AM',
            isPositive: false,
            icon: Clock,
            iconColor: 'text-amber-400',
            iconBg: 'bg-amber-500/10 border-amber-500/20'
        }
    ];

    const recentActivities: ActivityItem[] = [
        {
            id: 101,
            title: 'Annual Physical Examination Form',
            category: 'Medical Compliance',
            date: 'Aug 20, 2026',
            status: 'Completed'
        },
        {
            id: 102,
            title: 'Blood Test Results Verification',
            category: 'Laboratory',
            date: 'Aug 18, 2026',
            status: 'Completed'
        },
        {
            id: 103,
            title: 'Dental Health Clearance Request',
            category: 'Services',
            date: 'Aug 15, 2026',
            status: 'Pending'
        },
        {
            id: 104,
            title: 'Update Emergency Contact Details',
            category: 'Account',
            date: 'Aug 10, 2026',
            status: 'Action Required'
        }
    ];

    const getStatusBadge = (status: ActivityItem['status']) => {
        switch (status) {
            case 'Completed':
                return <span className="status-badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Completed</span>;
            case 'Pending':
                return <span className="status-badge bg-amber-500/10 text-amber-400 border border-amber-500/20">Pending</span>;
            case 'Action Required':
                return <span className="status-badge bg-rose-500/10 text-rose-400 border border-rose-500/20">Action Required</span>;
        }
    };

    return (
        <div className="dashboard-container">
            {/* Sidebar */}
            <aside className="sidebar">
                <div className="space-y-6">
                    <div className="sidebar-brand">
                        <HeartPulse className="w-7 h-7 text-teal-400" />
                        <span>PHO Portal</span>
                    </div>

                    <nav className="space-y-1.5">
                        <a href="#dashboard" className="nav-link-active">
                            <LayoutDashboard className="w-5 h-5" />
                            <span>Dashboard</span>
                        </a>
                        <a href="#profile" className="nav-link">
                            <User className="w-5 h-5" />
                            <span>Profile</span>
                        </a>
                        <a href="#records" className="nav-link">
                            <FileText className="w-5 h-5" />
                            <span>Records & Forms</span>
                        </a>
                        <a href="#appointments" className="nav-link">
                            <Calendar className="w-5 h-5" />
                            <span>Appointments</span>
                        </a>
                        <a href="#settings" className="nav-link">
                            <Settings className="w-5 h-5" />
                            <span>Settings</span>
                        </a>
                    </nav>
                </div>

                {/* Sidebar Footer User Profile */}
                <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-full bg-teal-500/20 border border-teal-500/30 flex items-center justify-center font-bold text-teal-300 text-sm">
                            JD
                        </div>
                        <div className="text-xs">
                            <p className="font-semibold text-white">John Doe</p>
                            <p className="text-slate-400">Student ID: 2026-9081</p>
                        </div>
                    </div>
                    <button className="text-slate-400 hover:text-rose-400 transition-colors" title="Log out">
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="main-wrapper">
                {/* Top Header */}
                <header className="top-bar">
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search records, appointments..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="search-input"
                        />
                    </div>

                    <div className="flex items-center space-x-4">
                        <button className="relative p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-300 hover:text-white transition-all">
                            <Bell className="w-5 h-5" />
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                        </button>
                    </div>
                </header>

                {/* Dashboard Content */}
                <main className="dashboard-content">
                    {/* Welcome Section */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-white tracking-tight">Welcome back, John!</h1>
                            <p className="text-sm text-slate-400">Here is a quick overview of your health portal metrics and records.</p>
                        </div>
                        <button className="px-4 py-2.5 bg-linear-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 text-white font-medium text-sm rounded-xl shadow-md transition-all self-start md:self-auto">
                            + New Service Request
                        </button>
                    </div>

                    {/* Quick Metrics Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {stats.map((stat) => {
                            const IconComponent = stat.icon;
                            return (
                                <div key={stat.id} className="stat-card">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-slate-400">{stat.label}</span>
                                        <div className={`stat-icon-wrapper ${stat.iconBg}`}>
                                            <IconComponent className={`w-5 h-5 ${stat.iconColor}`} />
                                        </div>
                                    </div>
                                    <div className="mt-4">
                                        <span className="text-2xl font-bold text-white tracking-tight">{stat.value}</span>
                                        <p className="text-xs text-slate-400 mt-1">{stat.change}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Activity & Quick Actions Split */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Recent Submissions / Activity Table */}
                        <div className="content-card lg:col-span-2">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-white">Recent Activities</h2>
                                <a href="#all" className="text-xs text-teal-400 hover:underline flex items-center space-x-1">
                                    <span>View all</span>
                                    <ChevronRight className="w-3 h-3" />
                                </a>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr>
                                            <th className="table-header">Title</th>
                                            <th className="table-header">Category</th>
                                            <th className="table-header">Date</th>
                                            <th className="table-header">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentActivities.map((item) => (
                                            <tr key={item.id} className="hover:bg-slate-800/30 transition-colors">
                                                <td className="table-cell font-medium text-white">{item.title}</td>
                                                <td className="table-cell">{item.category}</td>
                                                <td className="table-cell text-slate-400">{item.date}</td>
                                                <td className="table-cell">{getStatusBadge(item.status)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Notifications / Alerts Panel */}
                        <div className="content-card space-y-4">
                            <h2 className="text-lg font-semibold text-white">Attention Required</h2>

                            <div className="space-y-3">
                                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start space-x-3">
                                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                                    <div>
                                        <h3 className="text-xs font-semibold text-rose-300">Emergency Contact Outdated</h3>
                                        <p className="text-xs text-slate-400 mt-0.5">Please review and confirm your emergency contact information.</p>
                                    </div>
                                </div>

                                <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start space-x-3">
                                    <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                                    <div>
                                        <h3 className="text-xs font-semibold text-amber-300">Dental Exam Reminder</h3>
                                        <p className="text-xs text-slate-400 mt-0.5">Scheduled for Aug 23 at 10:00 AM at Campus Clinic.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default Dashboard;