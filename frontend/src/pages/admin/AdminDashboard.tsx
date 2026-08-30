import React from 'react';
import { StatCard } from '../../components/common/StatCard';
import { Settings, Users, Building2, ShieldCheck } from 'lucide-react';

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

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm min-h-[400px] flex items-center justify-center">
                <p className="text-slate-500 font-medium">System activity feed will be implemented in Phase 4 Backend.</p>
            </div>
        </div>
    );
};

export default AdminDashboard;
