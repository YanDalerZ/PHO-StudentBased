import React, { useState, useEffect } from 'react';
import { UserPlus, Pencil, Trash2, X } from 'lucide-react';

interface User {
    id: number;
    firstname: string;
    lastname: string;
    email: string;
    role: string;
    status: string;
    created_by: string;
    created_at: string;
}

const UserManagement: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    const [formData, setFormData] = useState({
        firstname: '',
        lastname: '',
        email: '',
        password: '',
        role: 'user',
        status: 'active',
    });

    const API_URL = 'http://localhost:3000/api/users';

    // FETCH USERS
    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(API_URL);
            const result = await res.json();
            if (result.success) setUsers(result.data);
        } catch (error) {
            console.error('Failed to fetch users:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    // HANDLE FORM SUBMIT (CREATE / EDIT)
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const method = editingUser ? 'PUT' : 'POST';
            const endpoint = editingUser ? `${API_URL}/${editingUser.id}` : API_URL;

            const res = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const result = await res.json();
            if (result.success) {
                closeModal();
                fetchUsers();
            } else {
                alert(result.message || 'Operation failed');
            }
        } catch (error) {
            console.error('Error saving user:', error);
        }
    };

    // DELETE USER
    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this user?')) return;
        try {
            const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
            const result = await res.json();
            if (result.success) fetchUsers();
        } catch (error) {
            console.error('Failed to delete user:', error);
        }
    };

    const openCreateModal = () => {
        setEditingUser(null);
        setFormData({ firstname: '', lastname: '', email: '', password: '', role: 'user', status: 'active' });
        setIsModalOpen(true);
    };

    const openEditModal = (user: User) => {
        setEditingUser(user);
        setFormData({
            firstname: user.firstname,
            lastname: user.lastname,
            email: user.email,
            password: '', // Blank unless changing
            role: user.role,
            status: user.status,
        });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingUser(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">User Management</h1>
                    <p className="text-sm text-slate-500">Add, edit, and manage system users and roles.</p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="px-4 py-2.5 bg-gradient-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 text-white font-medium text-sm rounded-xl shadow-md transition-all self-start md:self-auto flex items-center space-x-2 cursor-pointer"
                >
                    <UserPlus className="w-4 h-4" />
                    <span>Create User</span>
                </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th className="px-6 py-3.5">Name</th>
                                <th className="px-6 py-3.5">Email</th>
                                <th className="px-6 py-3.5">Role</th>
                                <th className="px-6 py-3.5">Status</th>
                                <th className="px-6 py-3.5">Created By</th>
                                <th className="px-6 py-3.5">Date Created</th>
                                <th className="px-6 py-3.5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 text-sm">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                                        Loading users...
                                    </td>
                                </tr>
                            ) : users.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                                        No users found.
                                    </td>
                                </tr>
                            ) : (
                                users.map((user) => (
                                    <tr key={user.id} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="px-6 py-4 font-medium text-slate-900">
                                            {`${user.firstname} ${user.lastname}`}
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">{user.email}</td>
                                        <td className="px-6 py-4">
                                            <span className="capitalize px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={`capitalize px-2.5 py-1 rounded-full text-xs font-semibold ${user.status === 'active'
                                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                    }`}
                                            >
                                                {user.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-slate-600">{user.created_by}</td>
                                        <td className="px-6 py-4 text-slate-600">
                                            {new Date(user.created_at).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end space-x-2">
                                                <button
                                                    onClick={() => openEditModal(user)}
                                                    className="p-1.5 text-slate-600 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(user.id)}
                                                    className="p-1.5 text-slate-600 hover:text-red-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* CREATE / EDIT MODAL */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 space-y-4">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                            <h2 className="text-lg font-bold text-slate-800">
                                {editingUser ? 'Edit User' : 'Create New User'}
                            </h2>
                            <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium text-slate-600">First Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.firstname}
                                        onChange={(e) => setFormData({ ...formData, firstname: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-600">Last Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.lastname}
                                        onChange={(e) => setFormData({ ...formData, lastname: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-slate-600">Email Address</label>
                                <input
                                    type="email"
                                    required
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>

                            {!editingUser && (
                                <div>
                                    <label className="text-xs font-medium text-slate-600">Password</label>
                                    <input
                                        type="password"
                                        required
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                    />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-medium text-slate-600">Role</label>
                                    <select
                                        value={formData.role}
                                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                                    >
                                        <option value="user">User</option>
                                        <option value="admin">Admin</option>
                                        <option value="superadmin">Superadmin</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-slate-600">Status</label>
                                    <select
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
                                    >
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={closeModal}
                                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50 font-medium cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-medium shadow-sm cursor-pointer"
                                >
                                    {editingUser ? 'Update User' : 'Create User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserManagement;