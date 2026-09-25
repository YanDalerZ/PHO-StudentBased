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
    getStudent,
    getDewormingByStudent,
    createDeworming,
    updateDeworming,
} from '../../services/api';
import type { Student, Deworming, CreateDewormingPayload } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { canWriteModuleRecord } from '../../lib/access';
import { cn } from '../../lib/utils';

const calculateDerivedAgeGroup = (dobStr: string, dewormDateStr: string): string => {
    if (!dobStr || !dewormDateStr) return '';
    const birth = new Date(dobStr);
    const deworm = new Date(dewormDateStr);
    if (isNaN(birth.getTime()) || isNaN(deworm.getTime())) return '';
    if (deworm < birth) return '';

    let age = deworm.getFullYear() - birth.getFullYear();
    const monthDiff = deworm.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && deworm.getDate() < birth.getDate())) {
        age--;
    }

    if (age >= 1 && age <= 4) return '1-4';
    if (age >= 5 && age <= 9) return '5-9';
    if (age >= 10 && age <= 14) return '10-14';
    if (age >= 15 && age <= 19) return '15-19';
    if (age < 1) return '<1';
    return '20+';
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

    const [student, setStudent] = useState<Student | null>(null);
    const [existingRecord, setExistingRecord] = useState<Deworming | null>(null);

    // Form states
    const [dateDewormed, setDateDewormed] = useState<string>(new Date().toISOString().split('T')[0] ?? '');
    const [ageGroupOverride, setAgeGroupOverride] = useState<string>('');
    const [medicationGiven, setMedicationGiven] = useState<string>('Albendazole 400mg');
    const [isDewormed, setIsDewormed] = useState<boolean>(true);
    const [schoolType, setSchoolType] = useState<'public' | 'private'>('public');
    const [inSchool, setInSchool] = useState<boolean>(true);
    const [remarks, setRemarks] = useState<string>('');

    // Load student and deworming data
    useEffect(() => {
        let isMounted = true;
        if (!id) return;

        Promise.all([
            getStudent(id),
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
                    setAgeGroupOverride(currentRecord.age_group || '');
                    setMedicationGiven(currentRecord.medication_given || '');
                    setIsDewormed(currentRecord.is_dewormed ?? true);
                    setSchoolType(currentRecord.school_type || 'public');
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

        // Validate date vs DOB
        if (student.date_of_birth && dateDewormed) {
            const birth = new Date(student.date_of_birth);
            const deworm = new Date(dateDewormed);
            if (deworm < birth) {
                toast.error('Date dewormed cannot be earlier than student date of birth');
                return;
            }
        }

        setIsSaving(true);
        try {
            const payload: CreateDewormingPayload = {
                student_id: Number(id),
                date_dewormed: dateDewormed,
                age_group: effectiveAgeGroup || null,
                medication_given: medicationGiven.trim() || null,
                is_dewormed: isDewormed,
                school_type: schoolType,
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
                        <div className="flex items-center space-x-2">
                            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                                {student.first_name} {student.middle_name ? `${student.middle_name[0]}. ` : ''}{student.last_name} {student.suffix && student.suffix !== 'NOT APPLICABLE' ? student.suffix : ''}
                            </h1>
                            <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                                LRN: {student.student_lrn}
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
            <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-8">
                {/* Administration Details */}
                <div>
                    <h2 className={sectionTitleClasses}>
                        <Pill className="w-5 h-5 mr-2 text-teal-600" />
                        Deworming Administration Details
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div>
                            <label className={labelClasses}>Date Dewormed *</label>
                            <input
                                type="date"
                                value={dateDewormed}
                                onChange={(e) => setDateDewormed(e.target.value)}
                                className={inputClasses}
                                required
                            />
                            <span className="text-xs text-slate-400 mt-1 block">Date treatment was administered</span>
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
                                value={ageGroupOverride}
                                onChange={(e) => setAgeGroupOverride(e.target.value)}
                                className={inputClasses}
                            >
                                <option value="">Auto-calculate ({derivedAgeGroup || 'from DOB'})</option>
                                <option value="1-4">1-4 years old</option>
                                <option value="5-9">5-9 years old</option>
                                <option value="10-14">10-14 years old</option>
                                <option value="15-19">15-19 years old</option>
                                <option value="<1">&lt;1 year old</option>
                                <option value="20+">20+ years old</option>
                            </select>
                            <span className="text-xs text-slate-400 mt-1 block">
                                Effective: <strong className="text-slate-700">{effectiveAgeGroup || 'Pending Date/DOB'}</strong>
                            </span>
                        </div>

                        <div>
                            <label className={labelClasses}>Medication Given</label>
                            <input
                                type="text"
                                value={medicationGiven}
                                onChange={(e) => setMedicationGiven(e.target.value)}
                                className={inputClasses}
                                placeholder="e.g. Albendazole 400mg, Mebendazole 500mg"
                                maxLength={100}
                            />
                            <span className="text-xs text-slate-400 mt-1 block">Drug name and dosage</span>
                        </div>

                        <div className="sm:col-span-2 lg:col-span-3">
                            <label className="flex items-center space-x-3 p-3.5 bg-teal-50/50 border border-teal-100 rounded-xl cursor-pointer hover:bg-teal-50 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={isDewormed}
                                    onChange={(e) => setIsDewormed(e.target.checked)}
                                    className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                                />
                                <div>
                                    <span className="text-sm font-semibold text-slate-800">Successfully Dewormed</span>
                                    <p className="text-xs text-slate-500">Student received and swallowed the required dosage without adverse refusal</p>
                                </div>
                            </label>
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
                            <select
                                value={schoolType}
                                onChange={(e) => setSchoolType(e.target.value as 'public' | 'private')}
                                className={inputClasses}
                            >
                                <option value="public">Public School</option>
                                <option value="private">Private School</option>
                            </select>
                            <span className="text-xs text-slate-400 mt-1 block">Institution classification</span>
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
                        disabled={isSaving || !canSave}
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
