import { useState } from 'react';
import { Filter, Calendar } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface FilterState {
  municipalityId: string;
  barangayId: string;
  schoolId: string;
  startDate: string;
  endDate: string;
}

interface FilterBarProps {
  onFilterChange: (filters: FilterState) => void;
  className?: string;
}

export const FilterBar = ({ onFilterChange, className }: FilterBarProps) => {
  const [filters, setFilters] = useState<FilterState>({
    municipalityId: '',
    barangayId: '',
    schoolId: '',
    startDate: '',
    endDate: ''
  });

  const handleChange = (key: keyof FilterState, value: string) => {
    const newFilters = { ...filters, [key]: value };
    // Cascading reset logic
    if (key === 'municipalityId') {
      newFilters.barangayId = '';
      newFilters.schoolId = '';
    }
    if (key === 'barangayId') {
      newFilters.schoolId = '';
    }
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  return (
    <div className={cn("bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center gap-4", className)}>
      <div className="flex items-center text-slate-500 gap-2 font-medium text-sm border-r border-slate-200 pr-4">
        <Filter className="w-4 h-4 text-teal-600" />
        <span>Filters</span>
      </div>
      
      <div className="flex flex-1 flex-col md:flex-row gap-4">
        <select 
          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 transition-all"
          value={filters.municipalityId}
          onChange={(e) => handleChange('municipalityId', e.target.value)}
        >
          <option value="">All Municipalities</option>
          {/* Options will be populated from API */}
          <option value="1">Kalibo</option>
          <option value="2">Malay</option>
        </select>

        <select 
          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          value={filters.barangayId}
          onChange={(e) => handleChange('barangayId', e.target.value)}
          disabled={!filters.municipalityId}
        >
          <option value="">All Barangays</option>
          {/* Options will be populated from API */}
        </select>

        <select 
          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          value={filters.schoolId}
          onChange={(e) => handleChange('schoolId', e.target.value)}
          disabled={!filters.barangayId}
        >
          <option value="">All Schools</option>
          {/* Options will be populated from API */}
        </select>
      </div>

      <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
        <Calendar className="w-4 h-4 text-slate-500" />
        <input 
          type="date" 
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 transition-all"
          value={filters.startDate}
          onChange={(e) => handleChange('startDate', e.target.value)}
        />
        <span className="text-slate-500">-</span>
        <input 
          type="date" 
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 transition-all"
          value={filters.endDate}
          onChange={(e) => handleChange('endDate', e.target.value)}
        />
      </div>
    </div>
  );
};
