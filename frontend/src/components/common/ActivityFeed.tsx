import React from 'react';
import { UserCheck, FilePlus, FileText, AlertCircle, UserPlus, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ActivityLog } from '../../utils/mockAdminData';

interface ActivityFeedProps {
    activities: ActivityLog[];
    className?: string;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ activities, className }) => {
    
    const getEventConfig = (type: ActivityLog['type']) => {
        switch (type) {
            case 'login':
                return { icon: UserCheck, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30', border: 'border-blue-200 dark:border-blue-800' };
            case 'record_created':
                return { icon: FilePlus, color: 'text-teal-500', bg: 'bg-teal-100 dark:bg-teal-900/30', border: 'border-teal-200 dark:border-teal-800' };
            case 'report_generated':
                return { icon: FileText, color: 'text-indigo-500', bg: 'bg-indigo-100 dark:bg-indigo-900/30', border: 'border-indigo-200 dark:border-indigo-800' };
            case 'system_alert':
                return { icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30', border: 'border-amber-200 dark:border-amber-800' };
            case 'user_created':
                return { icon: UserPlus, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-900/30', border: 'border-emerald-200 dark:border-emerald-800' };
            default:
                return { icon: Clock, color: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-800', border: 'border-slate-200 dark:border-slate-700' };
        }
    };

    return (
        <div className={cn("relative", className)}>
            <div className="absolute top-0 bottom-0 left-6 w-px bg-slate-200 dark:bg-slate-800" />
            
            <div className="space-y-6">
                {activities.map((activity) => {
                    const config = getEventConfig(activity.type);
                    const Icon = config.icon;

                    return (
                        <div key={activity.id} className="relative flex items-start group">
                            <div className={cn(
                                "flex items-center justify-center w-12 h-12 rounded-full border shadow-sm shrink-0 z-10 transition-transform group-hover:scale-110",
                                config.bg, config.border
                            )}>
                                <Icon className={cn("w-5 h-5", config.color)} />
                            </div>
                            
                            <div className="ml-4 flex-1 bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1">
                                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                                        {activity.user}
                                    </h4>
                                    <span className="flex items-center text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 sm:mt-0">
                                        <Clock className="w-3.5 h-3.5 mr-1" />
                                        {activity.timestamp}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-300">
                                    {activity.action}
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
