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
    Activity,
    ClipboardCheck,
    FileText,
} from 'lucide-react';
import {
    getStudent,
    getOralHealthByStudent,
    createOralHealth,
    updateOralHealth,
} from '../../services/api';
import type { Student, OralHealth } from '../../types';

type ConditionsState = Record<string, boolean[]>;

const initialConditions: ConditionsState = {
    c: [false, false, false, false, false], // Dental Caries
    g: [false, false, false, false, false], // Gingivitis
    d: [false, false, false, false, false], // Debris
    ca: [false, false, false, false, false], // Calculus
    a: [false, false, false, false, false], // Abnormal Growth
    cl: [false, false, false, false, false], // Cleft Lip/Palate
    o: [false, false, false, false, false], // Others
};

const conditionLabels: Record<string, string> = {
    c: 'Dental Caries',
    g: 'Gingivitis',
    d: 'Debris',
    ca: 'Calculus (Heavy / Moderate / Light)',
    a: 'Abnormal Growth',
    cl: 'Cleft Lip/Palate',
    o: 'Others (supernumerary, mesiodens, malocclusion)',
};

const permTeethUpper = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'];
const permTeethLower = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'];

const priTeethUpper = ['55', '54', '53', '52', '51', '61', '62', '63', '64', '65'];
const priTeethLower = ['85', '84', '83', '82', '81', '71', '72', '73', '74', '75'];

