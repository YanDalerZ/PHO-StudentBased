import React from 'react';
import { FilterBar } from '../../components/common/FilterBar';
import { StatCard } from '../../components/common/StatCard';
import { Activity, HeartPulse } from 'lucide-react';
import { ProgressRing } from '../../components/charts/ProgressRing';
import { DonutChart } from '../../components/charts/DonutChart';
import { BarChart } from '../../components/charts/BarChart';
import { mockVitalSignsBMI, mockVitalSignsBP, mockVitalSignsScreeningCoverage } from '../../utils/mockChartData';

const VitalSignsDash: React.FC = () => {
    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Vital Signs Dashboard</h1>
                    <p className="text-sm text-slate-500">Analytics for basic health screening and vital signs tracking.</p>
                </div>
            </div>

            <FilterBar onFilterChange={() => {}} className="mb-6" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <StatCard 
                    title="Total Screenings"
                    value="4,050"
                    icon={Activity}
                    iconBgClass="bg-indigo-100 border-indigo-200"
                    iconColorClass="text-indigo-600"
                />
                <StatCard 
                    title="High BP Alerts"
                    value="81"
                    icon={HeartPulse}
                    iconBgClass="bg-red-100 border-red-200"
                    iconColorClass="text-red-600"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1">
                    <ProgressRing 
                        title="Screening Coverage" 
                        data={mockVitalSignsScreeningCoverage} 
                    />
                </div>
                <div className="lg:col-span-2">
                    <BarChart 
                        title="Blood Pressure Distribution" 
                        data={mockVitalSignsBP} 
                        dataKey="value" 
                        colors={['#ef4444']}
                    />
                </div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <DonutChart 
                    title="Nutritional Status / BMI" 
                    data={mockVitalSignsBMI} 
                    colors={['#f59e0b', '#10b981', '#f97316', '#ef4444']}
                />
            </div>
        </div>
    );
};

export default VitalSignsDash;
