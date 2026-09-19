import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: ReactNode;
  trend?: {
    value: number;
    label: string;
    isPositive: boolean;
  };
  iconBgClass?: string;
  iconColorClass?: string;
  className?: string;
}

export const StatCard = ({
  title,
  value,
  icon: Icon,
  subtitle,
  trend,
  iconBgClass,
  iconColorClass,
  className,
}: StatCardProps) => {
  return (
    <div
      className={cn(
        "bg-white dark:bg-surface-card border border-slate-200 dark:border-white/10 p-5 rounded-2xl shadow-sm flex flex-col justify-between transition-all",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</span>
        <div
          className={cn(
            "p-2.5 rounded-xl border flex items-center justify-center",
            iconBgClass || "bg-teal-100 dark:bg-teal-500/10 border-teal-200 dark:border-teal-500/20"
          )}
        >
          <Icon className={cn("w-5 h-5", iconColorClass || "text-teal-600 dark:text-teal-400")} />
        </div>
      </div>
      <div className="mt-4">
        <span className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{value}</span>
        {subtitle && (
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {subtitle}
          </div>
        )}
        {trend && (
          <p
            className={cn(
              "text-xs mt-1 font-medium flex items-center space-x-1",
              trend.isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            )}
          >
            <span>{trend.isPositive ? "+" : ""}{trend.value}%</span>
            <span className="text-slate-500 dark:text-slate-400 font-normal">{trend.label}</span>
          </p>
        )}
      </div>
    </div>
  );
};
