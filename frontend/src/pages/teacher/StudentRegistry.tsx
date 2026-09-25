import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronRight, UserPlus, X, Filter, Loader2 } from 'lucide-react';
import { DataTable } from '../../components/common/DataTable';
import type { Student, School } from '../../types';
import { getStudents, getMunicipalities, getBarangays, getSchools } from '../../services/api';
import RegistrationForm from '../RegistrationForm';
import { useAuth } from '../../contexts/AuthContext';
import { hasModulePermission } from '../../lib/access';

const GRADE_OPTIONS = [
    'Kindergarten',
    'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
    'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'
];

const StudentRegistry: React.FC = () => {
    const { effectiveAccess } = useAuth();
    const canCreateStudent = hasModulePermission(effectiveAccess, 'patient-info', 'can_create');
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
    const [selectedGrade, setSelectedGrade] = useState<string>('');
    const [availableSchools, setAvailableSchools] = useState<School[]>([]);
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);

    // Fetch schools for filter dropdown
    useEffect(() => {
        let isMounted = true;
        const loadFilterSchools = async () => {
            try {
                const municipalities = await getMunicipalities();
                const allSchools: School[] = [];
                for (const mun of municipalities.slice(0, 5)) {
                    const bgys = await getBarangays(mun.id);
                    for (const bgy of bgys.slice(0, 3)) {
                        const schs = await getSchools(bgy.id);
                        allSchools.push(...schs);
                    }
                }
                if (isMounted) {
                    // Deduplicate schools by id
                    const uniqueSchools = Array.from(new Map(allSchools.map(s => [s.id, s])).values());
                    setAvailableSchools(uniqueSchools);
                }
            } catch (err) {
                console.error('Failed to load schools for filter:', err);
            }
        };
        loadFilterSchools();
        return () => { isMounted = false; };
    }, []);

    // Fetch students with current filters
    const fetchStudents = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params: { search?: string; school_id?: string; grade_level?: string } = {};
            if (searchQuery.trim()) params.search = searchQuery.trim();
            if (selectedSchoolId) params.school_id = selectedSchoolId;
            if (selectedGrade) params.grade_level = selectedGrade;

            const res = await getStudents(params);
            setStudents(res.data || []);
        } catch (err: unknown) {
            console.error('Failed to fetch students:', err);
            setError('Unable to load student registry. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [searchQuery, selectedSchoolId, selectedGrade]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchStudents();
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [fetchStudents]);

    // Table columns definition
    const columns = useMemo(() => [
        {
            header: 'Name',
            cell: (student: Student) => (
                <div className="flex items-center">
                    <div className="h-8 w-8 rounded-full bg-teal-100 text-teal-700 font-bold flex items-center justify-center text-xs mr-3 shrink-0">
                        {student.first_name[0] || ''}{student.last_name[0] || ''}
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-slate-900">{student.first_name} {student.last_name}</p>
                        <p className="text-xs text-slate-500">{student.date_of_birth}</p>
                    </div>
                </div>
            )
        },
        {
            header: 'LRN',
            accessorKey: 'student_lrn' as keyof Student,
            className: 'text-slate-700 font-mono text-xs'
        },
        {
            header: 'Sex',
            accessorKey: 'sex' as keyof Student,
            className: 'text-slate-600'
        },
        {
            header: 'Grade & Section',
            cell: (student: Student) => (
                <span className="text-slate-600">
                    {student.grade_level || 'N/A'} {student.section ? `- ${student.section}` : ''}
                </span>
            )
        },
        {
            header: 'School',
            cell: (student: Student) => (
                <span className="text-slate-600 text-xs">
                    {student.school_name || (student.school_id ? `School #${student.school_id}` : 'Unassigned')}
                </span>
            )
        },
        {
            header: 'Actions',
            cell: (student: Student) => {
                const basePath = window.location.pathname.startsWith('/superuser') ? '/superuser' : '/teacher';
                return (
                    <Link
                        to={`${basePath}/students/${student.id}`}
                        className="text-teal-600 hover:text-teal-800 font-medium text-sm flex items-center group"
                    >
                        View Profile
                        <ChevronRight className="w-4 h-4 ml-1 transform group-hover:translate-x-1 transition-transform" />
                    </Link>
                );
            }
        }
    ], []);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Student Registry</h1>
                    <p className="text-sm text-slate-500">Manage and view all registered students.</p>
                </div>
                {canCreateStudent && <button
                    type="button"
                    onClick={() => setIsRegisterModalOpen(true)}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm rounded-xl shadow-xs transition-colors self-start md:self-auto flex items-center space-x-2 cursor-pointer"
                >
                    <UserPlus className="w-4 h-4" />
                    <span>Register Student</span>
                </button>}
            </div>

            {/* Filter Bar */}
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex items-center text-slate-500 gap-2 font-medium text-sm border-r border-slate-200 pr-4">
                    <Filter className="w-4 h-4 text-teal-600" />
                    <span>Filters</span>
                </div>

                <div className="flex flex-1 flex-col sm:flex-row gap-3">
                    {/* Search Input */}
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search by name or LRN..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                        />
                    </div>

                    {/* School Filter */}
                    <select
                        value={selectedSchoolId}
                        onChange={(e) => setSelectedSchoolId(e.target.value)}
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all sm:w-56"
                    >
                        <option value="">All Schools</option>
                        {availableSchools.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>

                    {/* Grade Filter */}
                    <select
                        value={selectedGrade}
                        onChange={(e) => setSelectedGrade(e.target.value)}
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all sm:w-44"
                    >
                        <option value="">All Grades</option>
                        {GRADE_OPTIONS.map((g) => (
                            <option key={g} value={g}>
                                {g}
                            </option>
                        ))}
                    </select>

                    {(searchQuery || selectedSchoolId || selectedGrade) && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearchQuery('');
                                setSelectedSchoolId('');
                                setSelectedGrade('');
                            }}
                            className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                        >
                            Clear Filters
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center justify-between">
                    <span>{error}</span>
                    <button
                        onClick={fetchStudents}
                        className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                        Retry
                    </button>
                </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <DataTable
                    data={students}
                    columns={columns}
                    isLoading={loading}
                />
            </div>

            {/* Registration Form Modal */}
            {canCreateStudent && isRegisterModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 md:p-6 overflow-y-auto"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col relative overflow-hidden">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sticky top-0 bg-white z-20 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="h-2 w-2 rounded-full bg-emerald-600"></div>
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Register New Student</h2>
                                    <p className="text-xs text-slate-500 mt-0.5">Fill in the student credentials and required details below.</p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsRegisterModalOpen(false)}
                                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-200"
                                aria-label="Close Modal"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Form Content */}
                        <div className="p-6 md:p-8 overflow-y-auto flex-1 text-slate-800">
                            <Suspense fallback={
                                <div className="flex h-48 w-full items-center justify-center space-x-2">
                                    <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                                    <p className="text-sm font-medium text-slate-400">Loading form...</p>
                                </div>
                            }>
                                <RegistrationForm
                                    onClose={() => setIsRegisterModalOpen(false)}
                                    onSuccess={() => {
                                        setIsRegisterModalOpen(false);
                                        fetchStudents();
                                    }}
                                />
                            </Suspense>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentRegistry;
