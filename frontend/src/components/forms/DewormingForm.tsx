import StudentContextPanel from '../common/StudentContextPanel';
import type { StudentModuleContext } from '../../types/moduleContext';
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import {
    ArrowLeft,
    Save,
    CheckCircle2,
    Clock,
    ShieldAlert,
    Loader2,
    Pill,
    Building2,
    Calendar,
    User,
    FileText,
} from 'lucide-react';
import {
    getStudentModuleContext,
    getDewormingByStudent,
    createDeworming,
    updateDeworming,
} from '../../services/api';
import type { Deworming, CreateDewormingPayload, DewormingAgeGroup, DewormingMedication } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { canWriteModuleRecord } from '../../lib/access';
import { cn } from '../../lib/utils';

const calculateDerivedAgeGroup = (dobStr: string, dewormDateStr: string): DewormingAgeGroup | '' => {
    if (!dobStr || !dewormDateStr) return '';
    const birth = new Date(dobStr);
    const deworm = new Date(dewormDateStr);
    if (isNaN(birth.getTime()) || isNaN(deworm.getTime())) return '';
    if (deworm < birth) return '';

    let age = deworm.getUTCFullYear() - birth.getUTCFullYear();
    const monthDiff = deworm.getUTCMonth() - birth.getUTCMonth();
    if (monthDiff < 0 || (monthDiff === 0 && deworm.getUTCDate() < birth.getUTCDate())) {
        age--;
    }

    if (age >= 5 && age <= 14) return '5-14';
    if (age >= 15 && age <= 19) return '15-19';
    if (age >= 20) return '20+';
    return '';
};

