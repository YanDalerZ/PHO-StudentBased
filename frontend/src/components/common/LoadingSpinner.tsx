import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface LoadingSpinnerProps {
  className?: string;
  size?: number;
}

export const LoadingSpinner = ({ className, size = 24 }: LoadingSpinnerProps) => {
  return (
    <div className={cn("flex items-center justify-center p-4", className)}>
      <Loader2 size={size} className="animate-spin text-teal-500" />
    </div>
  );
};
