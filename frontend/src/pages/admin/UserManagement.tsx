import React from 'react';
import { DataTable } from '../../components/common/DataTable';
import { UserPlus } from 'lucide-react';

const UserManagement: React.FC = () => {
    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">User Management</h1>
                    <p className="text-sm text-slate-500">Add, edit, and manage system users and roles.</p>
                </div>
                <button className="px-4 py-2.5 bg-linear-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 text-white font-medium text-sm rounded-xl shadow-md transition-all self-start md:self-auto flex items-center space-x-2">
                    <UserPlus className="w-4 h-4" />
                    <span>Create User</span>
                </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <DataTable 
                    data={[]}
                    columns={[
                        { header: 'Name', accessorKey: 'name' as any },
                        { header: 'Email', accessorKey: 'email' as any },
                        { header: 'Role', accessorKey: 'role' as any },
                        { header: 'Status', accessorKey: 'status' as any },
                        { header: 'Actions', accessorKey: 'actions' as any }
                    ]}
                    isLoading={false}
                />
            </div>
        </div>
    );
};

export default UserManagement;
