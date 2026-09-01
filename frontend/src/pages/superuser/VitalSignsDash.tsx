import React from 'react';
import { FilterBar } from '../../components/common/FilterBar';

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

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm min-h-[400px] flex items-center justify-center">
                <p className="text-slate-500 font-medium">Vital Signs charts will be implemented in Phase 3 Backend.</p>
            </div>
        </div>
    );
};

export default VitalSignsDash;
