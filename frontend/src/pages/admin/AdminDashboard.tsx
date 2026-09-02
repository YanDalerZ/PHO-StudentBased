import React from 'react';
import { StatCard } from '../../components/common/StatCard';
import { Settings, Users, Building2, ShieldCheck, History } from 'lucide-react';
import { ActivityFeed } from '../../components/common/ActivityFeed';
import { mockActivityFeed } from '../../utils/mockAdminData';

const AdminDashboard: React.FC = () => {
    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System Administration</h1>
                    <p className="text-sm text-slate-500">Manage users, schools, and system configurations.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard 
                    title="Active Users"
                    value="0"
                    icon={Users}
                    iconBgClass="bg-blue-100 border-blue-200"
                    iconColorClass="text-blue-600"
                />
                <StatCard 
                    title="Registered Schools"
                    value="0"
                    icon={Building2}
                    iconBgClass="bg-teal-100 border-teal-200"
                    iconColorClass="text-teal-600"
                />
                <StatCard 
                    title="System Health"
                    value="100%"
                    icon={ShieldCheck}
                    iconBgClass="bg-emerald-100 border-emerald-200"
                    iconColorClass="text-emerald-600"
                />
                <StatCard 
                    title="Active Modules"
                    value="5"
                    icon={Settings}
                    iconBgClass="bg-indigo-100 border-indigo-200"
                    iconColorClass="text-indigo-600"
                />
            </div>

            <div className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm mt-8">
                <div className="flex items-center space-x-2 mb-8 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <History className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">System Activity Feed</h2>
                </div>
                
                <ActivityFeed activities={mockActivityFeed} />

                <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
                    <button className="text-sm font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors">
                        View Full Audit Log &rarr;
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
