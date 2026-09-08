import React from 'react';
import { DataTable } from '../../components/common/DataTable';
import { Building2 } from 'lucide-react';

interface SchoolTableRow {
    id: number | string;
    name: string;
    municipality: string;
    barangay: string;
    actions?: string;
}

const SchoolManagement: React.FC = () => {
    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">School Management</h1>
                    <p className="text-sm text-slate-500">Manage registered schools and geographic assignments.</p>
                </div>
                <button className="px-4 py-2.5 bg-linear-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 text-white font-medium text-sm rounded-xl shadow-md transition-all self-start md:self-auto flex items-center space-x-2">
                    <Building2 className="w-4 h-4" />
                    <span>Add School</span>
                </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <DataTable<SchoolTableRow> 
                    data={[]}
                    columns={[
                        { header: 'School ID', accessorKey: 'id' },
                        { header: 'Name', accessorKey: 'name' },
                        { header: 'Municipality', accessorKey: 'municipality' },
                        { header: 'Barangay', accessorKey: 'barangay' },
                        { header: 'Actions', accessorKey: 'actions' }
                    ]}
                    isLoading={false}
                />
            </div>
        </div>
    );
};

export default SchoolManagement;