const OralHealthForm: React.FC = () => {
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
    const [existingRecord, setExistingRecord] = useState<OralHealth | null>(null);

    // Examination Metadata
    const [dateExamined, setDateExamined] = useState<string>(new Date().toISOString().split('T')[0] ?? '');
    const [isPregnant, setIsPregnant] = useState<boolean>(false);
    const [serviceLocation, setServiceLocation] = useState<'FACILITY' | 'NON-FACILITY'>('FACILITY');
    const [visitType, setVisitType] = useState<'1ST VISIT' | '2ND VISIT'>('1ST VISIT');
    const [administeredBy, setAdministeredBy] = useState<string>('');

    // Routine Preventive Oral Care (RPOC)
    const [hasOralScreening, setHasOralScreening] = useState<boolean>(false);
    const [hasRiskAssessment, setHasRiskAssessment] = useState<boolean>(false);
    const [hasOralProphylaxis, setHasOralProphylaxis] = useState<boolean>(false);
    const [hasCounseling, setHasCounseling] = useState<boolean>(false);
    const [hasFluorideVarnish, setHasFluorideVarnish] = useState<boolean>(false);
    const [isRpocComplete, setIsRpocComplete] = useState<boolean>(false);

    // Conditions Table
    const [conditions, setConditions] = useState<ConditionsState>(initialConditions);

    // Tooth Charts
    const [toothChartUpper, setToothChartUpper] = useState<Record<string, boolean>>({});
    const [toothChartLower, setToothChartLower] = useState<Record<string, boolean>>({});

    // Permanent DMFT Indices
    const [permTotal, setPermTotal] = useState<string>('');
    const [permSound, setPermSound] = useState<string>('');
    const [permDecayed, setPermDecayed] = useState<string>('');
    const [permMissing, setPermMissing] = useState<string>('');
    const [permFilled, setPermFilled] = useState<string>('');

    // Primary dmft Indices
    const [priTotal, setPriTotal] = useState<string>('');
    const [priSound, setPriSound] = useState<string>('');
    const [priDecayed, setPriDecayed] = useState<string>('');
    const [priMissing, setPriMissing] = useState<string>('');
    const [priFilled, setPriFilled] = useState<string>('');

    // Treatment, Diagnosis, and Consent
    const [remarksDiagnosis, setRemarksDiagnosis] = useState<string>('');
    const [recommendedTreatment, setRecommendedTreatment] = useState<string>('');
    const [treatmentType, setTreatmentType] = useState<string>('');
    const [remarks, setRemarks] = useState<string>('');
    const [consentGiven, setConsentGiven] = useState<boolean>(false);
    const [consentNotes, setConsentNotes] = useState<string>('');

    useEffect(() => {
        let isMounted = true;
        if (!id) return;

        const fetchData = async () => {
            try {
                setLoading(true);
                const [studentRes, oralHealthRes] = await Promise.all([
                    getStudent(id),
                    getOralHealthByStudent(id).catch((err: unknown) => {
                        if (axios.isAxiosError(err) && err.response?.status === 404) {
                            return { data: { oral_health: null, records: [] } };
                        }
                        throw err;
                    })
                ]);

                if (!isMounted) return;

                const st = studentRes.data;
                setStudent(st);

                const oh = oralHealthRes.data?.oral_health;
                if (oh) {
                    setExistingRecord(oh);
                    setDateExamined(oh.date_examined || (new Date().toISOString().split('T')[0] ?? ''));
                    setIsPregnant(Boolean(oh.is_pregnant));
                    setServiceLocation(oh.service_location || 'FACILITY');
                    setVisitType(oh.visit_type || '1ST VISIT');
                    setAdministeredBy(oh.administered_by || '');

                    // RPOC
                    setHasOralScreening(Boolean(oh.has_oral_screening));
                    setHasRiskAssessment(Boolean(oh.has_risk_assessment));
                    setHasOralProphylaxis(Boolean(oh.has_oral_prophylaxis));
                    setHasCounseling(Boolean(oh.has_counseling));
                    setHasFluorideVarnish(Boolean(oh.has_fluoride_varnish));
                    setIsRpocComplete(Boolean(oh.is_rpoc_complete));

                    // Tooth Charts
                    if (oh.tooth_chart_upper && typeof oh.tooth_chart_upper === 'object') {
                        const parsedUpper: Record<string, boolean> = {};
                        for (const [k, v] of Object.entries(oh.tooth_chart_upper)) {
                            parsedUpper[k] = Boolean(v);
                        }
                        setToothChartUpper(parsedUpper);
                    }

                    if (oh.tooth_chart_lower && typeof oh.tooth_chart_lower === 'object') {
                        const parsedLower: Record<string, boolean> = {};
                        for (const [k, v] of Object.entries(oh.tooth_chart_lower)) {
                            parsedLower[k] = Boolean(v);
                        }
                        setToothChartLower(parsedLower);
                    }

                    // Condition
                    if (oh.oral_health_condition) {
                        try {
                            const parsed = JSON.parse(oh.oral_health_condition) as Record<string, string>;
                            const reconstructed: ConditionsState = { ...initialConditions };
                            for (const [k, str] of Object.entries(parsed)) {
                                if (reconstructed[k]) {
                                    reconstructed[k] = str.split('').map(c => c === '1');
                                }
                            }
                            setConditions(reconstructed);
                        } catch {
                            // Freeform or plain string
                        }
                    }

                    // Permanent DMFT
                    setPermTotal(oh.no_of_perm_teeth !== undefined && oh.no_of_perm_teeth !== null ? String(oh.no_of_perm_teeth) : '');
                    setPermSound(oh.no_of_perm_sound_teeth !== undefined && oh.no_of_perm_sound_teeth !== null ? String(oh.no_of_perm_sound_teeth) : '');
                    setPermDecayed(oh.no_of_decayed_teeth !== undefined && oh.no_of_decayed_teeth !== null ? String(oh.no_of_decayed_teeth) : '');
                    setPermMissing(oh.no_of_missing_teeth !== undefined && oh.no_of_missing_teeth !== null ? String(oh.no_of_missing_teeth) : '');
                    setPermFilled(oh.no_of_filled_teeth !== undefined && oh.no_of_filled_teeth !== null ? String(oh.no_of_filled_teeth) : '');

                    // Primary dmft
                    setPriTotal(oh.no_of_primary_teeth !== undefined && oh.no_of_primary_teeth !== null ? String(oh.no_of_primary_teeth) : '');
                    setPriSound(oh.no_of_primary_sound_teeth !== undefined && oh.no_of_primary_sound_teeth !== null ? String(oh.no_of_primary_sound_teeth) : '');
                    setPriDecayed(oh.no_of_primary_decayed !== undefined && oh.no_of_primary_decayed !== null ? String(oh.no_of_primary_decayed) : '');
                    setPriMissing(oh.no_of_primary_missing !== undefined && oh.no_of_primary_missing !== null ? String(oh.no_of_primary_missing) : '');
                    setPriFilled(oh.no_of_primary_filled !== undefined && oh.no_of_primary_filled !== null ? String(oh.no_of_primary_filled) : '');

                    // Treatment & Consent
                    setRemarksDiagnosis(oh.remarks_diagnosis || '');
                    setRecommendedTreatment(oh.recommended_treatment || '');
                    setTreatmentType(oh.treatment_type || '');
                    setRemarks(oh.remarks || '');
                    setConsentGiven(Boolean(oh.consent_given));
                    setConsentNotes(oh.consent_notes || '');
                }

                setErrorStatus(null);
                setErrorMessage(null);
            } catch (err: unknown) {
                console.error('Failed to load oral health record:', err);
                let status = 500;
                if (axios.isAxiosError(err) && err.response?.status) {
                    status = err.response.status;
                }
                setErrorStatus(status);
                if (status === 403) {
                    setErrorMessage('You do not have permission to view or manage oral health records for this student.');
                } else if (status === 404) {
                    setErrorMessage('Student record was not found in the registry.');
                } else {
                    setErrorMessage('Failed to load oral health examination data.');
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchData();

        return () => {
            isMounted = false;
        };
    }, [id]);

    const calculateAge = (dob: string) => {
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    };

    const age = student?.date_of_birth ? calculateAge(student.date_of_birth) : 0;
    const showPrimary = age <= 9;
    const showPermanent = age >= 5;

    const handleConditionChange = (key: string, index: number, checked: boolean) => {
        setConditions(prev => {
            const currentArr = prev[key] ?? [false, false, false, false, false];
            const newArr = [...currentArr];
            newArr[index] = checked;
            return { ...prev, [key]: newArr };
        });
    };

    const totalDmftCalculated = (Number(permDecayed) || 0) + (Number(permMissing) || 0) + (Number(permFilled) || 0);
    const totalPriDmftCalculated = (Number(priDecayed) || 0) + (Number(priMissing) || 0) + (Number(priFilled) || 0);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id || !student) return;

        setIsSaving(true);
        try {
            // Serialize conditions compact structure
            const serializedConditions = Object.entries(conditions).reduce((acc, [k, v]) => {
                acc[k] = v.map(b => (b ? '1' : '0')).join('');
                return acc;
            }, {} as Record<string, string>);

            const payload = {
                student_id: Number(id),
                date_examined: dateExamined,
                is_pregnant: isPregnant,
                has_oral_screening: hasOralScreening,
                has_risk_assessment: hasRiskAssessment,
                has_oral_prophylaxis: hasOralProphylaxis,
                has_counseling: hasCounseling,
                has_fluoride_varnish: hasFluorideVarnish,
                is_rpoc_complete: isRpocComplete,
                service_location: serviceLocation,
                visit_type: visitType,
                administered_by: administeredBy || null,
                remarks: remarks || null,
                tooth_chart_upper: Object.keys(toothChartUpper).length > 0 ? toothChartUpper : null,
                tooth_chart_lower: Object.keys(toothChartLower).length > 0 ? toothChartLower : null,
                oral_health_condition: JSON.stringify(serializedConditions),
                no_of_perm_teeth: permTotal !== '' ? Number(permTotal) : null,
                no_of_perm_sound_teeth: permSound !== '' ? Number(permSound) : null,
                no_of_decayed_teeth: permDecayed !== '' ? Number(permDecayed) : null,
                no_of_missing_teeth: permMissing !== '' ? Number(permMissing) : null,
                no_of_filled_teeth: permFilled !== '' ? Number(permFilled) : null,
                total_dmft: totalDmftCalculated,
                no_of_primary_teeth: priTotal !== '' ? Number(priTotal) : null,
                no_of_primary_sound_teeth: priSound !== '' ? Number(priSound) : null,
                no_of_primary_decayed: priDecayed !== '' ? Number(priDecayed) : null,
                no_of_primary_missing: priMissing !== '' ? Number(priMissing) : null,
                no_of_primary_filled: priFilled !== '' ? Number(priFilled) : null,
                total_dmft_primary: totalPriDmftCalculated,
                remarks_diagnosis: remarksDiagnosis || null,
                recommended_treatment: recommendedTreatment || null,
                treatment_type: treatmentType || null,
                consent_given: consentGiven,
                consent_notes: consentNotes || null,
            };

            if (existingRecord) {
                await updateOralHealth(existingRecord.id, payload);
            } else {
                await createOralHealth(payload);
            }

            toast.success('Oral health examination record saved successfully');
            navigate(`${basePath}/students/${id}`);
        } catch (err: unknown) {
            console.error('Failed to save oral health record:', err);
            if (axios.isAxiosError(err) && err.response?.data?.message) {
                toast.error(err.response.data.message);
            } else {
                toast.error('Failed to save oral health record. Please verify all inputs.');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const inputClasses = "w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400";
    const labelClasses = "block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5";
    const sectionClasses = "space-y-6 pt-6 mt-6 border-t border-slate-100";
    const sectionTitleClasses = "text-base font-bold text-slate-900 mb-4 flex items-center";

    const renderToothRow = (
        label: string,
        teeth: string[],
        chartState: Record<string, boolean>,
        setChartState: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
    ) => (
        <div className="mb-6 overflow-x-auto">
            <h3 className="text-xs font-bold text-slate-600 mb-2 uppercase tracking-wide">{label} Arch</h3>
            <div className="flex gap-1.5 min-w-max pb-1">
                {teeth.map(tooth => (
                    <div key={tooth} className="flex flex-col items-center">
                        <div className="w-9 h-7 flex items-center justify-center bg-slate-100 border border-slate-300 font-mono font-semibold text-xs text-slate-700 rounded-t-lg">
                            {tooth}
                        </div>
                        <div className="w-9 h-9 border-x border-b border-slate-300 flex items-center justify-center rounded-b-lg bg-white">
                            <input
                                type="checkbox"
                                className="w-4 h-4 text-teal-600 rounded-sm border-slate-300 focus:ring-teal-500 cursor-pointer"
                                checked={Boolean(chartState[tooth])}
                                onChange={(e) => setChartState(prev => ({ ...prev, [tooth]: e.target.checked }))}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
                <p className="text-sm font-medium text-slate-500">Loading oral health records...</p>
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
                    {errorMessage}
                </p>
                <Link
                    to={`${basePath}/students`}
                    className="mt-6 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center shadow-xs"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Student Registry
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
                    className="mt-6 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center shadow-xs"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Student Registry
                </Link>
            </div>
        );
    }

    const isRecordCompleted = Boolean(existingRecord);

    return (
        <div className="space-y-6 pb-12 max-w-5xl mx-auto">
            <Link to={`${basePath}/students/${id}`} className="text-sm text-slate-500 hover:text-teal-600 flex items-center transition-colors w-fit">
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back to Student Profile
            </Link>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Oral Health Examination</h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Student: <span className="font-semibold text-slate-800">{student.first_name} {student.middle_name ? `${student.middle_name[0]}. ` : ''}{student.last_name}</span> (Age: {age || 'N/A'}, LRN: <span className="font-mono text-slate-700">{student.student_lrn}</span>)
                    </p>
                </div>
                {isRecordCompleted ? (
                    <span className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-200 shadow-2xs w-fit">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Completed Record</span>
                    </span>
                ) : (
                    <span className="flex items-center space-x-1.5 text-xs font-semibold text-amber-700 bg-amber-50 px-3.5 py-1.5 rounded-full border border-amber-200 shadow-2xs w-fit">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <span>Pending Examination</span>
                    </span>
                )}
            </div>

            <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">

                {/* Section 1: Examination Info & Service Metadata */}
                <div>
                    <h2 className={sectionTitleClasses}>
                        <Activity className="w-4 h-4 mr-2 text-teal-600" />
                        Examination Details & Metadata
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-5">
                        <div>
                            <label className={labelClasses}>Date of Examination *</label>
                            <input
                                type="date"
                                value={dateExamined}
                                onChange={e => setDateExamined(e.target.value)}
                                className={inputClasses}
                                required
                            />
                        </div>
                        <div>
                            <label className={labelClasses}>Service Location</label>
                            <select
                                value={serviceLocation}
                                onChange={e => setServiceLocation(e.target.value as 'FACILITY' | 'NON-FACILITY')}
                                className={inputClasses}
                            >
                                <option value="FACILITY">Facility (Clinic / RHU)</option>
                                <option value="NON-FACILITY">Non-Facility (School Outreach)</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClasses}>Visit Type</label>
                            <select
                                value={visitType}
                                onChange={e => setVisitType(e.target.value as '1ST VISIT' | '2ND VISIT')}
                                className={inputClasses}
                            >
                                <option value="1ST VISIT">1st Visit</option>
                                <option value="2ND VISIT">2nd Visit</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClasses}>Dentist / Examiner Name</label>
                            <input
                                type="text"
                                value={administeredBy}
                                onChange={e => setAdministeredBy(e.target.value)}
                                placeholder="Dentist / Health Officer..."
                                className={inputClasses}
                            />
                        </div>
                        {student.sex === 'Female' && (
                            <div className="flex items-center space-x-3 p-3.5 border border-slate-200 rounded-xl bg-slate-50 sm:col-span-2">
                                <input
                                    type="checkbox"
                                    id="is_pregnant"
                                    checked={isPregnant}
                                    onChange={e => setIsPregnant(e.target.checked)}
                                    className="w-4 h-4 text-teal-600 rounded-sm border-slate-300 focus:ring-teal-500 cursor-pointer"
                                />
                                <label htmlFor="is_pregnant" className="text-xs font-semibold text-slate-800 cursor-pointer">
                                    Patient is currently pregnant
                                </label>
                            </div>
                        )}
                    </div>
                </div>

                {/* Section 2: Routine Preventive Oral Care (RPOC) */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>
                        <ClipboardCheck className="w-4 h-4 mr-2 text-teal-600" />
                        Routine Preventive Oral Care (RPOC) Services
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <label className="flex items-center space-x-2.5 p-2 rounded-lg hover:bg-white transition-colors cursor-pointer">
                            <input
                                type="checkbox"
                                checked={hasOralScreening}
                                onChange={e => setHasOralScreening(e.target.checked)}
                                className="w-4 h-4 text-teal-600 rounded-sm border-slate-300 focus:ring-teal-500"
                            />
                            <span className="text-xs font-medium text-slate-700">Oral Health Screening</span>
                        </label>
                        <label className="flex items-center space-x-2.5 p-2 rounded-lg hover:bg-white transition-colors cursor-pointer">
                            <input
                                type="checkbox"
                                checked={hasRiskAssessment}
                                onChange={e => setHasRiskAssessment(e.target.checked)}
                                className="w-4 h-4 text-teal-600 rounded-sm border-slate-300 focus:ring-teal-500"
                            />
                            <span className="text-xs font-medium text-slate-700">Oral Health Risk Assessment</span>
                        </label>
                        <label className="flex items-center space-x-2.5 p-2 rounded-lg hover:bg-white transition-colors cursor-pointer">
                            <input
                                type="checkbox"
                                checked={hasOralProphylaxis}
                                onChange={e => setHasOralProphylaxis(e.target.checked)}
                                className="w-4 h-4 text-teal-600 rounded-sm border-slate-300 focus:ring-teal-500"
                            />
                            <span className="text-xs font-medium text-slate-700">Oral Prophylaxis (OP)</span>
                        </label>
                        <label className="flex items-center space-x-2.5 p-2 rounded-lg hover:bg-white transition-colors cursor-pointer">
                            <input
                                type="checkbox"
                                checked={hasCounseling}
                                onChange={e => setHasCounseling(e.target.checked)}
                                className="w-4 h-4 text-teal-600 rounded-sm border-slate-300 focus:ring-teal-500"
                            />
                            <span className="text-xs font-medium text-slate-700">Oral Hygiene Counseling</span>
                        </label>
                        <label className="flex items-center space-x-2.5 p-2 rounded-lg hover:bg-white transition-colors cursor-pointer">
                            <input
                                type="checkbox"
                                checked={hasFluorideVarnish}
                                onChange={e => setHasFluorideVarnish(e.target.checked)}
                                className="w-4 h-4 text-teal-600 rounded-sm border-slate-300 focus:ring-teal-500"
                            />
                            <span className="text-xs font-medium text-slate-700">Fluoride Varnish Application</span>
                        </label>
                        <label className="flex items-center space-x-2.5 p-2 rounded-lg bg-teal-50 border border-teal-200 transition-colors cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isRpocComplete}
                                onChange={e => setIsRpocComplete(e.target.checked)}
                                className="w-4 h-4 text-teal-600 rounded-sm border-teal-300 focus:ring-teal-500"
                            />
                            <span className="text-xs font-bold text-teal-900">RPOC Completed In Full</span>
                        </label>
                    </div>
                </div>

                {/* Section 3: Oral Health Conditions Table */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Oral Health Conditions (Across Visits)</h2>
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase font-semibold">
                                <tr>
                                    <th className="px-4 py-3 w-1/2">Condition</th>
                                    {[1, 2, 3, 4, 5].map(v => (
                                        <th key={v} className="px-2 py-3 text-center border-l border-slate-200">Visit {v}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {Object.entries(conditions).map(([key, checks], idx) => (
                                    <tr key={key} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                        <td className="px-4 py-2.5 font-medium text-slate-700">{conditionLabels[key]}</td>
                                        {checks.map((isChecked, vIdx) => (
                                            <td key={vIdx} className="px-2 py-2 text-center border-l border-slate-100">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 text-teal-600 rounded-sm border-slate-300 focus:ring-teal-500 cursor-pointer"
                                                    checked={isChecked}
                                                    onChange={(e) => handleConditionChange(key, vIdx, e.target.checked)}
                                                />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Section 4: Tooth Charts */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Dental Arch Tooth Chart</h2>

                    {showPermanent && (
                        <div className="mb-6 p-4 rounded-xl border border-blue-100 bg-blue-50/30">
                            <h3 className="text-sm font-bold text-blue-900 mb-3 border-l-4 border-blue-500 pl-2">Permanent Teeth (Adult)</h3>
                            {renderToothRow('Upper', permTeethUpper, toothChartUpper, setToothChartUpper)}
                            {renderToothRow('Lower', permTeethLower, toothChartLower, setToothChartLower)}
                        </div>
                    )}

                    {showPrimary && (
                        <div className="p-4 rounded-xl border border-teal-100 bg-teal-50/30">
                            <h3 className="text-sm font-bold text-teal-900 mb-3 border-l-4 border-teal-500 pl-2">Primary / Deciduous Teeth (Children)</h3>
                            {renderToothRow('Upper', priTeethUpper, toothChartUpper, setToothChartUpper)}
                            {renderToothRow('Lower', priTeethLower, toothChartLower, setToothChartLower)}
                        </div>
                    )}
                </div>

                {/* Section 5: Indicators (Permanent DMFT and Primary dmft) */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Indicators (DMFT / dmft Indices)</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Permanent Teeth DMFT */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                            <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 font-bold text-slate-800 text-xs uppercase tracking-wide text-center">
                                Permanent Teeth (DMFT)
                            </div>
                            <div className="p-4 space-y-3 bg-white text-xs">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-700">No. of Perm. Teeth Present:</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded-lg" value={permTotal} onChange={e => setPermTotal(e.target.value)} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-700">No. of Perm. Sound Teeth:</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded-lg" value={permSound} onChange={e => setPermSound(e.target.value)} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-700">Decayed Teeth (D):</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded-lg" value={permDecayed} onChange={e => setPermDecayed(e.target.value)} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-700">Missing Teeth (M):</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded-lg" value={permMissing} onChange={e => setPermMissing(e.target.value)} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-700">Filled Teeth (F):</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded-lg" value={permFilled} onChange={e => setPermFilled(e.target.value)} />
                                </div>
                                <div className="flex items-center justify-between pt-3 border-t border-slate-200 mt-2">
                                    <span className="font-bold text-slate-900">Total DMFT (D + M + F):</span>
                                    <span className="w-20 text-center font-bold text-teal-700 text-sm">{totalDmftCalculated}</span>
                                </div>
                            </div>
                        </div>

                        {/* Primary Teeth dmft */}
                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                            <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 font-bold text-slate-800 text-xs uppercase tracking-wide text-center">
                                Primary Teeth (dmft)
                            </div>
                            <div className="p-4 space-y-3 bg-white text-xs">
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-700">No. of Primary Teeth Present:</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded-lg" value={priTotal} onChange={e => setPriTotal(e.target.value)} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-700">No. of Primary Sound Teeth:</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded-lg" value={priSound} onChange={e => setPriSound(e.target.value)} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-700">Decayed Teeth (d):</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded-lg" value={priDecayed} onChange={e => setPriDecayed(e.target.value)} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-700">Missing Teeth (m):</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded-lg" value={priMissing} onChange={e => setPriMissing(e.target.value)} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-700">Filled Teeth (f):</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded-lg" value={priFilled} onChange={e => setPriFilled(e.target.value)} />
                                </div>
                                <div className="flex items-center justify-between pt-3 border-t border-slate-200 mt-2">
                                    <span className="font-bold text-slate-900">Total dmft (d + m + f):</span>
                                    <span className="w-20 text-center font-bold text-teal-700 text-sm">{totalPriDmftCalculated}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Section 6: Diagnosis & Treatment Plan */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>
                        <FileText className="w-4 h-4 mr-2 text-teal-600" />
                        Diagnosis & Recommended Treatment
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className={labelClasses}>Remarks / Clinical Diagnosis</label>
                            <textarea
                                rows={3}
                                value={remarksDiagnosis}
                                onChange={e => setRemarksDiagnosis(e.target.value)}
                                className={inputClasses}
                                placeholder="Diagnosis findings..."
                            />
                        </div>
                        <div>
                            <label className={labelClasses}>Recommended Treatment</label>
                            <textarea
                                rows={3}
                                value={recommendedTreatment}
                                onChange={e => setRecommendedTreatment(e.target.value)}
                                className={inputClasses}
                                placeholder="Recommended treatment plan..."
                            />
                        </div>
                        <div>
                            <label className={labelClasses}>Primary Treatment Procedure</label>
                            <select
                                value={treatmentType}
                                onChange={e => setTreatmentType(e.target.value)}
                                className={inputClasses}
                            >
                                <option value="">Select treatment type...</option>
                                <option value="OP">Oral Prophylaxis (OP)</option>
                                <option value="TF">Topical Fluoride (TF)</option>
                                <option value="FL">Fluoride Varnish (FL)</option>
                                <option value="DS">Dental Sealant (DS)</option>
                                <option value="EXO">Extraction (EXO)</option>
                                <option value="Others">Others</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClasses}>Additional General Remarks</label>
                            <input
                                type="text"
                                value={remarks}
                                onChange={e => setRemarks(e.target.value)}
                                className={inputClasses}
                                placeholder="General clinic remarks..."
                            />
                        </div>
                    </div>
                </div>

                {/* Section 7: Informed Consent */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Parent / Guardian Consent</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex items-center space-x-3 p-4 border border-slate-200 rounded-xl bg-slate-50">
                            <input
                                type="checkbox"
                                id="consent_given"
                                checked={consentGiven}
                                onChange={e => setConsentGiven(e.target.checked)}
                                className="w-4 h-4 text-teal-600 rounded-sm border-slate-300 focus:ring-teal-500 cursor-pointer"
                            />
                            <label htmlFor="consent_given" className="text-xs font-bold text-slate-800 cursor-pointer uppercase">
                                Consent Granted by Parent / Legal Guardian
                            </label>
                        </div>
                        <div>
                            <label className={labelClasses}>Consent Notes</label>
                            <input
                                type="text"
                                value={consentNotes}
                                onChange={e => setConsentNotes(e.target.value)}
                                className={inputClasses}
                                placeholder="e.g. Consent slip signed on file..."
                            />
                        </div>
                    </div>
                </div>

                {/* Actions Footer */}
                <div className="pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-slate-100 mt-8">
                    <p className="text-xs text-slate-500">
                        Saving creates or updates the student's Oral Health dental record and marks the module Completed in their profile.
                    </p>
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm rounded-xl shadow-xs transition-all flex items-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer shrink-0"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Saving Examination...</span>
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                <span>Save Oral Health Record</span>
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default OralHealthForm;
