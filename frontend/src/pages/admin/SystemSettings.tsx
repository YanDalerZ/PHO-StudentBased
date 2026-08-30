import React from 'react';
import { Building2, Save, ShieldCheck, Mail, Database } from 'lucide-react';

const SystemSettings: React.FC = () => {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">System Settings</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Manage global application configurations and preferences.</p>
                </div>
                <button className="px-4 py-2.5 bg-linear-to-r from-teal-500 to-blue-600 hover:from-teal-600 hover:to-blue-700 text-white font-medium text-sm rounded-xl shadow-md transition-all self-start md:self-auto flex items-center space-x-2">
                    <Save className="w-4 h-4" />
                    <span>Save Changes</span>
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* General Settings */}
                <div className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm lg:col-span-2 space-y-6">
                    <div className="flex items-center space-x-3 border-b border-slate-100 dark:border-white/10 pb-4">
                        <Building2 className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">General Information</h2>
                    </div>
                    
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Organization Name</label>
                            <input
                                type="text"
                                defaultValue="Provincial Health Office of Aklan"
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">System Support Email</label>
                            <input
                                type="email"
                                defaultValue="support@pho-aklan.gov.ph"
                                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                        </div>
                    </div>
                </div>

                {/* Quick Toggles */}
                <div className="space-y-6">
                    <div className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm space-y-6">
                        <div className="flex items-center space-x-3 border-b border-slate-100 dark:border-white/10 pb-4">
                            <ShieldCheck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Security</h2>
                        </div>
                        
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">Two-Factor Auth</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Require 2FA for Admins</p>
                                </div>
                                <div className="relative inline-flex h-6 w-11 items-center rounded-full bg-teal-500 cursor-pointer">
                                    <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-6" />
                                </div>
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">Session Timeout</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">Auto logout after 30m</p>
                                </div>
                                <div className="relative inline-flex h-6 w-11 items-center rounded-full bg-slate-300 dark:bg-slate-700 cursor-pointer">
                                    <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform translate-x-1" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center space-x-3 border-b border-slate-100 dark:border-white/10 pb-4 mb-4">
                            <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Data Management</h2>
                        </div>
                        <button className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-medium">
                            Export System Audit Log
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SystemSettings;
