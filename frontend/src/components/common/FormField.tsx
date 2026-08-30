import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface FormFieldProps {
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

export const FormField = ({ label, error, className, children }: FormFieldProps) => {
  return (
    <div className={cn("flex flex-col space-y-1.5", className)}>
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      {children}
      {error && (
        <span className="text-xs font-medium text-rose-500 mt-1">{error}</span>
      )}
    </div>
  );
};
