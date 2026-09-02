import React from 'react';
import { FilterBar } from '../../components/common/FilterBar';
import { StatCard } from '../../components/common/StatCard';
import { Users, FileText, CheckCircle2, TrendingUp } from 'lucide-react';
import { LineChart } from '../../components/charts/LineChart';
import { BarChart } from '../../components/charts/BarChart';
import { mockMonthlyRegistrations, mockRegistrationByMunicipality } from '../../utils/mockChartData';

const SuperUserDashboard: React.FC = () => {
    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Super User Dashboard</h1>
                    <p className="text-sm text-slate-500">Provincial health overview and module completion tracking.</p>
                </div>
            </div>

            <FilterBar onFilterChange={() => {}} className="mb-6" />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard 
                    title="Total Enrolled Students"
                    value="0"
                    icon={Users}
                    iconBgClass="bg-blue-100 border-blue-200"
                    iconColorClass="text-blue-600"
                />
                <StatCard 
                    title="Health Records Processed"
                    value="0"
                    icon={FileText}
                    iconBgClass="bg-teal-100 border-teal-200"
                    iconColorClass="text-teal-600"
                />
                <StatCard 
                    title="Fully Compliant Schools"
                    value="0"
                    icon={CheckCircle2}
                    iconBgClass="bg-emerald-100 border-emerald-200"
                    iconColorClass="text-emerald-600"
                />
                <StatCard 
                    title="Overall Completion Rate"
                    value="0%"
                    icon={TrendingUp}
                    iconBgClass="bg-indigo-100 border-indigo-200"
                    iconColorClass="text-indigo-600"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <LineChart 
                    title="Monthly Student Registrations" 
                    data={mockMonthlyRegistrations} 
                    dataKey="count" 
                />
                <BarChart 
                    title="Registrations by Municipality" 
                    data={mockRegistrationByMunicipality} 
                    dataKey="students" 
                />
            </div>
        </div>
    );
};

export default SuperUserDashboard;
