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
    Syringe,
    Building2,
    Calendar,
    User,
    FileText,
    AlertCircle,
} from 'lucide-react';
import {
    getStudent,
    getImmunizationByStudent,
    createImmunization,
    updateImmunization,
} from '../../services/api';
import type { Student, Immunization, CreateImmunizationPayload } from '../../types';
import { cn } from '../../lib/utils';

const REFUSAL_REASONS = [
    { code: '1', label: '1 - Parent absent/away from home' },
    { code: '2', label: '2 - Fear of vaccine side effect' },
    { code: '3', label: '3 - Vaccine safety issues (past adverse experience)' },
    { code: '4', label: '4 - Child already has complete routine vaccination' },
    { code: '5', label: '5 - Fear of COVID transmission' },
    { code: '6', label: '6 - Vaccine perceived ineffective/low-quality/near-expiry' },
    { code: '7', label: '7 - Client is a newborn and parents believed too young' },
    { code: '8', label: '8 - Already vaccinated by private MD' },
    { code: '9', label: '9 - Peculiar personal beliefs/misconceptions' },
    { code: '10', label: '10 - Lack of trust in the vaccinator' },
    { code: '11', label: '11 - Child just recovered from illness/discharged from hospital' },
    { code: '12', label: '12 - Unaware of the campaign' },
    { code: '13', label: '13 - Vaccine team did not visit' },
    { code: '14', label: '14 - Child from a different area' },
    { code: '15', label: '15 - Child was acutely sick or not feeling well' },
    { code: '16', label: '16 - Do not know/declined to respond' },
    { code: '17', label: '17 - Outright refusal' },
    { code: '18', label: '18 - Other (specify)' },
];

const EDUCATIONAL_LEVELS = [
    'Kindergarten',
    'Grade 1',
    'Grade 2',
    'Grade 3',
    'Grade 4',
    'Grade 5',
    'Grade 6',
    'Grade 7',
    'Grade 8',
    'Grade 9',
    'Grade 10',
    'Grade 11',
    'Grade 12',
];

