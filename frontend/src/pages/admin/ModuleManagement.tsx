import React, { useState } from 'react';
import { DataTable } from '../../components/common/DataTable';
import { toast } from 'react-hot-toast';

interface PHOModule {
    id: number;
    slug: string;
    name: string;
    description: string;
    is_active: boolean;
}

const initialModules: PHOModule[] = [
    { id: 1, slug: 'patient-info', name: 'Patient Information', description: 'Core demographics and medical history', is_active: true },
    { id: 2, slug: 'oral-health', name: 'Oral Health', description: 'Dental examination and DMFT indexing', is_active: true },
    { id: 3, slug: 'deworming', name: 'Deworming', description: 'Mass drug administration records', is_active: true },
    { id: 4, slug: 'headss', name: 'HEADSS Assessment', description: 'Adolescent psychosocial health screening', is_active: true },
    { id: 5, slug: 'immunization', name: 'Immunization', description: 'School-based vaccination program', is_active: true },
];

const ModuleManagement: React.FC = () => {
    const [modules, setModules] = useState<PHOModule[]>(initialModules);

    const toggleModule = (id: number) => {
        setModules(prev => prev.map(m => {
            if (m.id === id) {
                const newState = !m.is_active;
                toast.success(`${m.name} is now ${newState ? 'Active' : 'Inactive'}`, {
                    style: {
                        background: newState ? '#e0f2f1' : '#f1f5f9',
                        color: newState ? '#004d40' : '#475569',
                        border: newState ? '1px solid #14b8a6' : '1px solid #cbd5e1'
                    }
                });
                return { ...m, is_active: newState };
            }
            return m;
        }));
    };

    const columns = [
        {
            header: 'Module Name',
            accessorKey: 'name' as keyof PHOModule,
            className: 'font-semibold text-slate-900 dark:text-white w-1/4'
        },
        {
            header: 'Description',
            accessorKey: 'description' as keyof PHOModule,
            className: 'text-sm text-slate-500 dark:text-slate-400 w-2/4'
        },
        {
            header: 'Status',
            cell: (row: PHOModule) => (
                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => toggleModule(row.id)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                            row.is_active ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-700'
                        }`}
                    >
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                row.is_active ? 'translate-x-6' : 'translate-x-1'
                            }`}
                        />
                    </button>
                    <span className={`text-xs font-medium ${row.is_active ? 'text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-500'}`}>
                        {row.is_active ? 'Active' : 'Inactive'}
                    </span>
                </div>
            ),
            className: 'w-1/4'
        }
    ];

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Module Configuration</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Manage health modules, update descriptions, and toggle availability across the province.</p>
                </div>
            </div>

            <div className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm">
                <DataTable 
                    data={modules}
                    columns={columns}
                />
            </div>
        </div>
    );
};

export default ModuleManagement;
