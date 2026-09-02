import React from 'react';
import { FilterBar } from '../../components/common/FilterBar';
import { StatCard } from '../../components/common/StatCard';
import { Syringe, AlertTriangle } from 'lucide-react';
import { BarChart } from '../../components/charts/BarChart';
import { DonutChart } from '../../components/charts/DonutChart';
import { mockImmunizationVaccineTypes, mockImmunizationRefusalReasons } from '../../utils/mockChartData';

const ImmunizationDash: React.FC = () => {
    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Immunization Dashboard</h1>
                    <p className="text-sm text-slate-500">Analytics for vaccination records and refusal tracking.</p>
                </div>
            </div>

            <FilterBar onFilterChange={() => {}} className="mb-6" />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard 
                    title="Total MR Vaccinated"
                    value="2,500"
                    icon={Syringe}
                    iconBgClass="bg-teal-100 border-teal-200"
                    iconColorClass="text-teal-600"
                />
                <StatCard 
                    title="Total Td Vaccinated"
                    value="2,300"
                    icon={Syringe}
                    iconBgClass="bg-blue-100 border-blue-200"
                    iconColorClass="text-blue-600"
                />
                <StatCard 
                    title="Total HPV1 Vaccinated"
                    value="1,100"
                    icon={Syringe}
                    iconBgClass="bg-purple-100 border-purple-200"
                    iconColorClass="text-purple-600"
                />
                <StatCard 
                    title="Total Refusals"
                    value="300"
                    icon={AlertTriangle}
                    iconBgClass="bg-red-100 border-red-200"
                    iconColorClass="text-red-600"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <BarChart 
                    title="Vaccines Administered by Type" 
                    data={mockImmunizationVaccineTypes} 
                    dataKey="count" 
                    colors={['#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899']}
                />
                <DonutChart 
                    title="Reasons for Refusal" 
                    data={mockImmunizationRefusalReasons} 
                />
            </div>
        </div>
    );
};

export default ImmunizationDash;