const ImmunizationForm: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();

    const isSuperUser = location.pathname.startsWith('/superuser');
    const basePath = isSuperUser ? '/superuser' : '/staff';

    const [loading, setLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [errorStatus, setErrorStatus] = useState<number | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [student, setStudent] = useState<Student | null>(null);
    const [existingRecord, setExistingRecord] = useState<Immunization | null>(null);

    // Form states
    const [immunizationDate, setImmunizationDate] = useState<string>(new Date().toISOString().split('T')[0] ?? '');
    const [immunizationType, setImmunizationType] = useState<string>('SCHOOL & COMMUNITY BASED IMMUNIZATION');
    const [isSchoolBased, setIsSchoolBased] = useState<boolean>(true);
    const [educationalLevel, setEducationalLevel] = useState<string>('Grade 1');

    // Vaccines
    const [vaccineTd1, setVaccineTd1] = useState<boolean>(false);
    const [vaccineMr1, setVaccineMr1] = useState<boolean>(false);
    const [vaccineHpv1, setVaccineHpv1] = useState<boolean>(false);
    const [vaccineHpv2, setVaccineHpv2] = useState<boolean>(false);
    const [vaccineTd2, setVaccineTd2] = useState<boolean>(false);
    const [vaccineMr2, setVaccineMr2] = useState<boolean>(false);

    // Facility & Lot
    const [isFromOtherFacility, setIsFromOtherFacility] = useState<boolean>(false);
    const [otherFacilityName, setOtherFacilityName] = useState<string>('');
    const [lotBatchNo, setLotBatchNo] = useState<string>('');

    // Pre-screening & Consent
    const [consentGiven, setConsentGiven] = useState<boolean>(true);
    const [isSickToday, setIsSickToday] = useState<boolean>(false);
    const [historyOfAllergies, setHistoryOfAllergies] = useState<string>('');

    // Deferral & Refusal
    const [isDeferred, setIsDeferred] = useState<boolean>(false);
    const [isRefused, setIsRefused] = useState<boolean>(false);
    const [refusalReasonCode, setRefusalReasonCode] = useState<string>('');
    const [refusalReasonText, setRefusalReasonText] = useState<string>('');

    // Status & Personnel
    const [isFullyImmunized, setIsFullyImmunized] = useState<boolean>(false);
    const [vaccinatorName, setVaccinatorName] = useState<string>('');
    const [supervisorName, setSupervisorName] = useState<string>('');
    const [remarks, setRemarks] = useState<string>('');

    // Load data
    useEffect(() => {
        let isMounted = true;
        if (!id) return;

        Promise.all([
            getStudent(id),
            getImmunizationByStudent(id).catch((err: unknown) => {
                if (axios.isAxiosError(err) && err.response?.status === 404) {
                    return { data: { immunization: null, records: [] } };
                }
                throw err;
            }),
        ])
            .then(([studentRes, immuRes]) => {
                if (!isMounted) return;
                setStudent(studentRes.data);

                const currentRecord = immuRes.data.immunization;
                if (currentRecord) {
                    setExistingRecord(currentRecord);
                    setImmunizationDate(currentRecord.immunization_date || '');
                    setImmunizationType(currentRecord.immunization_type || 'SCHOOL & COMMUNITY BASED IMMUNIZATION');
                    setIsSchoolBased(currentRecord.is_school_based ?? true);
                    setEducationalLevel(currentRecord.educational_level || 'Grade 1');

                    setVaccineTd1(Boolean(currentRecord.vaccine_td1));
                    setVaccineMr1(Boolean(currentRecord.vaccine_mr1));
                    setVaccineHpv1(Boolean(currentRecord.vaccine_hpv1));
                    setVaccineHpv2(Boolean(currentRecord.vaccine_hpv2));
                    setVaccineTd2(Boolean(currentRecord.vaccine_td2));
                    setVaccineMr2(Boolean(currentRecord.vaccine_mr2));

                    setIsFromOtherFacility(Boolean(currentRecord.is_from_other_facility));
                    setOtherFacilityName(currentRecord.other_facility_name || '');
                    setLotBatchNo(currentRecord.lot_batch_no || '');

                    setConsentGiven(currentRecord.consent_given ?? true);
                    setIsSickToday(Boolean(currentRecord.is_sick_today));
                    setHistoryOfAllergies(currentRecord.history_of_allergies || '');

                    setIsDeferred(Boolean(currentRecord.is_deferred));
                    setIsRefused(Boolean(currentRecord.is_refused));
                    setRefusalReasonCode(currentRecord.refusal_reason_code || '');
                    setRefusalReasonText(currentRecord.refusal_reason_text || '');

                    setIsFullyImmunized(Boolean(currentRecord.is_fully_immunized));
                    setVaccinatorName(currentRecord.vaccinator_name || '');
                    setSupervisorName(currentRecord.supervisor_name || '');
                    setRemarks(currentRecord.remarks || '');
                } else {
                    setExistingRecord(null);
                    if (studentRes.data.grade_level) {
                        setEducationalLevel(studentRes.data.grade_level);
                    }
                }
                setErrorStatus(null);
                setErrorMessage(null);
                setLoading(false);
            })
            .catch((err: unknown) => {
                if (!isMounted) return;
                let status = 500;
                let message = 'Failed to load immunization record. Please try again.';

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

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!student || !id) return;

        // Date vs DOB check
        if (student.date_of_birth && immunizationDate) {
            const birth = new Date(student.date_of_birth);
            const immu = new Date(immunizationDate);
            if (immu < birth) {
                toast.error('Immunization date cannot be earlier than student date of birth');
                return;
            }
        }

        // Logical rule: at least one vaccine if not refused and not deferred
        if (!isRefused && !isDeferred) {
            const hasVaccine = vaccineTd1 || vaccineMr1 || vaccineHpv1 || vaccineHpv2 || vaccineTd2 || vaccineMr2;
            if (!hasVaccine) {
                toast.error('Please select at least one vaccine administered');
                return;
            }
        }

        // Logical rule: refusal reason when refused
        if (isRefused) {
            if (!refusalReasonCode && !refusalReasonText.trim()) {
                toast.error('Please select a refusal reason code or provide an explanation');
                return;
            }
        }

        // Logical rule: other facility name
        if (isFromOtherFacility && !otherFacilityName.trim()) {
            toast.error('Please specify the other facility name');
            return;
        }

        setIsSaving(true);
        try {
            const payload: CreateImmunizationPayload = {
                student_id: Number(id),
                immunization_date: immunizationDate,
                immunization_type: immunizationType,
                vaccine_td1: vaccineTd1,
                vaccine_mr1: vaccineMr1,
                vaccine_hpv1: vaccineHpv1,
                vaccine_hpv2: vaccineHpv2,
                vaccine_td2: vaccineTd2,
                vaccine_mr2: vaccineMr2,
                is_school_based: isSchoolBased,
                educational_level: educationalLevel || null,
                is_from_other_facility: isFromOtherFacility,
                other_facility_name: isFromOtherFacility ? otherFacilityName.trim() : null,
                lot_batch_no: lotBatchNo.trim() || null,
                consent_given: consentGiven,
                is_sick_today: isSickToday,
                history_of_allergies: historyOfAllergies.trim() || null,
                is_deferred: isDeferred,
                is_refused: isRefused,
                refusal_reason_code: isRefused ? (refusalReasonCode || null) : null,
                refusal_reason_text: isRefused ? (refusalReasonText.trim() || null) : null,
                is_fully_immunized: (isRefused || isDeferred) ? false : isFullyImmunized,
                vaccinator_name: vaccinatorName.trim() || null,
                supervisor_name: supervisorName.trim() || null,
                remarks: remarks.trim() || null,
                school_id: student.school_id || null,
            };

            if (existingRecord?.id) {
                await updateImmunization(existingRecord.id, payload);
                toast.success('Immunization record updated successfully');
            } else {
                await createImmunization(payload);
                toast.success('Immunization record created successfully');
            }

            navigate(`${basePath}/students/${id}`);
        } catch (err: unknown) {
            let message = 'Failed to save immunization record';
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
                <Loader2 className="w-8 h-8 animate-spin text-rose-600" />
                <p className="text-sm font-medium text-slate-500">Loading immunization record...</p>
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
                    className="mt-6 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center shadow-xs"
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
                    className="mt-6 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Registry
                </Link>
            </div>
        );
    }

    const isCompleted = existingRecord !== null;
    const inputClasses = "w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 transition-all outline-hidden";
    const labelClasses = "block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5";
    const sectionClasses = "pt-6 border-t border-slate-100";
    const sectionTitleClasses = "text-base font-bold text-slate-900 mb-4 flex items-center";

    return (
        <div className="space-y-6 pb-12 max-w-5xl mx-auto">
            {/* Header Navigation */}
            <div className="flex items-center justify-between">
                <Link
                    to={`${basePath}/students/${id}`}
                    className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-rose-600 transition-colors"
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
                    <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-700 font-bold flex items-center justify-center text-lg shrink-0">
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
                    <span className="text-sm font-bold text-slate-800">Immunization Record</span>
                </div>
            </div>

            {/* Main Form */}
            <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-8">
                {/* General Information */}
                <div>
                    <h2 className={sectionTitleClasses}>
                        <Calendar className="w-5 h-5 mr-2 text-rose-600" />
                        Vaccination Event Details
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div>
                            <label className={labelClasses}>Immunization Date *</label>
                            <input
                                type="date"
                                value={immunizationDate}
                                onChange={(e) => setImmunizationDate(e.target.value)}
                                className={inputClasses}
                                required
                            />
                            <span className="text-xs text-slate-400 mt-1 block">Date of vaccination or screening</span>
                        </div>

                        <div>
                            <label className={labelClasses}>Immunization Type</label>
                            <input
                                type="text"
                                value={immunizationType}
                                onChange={(e) => setImmunizationType(e.target.value)}
                                className={inputClasses}
                                placeholder="SCHOOL & COMMUNITY BASED IMMUNIZATION"
                                maxLength={100}
                            />
                            <span className="text-xs text-slate-400 mt-1 block">Program or campaign description</span>
                        </div>

                        <div>
                            <label className={labelClasses}>Educational Level</label>
                            <select
                                value={educationalLevel}
                                onChange={(e) => setEducationalLevel(e.target.value)}
                                className={inputClasses}
                            >
                                {EDUCATIONAL_LEVELS.map((lvl) => (
                                    <option key={lvl} value={lvl}>{lvl}</option>
                                ))}
                            </select>
                            <span className="text-xs text-slate-400 mt-1 block">Target grade or education level</span>
                        </div>

                        <div className="sm:col-span-2 lg:col-span-3">
                            <label className="flex items-center space-x-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/70 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={isSchoolBased}
                                    onChange={(e) => setIsSchoolBased(e.target.checked)}
                                    className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                                />
                                <div>
                                    <span className="text-sm font-semibold text-slate-800">School-Based Immunization Campaign</span>
                                    <p className="text-xs text-slate-500">Vaccine was administered during an on-campus school health program</p>
                                </div>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Vaccines Administered */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>
                        <Syringe className="w-5 h-5 mr-2 text-rose-600" />
                        Vaccines Administered
                    </h2>
                    <p className="text-xs text-slate-500 mb-4">
                        Select all vaccine doses administered during this visit. At least one vaccine is required unless deferred or refused.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Td1 */}
                        <label className={cn(
                            "flex items-start space-x-3 p-4 rounded-xl border transition-all cursor-pointer",
                            vaccineTd1 ? "bg-rose-50/60 border-rose-300 shadow-xs" : "bg-white border-slate-200 hover:bg-slate-50"
                        )}>
                            <input
                                type="checkbox"
                                checked={vaccineTd1}
                                onChange={(e) => setVaccineTd1(e.target.checked)}
                                className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 mt-0.5"
                            />
                            <div>
                                <span className="text-sm font-bold text-slate-900">Td Dose 1</span>
                                <p className="text-xs text-slate-500">Tetanus, Diphtheria Toxoid (1st dose)</p>
                            </div>
                        </label>

                        {/* MR1 */}
                        <label className={cn(
                            "flex items-start space-x-3 p-4 rounded-xl border transition-all cursor-pointer",
                            vaccineMr1 ? "bg-rose-50/60 border-rose-300 shadow-xs" : "bg-white border-slate-200 hover:bg-slate-50"
                        )}>
                            <input
                                type="checkbox"
                                checked={vaccineMr1}
                                onChange={(e) => setVaccineMr1(e.target.checked)}
                                className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 mt-0.5"
                            />
                            <div>
                                <span className="text-sm font-bold text-slate-900">MR Dose 1</span>
                                <p className="text-xs text-slate-500">Measles, Rubella Vaccine (1st dose)</p>
                            </div>
                        </label>

                        {/* HPV1 */}
                        <label className={cn(
                            "flex items-start space-x-3 p-4 rounded-xl border transition-all cursor-pointer",
                            vaccineHpv1 ? "bg-rose-50/60 border-rose-300 shadow-xs" : "bg-white border-slate-200 hover:bg-slate-50"
                        )}>
                            <input
                                type="checkbox"
                                checked={vaccineHpv1}
                                onChange={(e) => setVaccineHpv1(e.target.checked)}
                                className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 mt-0.5"
                            />
                            <div>
                                <span className="text-sm font-bold text-slate-900">HPV Dose 1</span>
                                <p className="text-xs text-slate-500">Human Papillomavirus (Dose 1)</p>
                            </div>
                        </label>

                        {/* Td2 */}
                        <label className={cn(
                            "flex items-start space-x-3 p-4 rounded-xl border transition-all cursor-pointer",
                            vaccineTd2 ? "bg-rose-50/60 border-rose-300 shadow-xs" : "bg-white border-slate-200 hover:bg-slate-50"
                        )}>
                            <input
                                type="checkbox"
                                checked={vaccineTd2}
                                onChange={(e) => setVaccineTd2(e.target.checked)}
                                className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 mt-0.5"
                            />
                            <div>
                                <span className="text-sm font-bold text-slate-900">Td Dose 2</span>
                                <p className="text-xs text-slate-500">Tetanus, Diphtheria Toxoid (Booster / 2nd dose)</p>
                            </div>
                        </label>

                        {/* MR2 */}
                        <label className={cn(
                            "flex items-start space-x-3 p-4 rounded-xl border transition-all cursor-pointer",
                            vaccineMr2 ? "bg-rose-50/60 border-rose-300 shadow-xs" : "bg-white border-slate-200 hover:bg-slate-50"
                        )}>
                            <input
                                type="checkbox"
                                checked={vaccineMr2}
                                onChange={(e) => setVaccineMr2(e.target.checked)}
                                className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 mt-0.5"
                            />
                            <div>
                                <span className="text-sm font-bold text-slate-900">MR Dose 2</span>
                                <p className="text-xs text-slate-500">Measles, Rubella Vaccine (Booster / 2nd dose)</p>
                            </div>
                        </label>

                        {/* HPV2 */}
                        <label className={cn(
                            "flex items-start space-x-3 p-4 rounded-xl border transition-all cursor-pointer",
                            vaccineHpv2 ? "bg-rose-50/60 border-rose-300 shadow-xs" : "bg-white border-slate-200 hover:bg-slate-50"
                        )}>
                            <input
                                type="checkbox"
                                checked={vaccineHpv2}
                                onChange={(e) => setVaccineHpv2(e.target.checked)}
                                className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 mt-0.5"
                            />
                            <div>
                                <span className="text-sm font-bold text-slate-900">HPV Dose 2</span>
                                <p className="text-xs text-slate-500">Human Papillomavirus (Dose 2)</p>
                            </div>
                        </label>
                    </div>
                </div>

                {/* Administration Details & Facility */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>
                        <Building2 className="w-5 h-5 mr-2 text-rose-600" />
                        Administration & Facility Details
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div>
                            <label className={labelClasses}>Lot / Batch Number</label>
                            <input
                                type="text"
                                value={lotBatchNo}
                                onChange={(e) => setLotBatchNo(e.target.value)}
                                className={inputClasses}
                                placeholder="e.g. AB12345C"
                                maxLength={100}
                            />
                            <span className="text-xs text-slate-400 mt-1 block">Vaccine vial lot or batch identifier</span>
                        </div>

                        <div>
                            <label className={labelClasses}>Vaccinator Name</label>
                            <input
                                type="text"
                                value={vaccinatorName}
                                onChange={(e) => setVaccinatorName(e.target.value)}
                                className={inputClasses}
                                placeholder="e.g. Maria Santos, RN"
                                maxLength={200}
                            />
                            <span className="text-xs text-slate-400 mt-1 block">Healthcare worker administering dose</span>
                        </div>

                        <div>
                            <label className={labelClasses}>Supervisor Name</label>
                            <input
                                type="text"
                                value={supervisorName}
                                onChange={(e) => setSupervisorName(e.target.value)}
                                className={inputClasses}
                                placeholder="e.g. Dr. Jose Rizal, MD"
                                maxLength={200}
                            />
                            <span className="text-xs text-slate-400 mt-1 block">Supervising medical officer</span>
                        </div>

                        <div className="sm:col-span-2 lg:col-span-3">
                            <label className="flex items-center space-x-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/70 transition-colors">
                                <input
                                    type="checkbox"
                                    checked={isFromOtherFacility}
                                    onChange={(e) => setIsFromOtherFacility(e.target.checked)}
                                    className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500"
                                />
                                <div>
                                    <span className="text-sm font-semibold text-slate-800">Administered at Another Facility</span>
                                    <p className="text-xs text-slate-500">Check if vaccination occurred at an outside RHU, BHS, or private clinic</p>
                                </div>
                            </label>
                        </div>

                        {/* Conditional Other Facility Name */}
                        {isFromOtherFacility && (
                            <div className="sm:col-span-2 lg:col-span-3 bg-amber-50/70 border border-amber-200 p-4 rounded-xl space-y-2 animate-in fade-in">
                                <label className="block text-xs font-bold uppercase tracking-wider text-amber-900">
                                    Outside Facility Name *
                                </label>
                                <input
                                    type="text"
                                    value={otherFacilityName}
                                    onChange={(e) => setOtherFacilityName(e.target.value)}
                                    className={cn(inputClasses, "border-amber-300 bg-white focus:ring-amber-500/20 focus:border-amber-600")}
                                    placeholder="e.g. Kalibo Rural Health Unit, Aklan Provincial Hospital"
                                    required={isFromOtherFacility}
                                    maxLength={200}
                                />
                                <span className="text-xs text-amber-700 block">Name of the health facility or clinic where vaccination was completed</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Pre-Screening & Consent */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>
                        <AlertCircle className="w-5 h-5 mr-2 text-rose-600" />
                        Pre-Screening & Consent
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <label className="flex items-start space-x-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/70 transition-colors">
                            <input
                                type="checkbox"
                                checked={consentGiven}
                                onChange={(e) => setConsentGiven(e.target.checked)}
                                className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 mt-0.5"
                            />
                            <div>
                                <span className="text-sm font-semibold text-slate-800">Consent Given by Parent/Guardian</span>
                                <p className="text-xs text-slate-500">Signed parent or guardian consent form on file</p>
                            </div>
                        </label>

                        <label className="flex items-start space-x-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/70 transition-colors">
                            <input
                                type="checkbox"
                                checked={isSickToday}
                                onChange={(e) => setIsSickToday(e.target.checked)}
                                className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 mt-0.5"
                            />
                            <div>
                                <span className="text-sm font-semibold text-slate-800">Student is Currently Sick</span>
                                <p className="text-xs text-slate-500">Fever, respiratory distress, or acute symptoms on day of visit</p>
                            </div>
                        </label>

                        <div className="sm:col-span-2">
                            <label className={labelClasses}>History of Allergies</label>
                            <textarea
                                rows={2}
                                value={historyOfAllergies}
                                onChange={(e) => setHistoryOfAllergies(e.target.value)}
                                className={inputClasses}
                                placeholder="Any known allergies to eggs, neomycin, gelatin, or past vaccines..."
                                maxLength={500}
                            />
                        </div>
                    </div>
                </div>

                {/* Deferral & Refusal */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>
                        <ShieldAlert className="w-5 h-5 mr-2 text-rose-600" />
                        Deferral & Refusal
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <label className="flex items-start space-x-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/70 transition-colors">
                            <input
                                type="checkbox"
                                checked={isDeferred}
                                onChange={(e) => {
                                    setIsDeferred(e.target.checked);
                                    if (e.target.checked) setIsFullyImmunized(false);
                                }}
                                className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 mt-0.5"
                            />
                            <div>
                                <span className="text-sm font-semibold text-slate-800">Vaccination Deferred</span>
                                <p className="text-xs text-slate-500">Postponed due to acute illness or temporary medical contraindication</p>
                            </div>
                        </label>

                        <label className="flex items-start space-x-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/70 transition-colors">
                            <input
                                type="checkbox"
                                checked={isRefused}
                                onChange={(e) => {
                                    setIsRefused(e.target.checked);
                                    if (e.target.checked) setIsFullyImmunized(false);
                                }}
                                className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 mt-0.5"
                            />
                            <div>
                                <span className="text-sm font-semibold text-slate-800">Vaccination Refused</span>
                                <p className="text-xs text-slate-500">Parent or guardian declined vaccination</p>
                            </div>
                        </label>

                        {/* Conditional Refusal Fields */}
                        {isRefused && (
                            <div className="sm:col-span-2 bg-rose-50/70 border border-rose-200 p-5 rounded-xl space-y-4 animate-in fade-in">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-rose-900 mb-1.5">
                                        Refusal Reason Code *
                                    </label>
                                    <select
                                        value={refusalReasonCode}
                                        onChange={(e) => setRefusalReasonCode(e.target.value)}
                                        className={cn(inputClasses, "border-rose-300 bg-white focus:ring-rose-500/20 focus:border-rose-600")}
                                    >
                                        <option value="">Select official refusal code (1-18)...</option>
                                        {REFUSAL_REASONS.map((r) => (
                                            <option key={r.code} value={r.code}>{r.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-rose-900 mb-1.5">
                                        Refusal Reason Explanation / Remarks
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={refusalReasonText}
                                        onChange={(e) => setRefusalReasonText(e.target.value)}
                                        className={cn(inputClasses, "border-rose-300 bg-white focus:ring-rose-500/20 focus:border-rose-600")}
                                        placeholder="Specific reason stated by parent/guardian, counseling provided, or follow-up notes..."
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Overall Completion & Remarks */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>
                        <FileText className="w-5 h-5 mr-2 text-rose-600" />
                        Completion Status & Remarks
                    </h2>
                    <div className="space-y-6">
                        <label className={cn(
                            "flex items-start space-x-3 p-4 rounded-xl border transition-all",
                            (isRefused || isDeferred) ? "bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed" : "bg-emerald-50/60 border-emerald-200 cursor-pointer hover:bg-emerald-50"
                        )}>
                            <input
                                type="checkbox"
                                checked={isFullyImmunized}
                                disabled={isRefused || isDeferred}
                                onChange={(e) => setIsFullyImmunized(e.target.checked)}
                                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 mt-0.5"
                            />
                            <div>
                                <span className="text-sm font-bold text-slate-900">Student is Fully Immunized (FIC)</span>
                                <p className="text-xs text-slate-600">
                                    {(isRefused || isDeferred)
                                        ? 'Cannot be marked as fully immunized because vaccination was deferred or refused.'
                                        : 'Check if student has completed all grade-appropriate vaccinations per Department of Health schedule.'}
                                </p>
                            </div>
                        </label>

                        <div>
                            <label className={labelClasses}>General Clinical Remarks</label>
                            <textarea
                                rows={3}
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                                className={inputClasses}
                                placeholder="Any additional notes on post-vaccination observation, follow-up dates, or recommendations..."
                            />
                        </div>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                    <Link
                        to={`${basePath}/students/${id}`}
                        className="px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                    >
                        Cancel
                    </Link>

                    <button
                        type="submit"
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm rounded-xl shadow-xs transition-all flex items-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Saving Record...</span>
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                <span>{isCompleted ? 'Update Immunization Record' : 'Save Immunization Record'}</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ImmunizationForm;