const medicationChoices = ['Albendazole 400mg', 'Mebendazole 500mg'] as const;
const ageGroupChoices = ['5-14', '15-19', '20+'] as const;
const localToday = (): string => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const DewormingForm: React.FC = () => {
    const { effectiveAccess } = useAuth();
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    const isSuperUser = location.pathname.startsWith('/superuser');
    const basePath = isSuperUser ? '/superuser' : '/teacher';

    const [loading, setLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [errorStatus, setErrorStatus] = useState<number | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [student, setStudent] = useState<StudentModuleContext | null>(null);
    const [existingRecord, setExistingRecord] = useState<Deworming | null>(null);

    // Form states
    const [dateDewormed, setDateDewormed] = useState<string>(localToday);
    const [ageGroupOverride, setAgeGroupOverride] = useState<DewormingAgeGroup | ''>('');
    const [medicationGiven, setMedicationGiven] = useState<DewormingMedication | ''>('');
    const [isDewormed, setIsDewormed] = useState<boolean | null>(null);
    const [convertLegacySchoolType, setConvertLegacySchoolType] = useState(false);
    const [inSchool, setInSchool] = useState<boolean>(true);
    const [remarks, setRemarks] = useState<string>('');

    // Load student and deworming data
    useEffect(() => {
        let isMounted = true;
        if (!id) return;

        Promise.all([
            getStudentModuleContext(id, 'deworming'),
            getDewormingByStudent(id).catch((err: unknown) => {
                if (axios.isAxiosError(err) && err.response?.status === 404) {
                    return { data: { deworming: null, records: [] } };
                }
                throw err;
            }),
        ])
            .then(([studentRes, dewormingRes]) => {
                if (!isMounted) return;
                setStudent(studentRes.data);

                const currentRecord = dewormingRes.data.deworming;
                if (currentRecord) {
                    setExistingRecord(currentRecord);
                    setDateDewormed(currentRecord.date_dewormed || '');
                    setAgeGroupOverride(ageGroupChoices.find((choice) => choice === currentRecord.age_group) ?? '');
                    setMedicationGiven(currentRecord.is_dewormed ? medicationChoices.find((choice) => choice === currentRecord.medication_given) ?? '' : '');
                    setIsDewormed(currentRecord.is_dewormed ?? null);
                    setConvertLegacySchoolType(false);
                    setInSchool(currentRecord.in_school ?? true);
                    setRemarks(currentRecord.remarks || '');
                } else {
                    setExistingRecord(null);
                }
                setErrorStatus(null);
                setErrorMessage(null);
                setLoading(false);
            })
            .catch((err: unknown) => {
                if (!isMounted) return;
                let status = 500;
                let message = 'Failed to load deworming record. Please try again.';

                if (axios.isAxiosError(err) && err.response) {
                    status = err.response.status;
                    if (status === 403) {
                        message = 'You do not have permission to view or manage records for this student.';
                    } else if (status === 404) {
                        message = 'Student record not found in the registry.';
                    } else if (err.response.data?.message) {
                        message = err.response.data.message;
                    }
                }

                setErrorStatus(status);
                setErrorMessage(message);
                setLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [id]);

    // Live derived age group
    const derivedAgeGroup = calculateDerivedAgeGroup(student?.date_of_birth ?? '', dateDewormed);

    // Active age group (override if selected, otherwise auto-derived)
    const effectiveAgeGroup = ageGroupOverride || derivedAgeGroup;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!student || !id) return;
        if (!canWriteModuleRecord(effectiveAccess, 'deworming', Boolean(existingRecord))) {
            toast.error('Your current access allows viewing this record, but not saving this change.');
            return;
        }
        if (isDewormed === null) {
            toast.error('Select whether deworming was administered.');
            return;
        }
        if (!derivedAgeGroup) {
            toast.error('Deworming records require a student aged at least 5 years on the record date.');
            return;
        }
        if (isDewormed && !medicationGiven) {
            toast.error('Select the medication given.');
            return;
        }
        if (!isDewormed && medicationGiven.trim()) {
            toast.error('Clear Medication Given when treatment was not administered.');
            return;
        }

        // Validate date vs DOB
        if (student.date_of_birth && dateDewormed) {
            const birth = new Date(student.date_of_birth);
            const deworm = new Date(dateDewormed);
            if (deworm < birth) {
                toast.error('Record date cannot be earlier than student date of birth');
                return;
            }
        }

        setIsSaving(true);
        try {
            const payload: CreateDewormingPayload = {
                student_id: Number(id),
                date_dewormed: dateDewormed,
                age_group: effectiveAgeGroup || null,
                medication_given: isDewormed ? medicationGiven || null : null,
                is_dewormed: isDewormed,
                school_type: existingRecord?.school_type === 'private' && !convertLegacySchoolType ? undefined : 'public',
                in_school: inSchool,
                school_id: student.school_id || null,
                remarks: remarks.trim() || null,
            };

            if (existingRecord?.id) {
                await updateDeworming(existingRecord.id, payload);
                toast.success('Deworming record updated successfully');
            } else {
                await createDeworming(payload);
                toast.success('Deworming record created successfully');
            }

            navigate(`${basePath}/students/${id}`);
        } catch (err: unknown) {
            let message = 'Failed to save deworming record';
            if (axios.isAxiosError(err) && err.response?.data?.message) {
                message = err.response.data.message;
            }
            toast.error(message);
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
                <p className="text-sm font-medium text-slate-500">Loading deworming record...</p>
            </div>
        );
    }

    if (errorStatus === 403) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
                <div className="p-4 bg-amber-50 text-amber-600 rounded-full mb-4 border border-amber-200">
                    <ShieldAlert className="w-12 h-12" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
                <p className="text-sm text-slate-600 max-w-md mt-2">
                    {errorMessage || 'You do not have permission to access records for this student.'}
                </p>
                <Link
                    to={`${basePath}/students`}
                    className="mt-6 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center shadow-xs"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Registry
                </Link>
            </div>
        );
    }

    if (!student || errorStatus === 404) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
                <h2 className="text-xl font-bold text-slate-800">Student Not Found</h2>
                <p className="text-sm text-slate-500 max-w-md mt-2">
                    {errorMessage || 'The requested student record could not be found.'}
                </p>
                <Link
                    to={`${basePath}/students`}
                    className="mt-6 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Registry
                </Link>
            </div>
        );
    }

    const isCompleted = existingRecord !== null;
    const canSave = canWriteModuleRecord(effectiveAccess, 'deworming', isCompleted);
    const inputClasses = "w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all outline-hidden";
    const labelClasses = "block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5";
    const sectionClasses = "pt-6 border-t border-slate-100";
    const sectionTitleClasses = "text-base font-bold text-slate-900 mb-4 flex items-center";

    return (
        <div className="space-y-6 pb-12 max-w-5xl mx-auto">
            {/* Header Navigation */}
            <div className="flex items-center justify-between">
                <Link
                    to={`${basePath}/students/${id}`}
                    className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-teal-600 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4 mr-1.5" />
                    Back to Student Profile
                </Link>

                <div className="flex items-center space-x-2">
                    {isCompleted ? (
                        <span className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>Record on File (Completed)</span>
                        </span>
                    ) : (
                        <span className="flex items-center space-x-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-200">
                            <Clock className="w-4 h-4 text-amber-600" />
                            <span>Pending Entry</span>
                        </span>
                    )}
                </div>
            </div>

            {/* Student Overview Header Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-700 font-bold flex items-center justify-center text-lg shrink-0">
                        {student.first_name[0]}{student.last_name[0]}
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                                {student.first_name} {student.middle_name ? `${student.middle_name[0]}. ` : ''}{student.last_name} {student.suffix && student.suffix !== 'NOT APPLICABLE' ? student.suffix : ''}
                            </h1>
                            <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                                LRN: {student.student_lrn}
                            </span>
                            <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                                Age (years): {student.age}
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                            <span className="flex items-center">
                                <User className="w-3.5 h-3.5 mr-1 text-slate-400" />
                                {student.sex}
                            </span>
                            <span className="flex items-center">
                                <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
                                Born: {student.date_of_birth}
                            </span>
                            <span className="flex items-center">
                                <Building2 className="w-3.5 h-3.5 mr-1 text-slate-400" />
                                {student.school_name || `School #${student.school_id}`}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="text-right sm:border-l sm:border-slate-100 sm:pl-6">
                    <span className="text-xs font-medium text-slate-400 block">Module</span>
                    <span className="text-sm font-bold text-slate-800">Deworming Administration</span>
                </div>
            </div>

            {/* Main Form */}
            <StudentContextPanel student={student} hideAge />
            <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-8">
                {/* Administration Details */}
                <div>
                    <h2 className={sectionTitleClasses}>
                        <Pill className="w-5 h-5 mr-2 text-teal-600" />
                        Deworming Administration Details
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div>
                            <label className={labelClasses}>Record Date *</label>
                            <input
                                type="date"
                                value={dateDewormed}
                                onChange={(e) => { setDateDewormed(e.target.value); setAgeGroupOverride(''); }}
                                className={inputClasses}
                                required
                            />
                            <span className="text-xs text-slate-400 mt-1 block">Date of treatment or recorded non-administration</span>
                        </div>

                        <div>
                            <label className={labelClasses}>
                                Age Group
                                {derivedAgeGroup && (
                                    <span className="ml-1.5 font-normal text-teal-600 text-xs lowercase">
                                        (auto: {derivedAgeGroup})
                                    </span>
                                )}
                            </label>
                            <select
                                value={effectiveAgeGroup}
                                onChange={(e) => setAgeGroupOverride(e.target.value as DewormingAgeGroup)}
                                className={inputClasses}
                                aria-describedby="deworming-age-help"
                            >
                                <option value="" disabled>Select age group</option>
                                <option value="5-14">5–14 years old</option>
                                <option value="15-19">15–19 years old</option>
                                <option value="20+">20+ years old</option>
                            </select>
                            <span id="deworming-age-help" className="text-xs text-slate-500 mt-1 block">
                                {derivedAgeGroup ? `Automatically calculated from date of birth and record date: ${derivedAgeGroup}.` : 'Student must be at least 5 years old on the record date.'}
                            </span>
                            {existingRecord?.age_group && !ageGroupChoices.some((choice) => choice === existingRecord.age_group) &&
                                <p className="text-xs text-amber-700 mt-1">Historical age group: {existingRecord.age_group}. Saving this form records the current age band.</p>}
                        </div>

                        <div>
                            <label className={labelClasses} htmlFor="deworming-medication">Medication Given {isDewormed ? '*' : ''}</label>
                            <select
                                id="deworming-medication"
                                value={medicationGiven}
                                onChange={(e) => setMedicationGiven(e.target.value as DewormingMedication | '')}
                                className={inputClasses}
                                disabled={isDewormed !== true}
                                required={isDewormed === true}
                            >
                                <option value="">Select medication</option>
                                <option value="Albendazole 400mg">Albendazole 400mg</option>
                                <option value="Mebendazole 500mg">Mebendazole 500mg</option>
                            </select>
                            {existingRecord?.is_dewormed && existingRecord.medication_given && !medicationChoices.some((choice) => choice === existingRecord.medication_given) &&
                                <p className="text-xs text-amber-700 mt-1">Historical medication: {existingRecord.medication_given}. Select an approved medication before saving.</p>}
                        </div>

                        <div className="sm:col-span-2 lg:col-span-3">
                            <label className={labelClasses} htmlFor="deworming-administered">Was deworming administered? *</label>
                            <select id="deworming-administered" value={isDewormed === null ? '' : String(isDewormed)} onChange={(e) => { const next = e.target.value === '' ? null : e.target.value === 'true'; setIsDewormed(next); if (next !== true) setMedicationGiven(''); }} className={inputClasses} required>
                                <option value="">Select recorded outcome</option>
                                <option value="true">Yes — treatment administered</option>
                                <option value="false">No — treatment not administered</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* School Context */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>
                        <Building2 className="w-5 h-5 mr-2 text-teal-600" />
                        School Context & Attendance
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                            <label className={labelClasses}>School Type</label>
                            {existingRecord?.school_type === 'private' ? <>
                                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">Historical Private record. Its classification is preserved unless you explicitly change it.</p>
                                <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
                                    <input type="checkbox" checked={convertLegacySchoolType} onChange={(e) => setConvertLegacySchoolType(e.target.checked)} />
                                    Change this record to Public
                                </label>
                            </> : <select value="public" className={inputClasses} aria-label="School Type" disabled>
                                <option value="public">Public School</option>
                            </select>}
                            <span className="text-xs text-slate-400 mt-1 block">New records are Public only.</span>
                        </div>

                        <div>
                            <label className={labelClasses}>Enrolled School</label>
                            <input
                                type="text"
                                readOnly
                                disabled
                                value={student.school_name || `School #${student.school_id || 'N/A'}`}
                                className={cn(inputClasses, "bg-slate-100 text-slate-500 cursor-not-allowed")}
                            />
                            <span className="text-xs text-slate-400 mt-1 block">Locked to student's enrolled school scope</span>
                        </div>

                        <div className="sm:col-span-2">
                            <label className="flex items-center space-x-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/70 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={inSchool}
                                    onChange={(e) => setInSchool(e.target.checked)}
                                    className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                                />
                                <div>
                                    <span className="text-sm font-semibold text-slate-800">Currently in School</span>
                                    <p className="text-xs text-slate-500">Student is currently enrolled and attending classes (school-based deworming)</p>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Remarks & Clinical Notes */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>
                        <FileText className="w-5 h-5 mr-2 text-teal-600" />
                        Remarks & Observations
                    </h2>
                    <div>
                        <label className={labelClasses}>Clinical Remarks / Observations</label>
                        <textarea
                            rows={3}
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            className={inputClasses}
                            placeholder="Any adverse reactions observed, reason for refusal, special instructions, or notes..."
                        />
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                    {!canSave && <p className="text-xs text-amber-700">Read-only: your current access does not allow this record to be created or edited.</p>}
                    <Link
                        to={`${basePath}/students/${id}`}
                        className="px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                    >
                        Cancel
                    </Link>

                    <button
                        type="submit"
                        disabled={isSaving || !canSave || !derivedAgeGroup}
                        className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm rounded-xl shadow-xs transition-all flex items-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Saving Record...</span>
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                <span>{isCompleted ? 'Update Deworming Record' : 'Save Deworming Record'}</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default DewormingForm;
