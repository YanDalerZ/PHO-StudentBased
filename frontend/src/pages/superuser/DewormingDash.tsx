import React from 'react';
import { FilterBar } from '../../components/common/FilterBar';
import { StatCard } from '../../components/common/StatCard';
import { CheckCircle2, Target } from 'lucide-react';
import { ProgressRing } from '../../components/charts/ProgressRing';
import { BarChart } from '../../components/charts/BarChart';
import { DonutChart } from '../../components/charts/DonutChart';
import { mockDewormingAccomplishment, mockDewormingAgeGroup, mockDewormingConsent } from '../../utils/mockChartData';

const DewormingDash: React.FC = () => {
    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Deworming Dashboard</h1>
                    <p className="text-sm text-slate-500">Analytics for deworming administration records.</p>
                </div>
            </div>

            <FilterBar onFilterChange={() => {}} className="mb-6" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StatCard 
                    title="Total Dewormed"
                    value="15,240"
                    icon={CheckCircle2}
                    iconBgClass="bg-teal-100 border-teal-200"
                    iconColorClass="text-teal-600"
                />
                <StatCard 
                    title="Target Population"
                    value="20,320"
                    icon={Target}
                    iconBgClass="bg-indigo-100 border-indigo-200"
                    iconColorClass="text-indigo-600"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1">
                    <ProgressRing 
                        title="Province-wide Accomplishment" 
                        data={mockDewormingAccomplishment} 
                    />
                </div>
                <div className="lg:col-span-2">
                    <BarChart 
                        title="Deworming by Age Group (Male)" 
                        data={mockDewormingAgeGroup} 
                        dataKey="Male" 
                        colors={['#3b82f6']}
                    />
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <DonutChart 
                    title="Public vs Private Schools" 
                    data={mockDewormingConsent} 
                />
            </div>
        </div>
    );
};

export default DewormingDash;
