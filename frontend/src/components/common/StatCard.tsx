import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    label: string;
    isPositive: boolean;
  };
  iconBgClass?: string;
  iconColorClass?: string;
}

export const StatCard = ({ title, value, icon: Icon, trend, iconBgClass, iconColorClass }: StatCardProps) => {
  return (
    <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{title}</span>
        <div className={cn("p-2.5 rounded-xl border flex items-center justify-center", iconBgClass || "bg-teal-100 border-teal-200")}>
          <Icon className={cn("w-5 h-5", iconColorClass || "text-teal-600")} />
        </div>
      </div>
      <div className="mt-4">
        <span className="text-2xl font-bold text-slate-900 tracking-tight">{value}</span>
        {trend && (
          <p className={cn("text-xs mt-1 font-medium flex items-center space-x-1", trend.isPositive ? "text-emerald-600" : "text-rose-600")}>
            <span>{trend.isPositive ? "+" : ""}{trend.value}%</span>
            <span className="text-slate-500 font-normal">{trend.label}</span>
          </p>
        )}
      </div>
    </div>
  );
};
