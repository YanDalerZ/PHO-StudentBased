import { useState, useEffect, useCallback, useRef } from 'react';
import { Filter, Calendar, Loader2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getMunicipalities, getBarangays, getSchools } from '../../services/api';
import type { Municipality, Barangay, School, DashboardFilters } from '../../types';

interface FilterBarProps {
  onFilterChange: (filters: DashboardFilters) => void;
  className?: string;
}

const selectClasses = 'flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed appearance-none min-w-0';

const dateInputClasses = 'px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/20 transition-all';

export const FilterBar = ({ onFilterChange, className }: FilterBarProps) => {
  // Lookup data
  const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [schoolList, setSchoolList] = useState<School[]>([]);

  // Loading states
  const [loadingMunicipalities, setLoadingMunicipalities] = useState(false);
  const [loadingBarangays, setLoadingBarangays] = useState(false);
  const [loadingSchools, setLoadingSchools] = useState(false);

  // Filter state (string IDs for select elements, converted to numbers on emit)
  const [municipalityId, setMunicipalityId] = useState('');
  const [barangayId, setBarangayId] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Track mount to load municipalities once
  const hasMounted = useRef(false);

  // Derive date error (no effect needed)
  const dateError = dateFrom && dateTo && dateFrom > dateTo
    ? 'Start date must be before end date'
    : '';

  // Build and emit the filter object
  const emitFilters = useCallback((
    munId: string,
    bgyId: string,
    schId: string,
    df: string,
    dt: string
  ) => {
    const filters: DashboardFilters = {};
    if (munId) filters.municipality_id = parseInt(munId, 10);
    if (bgyId) filters.barangay_id = parseInt(bgyId, 10);
    if (schId) filters.school_id = parseInt(schId, 10);
    if (df) filters.date_from = df;
    if (dt) filters.date_to = dt;
    onFilterChange(filters);
  }, [onFilterChange]);

  // Load municipalities on mount only
  useEffect(() => {
    if (hasMounted.current) return;
    hasMounted.current = true;

    const loadMunicipalities = async () => {
      setLoadingMunicipalities(true);
      try {
        const data = await getMunicipalities();
        setMunicipalities(data);
      } catch (err) {
        console.error('Failed to load municipalities:', err);
      } finally {
        setLoadingMunicipalities(false);
      }
    };
    void loadMunicipalities();
  }, []);

  // Cascading fetch functions (called from handlers, not effects)
  const fetchBarangays = useCallback(async (munId: string) => {
    if (!munId) {
      setBarangays([]);
      return;
    }
    setLoadingBarangays(true);
    try {
      const data = await getBarangays(munId);
      setBarangays(data);
    } catch (err) {
      console.error('Failed to load barangays:', err);
    } finally {
      setLoadingBarangays(false);
    }
  }, []);

  const fetchSchools = useCallback(async (bgyId: string) => {
    if (!bgyId) {
      setSchoolList([]);
      return;
    }
    setLoadingSchools(true);
    try {
      const data = await getSchools(bgyId);
      setSchoolList(data);
    } catch (err) {
      console.error('Failed to load schools:', err);
    } finally {
      setLoadingSchools(false);
    }
  }, []);

  const handleMunicipalityChange = (value: string) => {
    setMunicipalityId(value);
    setBarangayId('');
    setSchoolId('');
    setSchoolList([]);
    void fetchBarangays(value);
    emitFilters(value, '', '', dateFrom, dateTo);
  };

  const handleBarangayChange = (value: string) => {
    setBarangayId(value);
    setSchoolId('');
    void fetchSchools(value);
    emitFilters(municipalityId, value, '', dateFrom, dateTo);
  };

  const handleSchoolChange = (value: string) => {
    setSchoolId(value);
    emitFilters(municipalityId, barangayId, value, dateFrom, dateTo);
  };

  const handleDateFromChange = (value: string) => {
    setDateFrom(value);
    // Only emit if no date error will result
    const wouldError = value && dateTo && value > dateTo;
    if (!wouldError) {
      emitFilters(municipalityId, barangayId, schoolId, value, dateTo);
    }
  };

  const handleDateToChange = (value: string) => {
    setDateTo(value);
    const wouldError = dateFrom && value && dateFrom > value;
    if (!wouldError) {
      emitFilters(municipalityId, barangayId, schoolId, dateFrom, value);
    }
  };

  const handleClearAll = () => {
    setMunicipalityId('');
    setBarangayId('');
    setSchoolId('');
    setDateFrom('');
    setDateTo('');
    setBarangays([]);
    setSchoolList([]);
    emitFilters('', '', '', '', '');
  };

  const hasActiveFilters = municipalityId || barangayId || schoolId || dateFrom || dateTo;

  return (
    <div className={cn('bg-white border border-slate-200 p-4 rounded-2xl shadow-sm space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center text-slate-500 gap-2 font-medium text-sm">
          <Filter className="w-4 h-4 text-teal-600" />
          <span>Filters</span>
        </div>
        {hasActiveFilters && (
          <button
            onClick={handleClearAll}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-3 h-3" />
            Clear all
          </button>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        {/* Geography cascade */}
        <div className="flex flex-1 flex-col md:flex-row gap-3">
          {/* Municipality */}
          <div className="flex-1 relative">
            <select
              className={selectClasses}
              value={municipalityId}
              onChange={(e) => handleMunicipalityChange(e.target.value)}
              disabled={loadingMunicipalities}
            >
              <option value="">All School Municipalities</option>
              {municipalities.map((mun) => (
                <option key={mun.id} value={String(mun.id)}>{mun.name}</option>
              ))}
            </select>
            {loadingMunicipalities && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 animate-spin" />
            )}
          </div>

          {/* Barangay */}
          <div className="flex-1 relative">
            <select
              className={selectClasses}
              value={barangayId}
              onChange={(e) => handleBarangayChange(e.target.value)}
              disabled={!municipalityId || loadingBarangays}
            >
              <option value="">All Barangays</option>
              {barangays.map((bgy) => (
                <option key={bgy.id} value={String(bgy.id)}>{bgy.name}</option>
              ))}
            </select>
            {loadingBarangays && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 animate-spin" />
            )}
          </div>

          {/* School */}
          <div className="flex-1 relative">
            <select
              className={selectClasses}
              value={schoolId}
              onChange={(e) => handleSchoolChange(e.target.value)}
              disabled={!barangayId || loadingSchools}
            >
              <option value="">All Schools</option>
              {schoolList.map((sch) => (
                <option key={sch.id} value={String(sch.id)}>{sch.name}</option>
              ))}
            </select>
            {loadingSchools && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 animate-spin" />
            )}
          </div>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2 md:border-l md:border-slate-200 md:pl-3">
          <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            type="date"
            className={dateInputClasses}
            value={dateFrom}
            onChange={(e) => handleDateFromChange(e.target.value)}
            placeholder="From"
          />
          <span className="text-slate-400 text-sm">–</span>
          <input
            type="date"
            className={dateInputClasses}
            value={dateTo}
            onChange={(e) => handleDateToChange(e.target.value)}
            placeholder="To"
          />
        </div>
      </div>

      {dateError && (
        <p className="text-xs text-rose-500 mt-1">{dateError}</p>
      )}
    </div>
  );
};
