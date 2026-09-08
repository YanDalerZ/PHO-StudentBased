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
    Heart,
    Scale,
    Thermometer,
    FileText,
    Calendar,
    User,
} from 'lucide-react';
import {
    getStudent,
    getVitalSignsByStudent,
    createVitalSigns,
    updateVitalSigns,
} from '../../services/api';
import type { Student, VitalSigns, CreateVitalSignsPayload } from '../../types';
import { cn } from '../../lib/utils';

// Helper to compute BMI
const computeBmiValue = (weightStr: string, heightStr: string): number | null => {
    const weight = parseFloat(weightStr);
    const height = parseFloat(heightStr);
    if (isNaN(weight) || isNaN(height) || weight <= 0 || height <= 0) return null;
    const heightM = height / 100;
    return Number((weight / (heightM * heightM)).toFixed(2));
};

// WHO classification badge details
interface BmiCategory {
    label: string;
    badgeClass: string;
}

const getBmiCategory = (bmi: number | null): BmiCategory | null => {
    if (bmi === null) return null;
    if (bmi < 18.5) {
        return {
            label: 'Underweight',
            badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
        };
    }
    if (bmi <= 24.9) {
        return {
            label: 'Normal weight',
            badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
    }
    if (bmi <= 29.9) {
        return {
            label: 'Overweight',
            badgeClass: 'bg-orange-50 text-orange-700 border-orange-200',
        };
    }
    return {
        label: 'Obese',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    };
};

const VitalSignsForm: React.FC = () => {
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
    const [existingRecord, setExistingRecord] = useState<VitalSigns | null>(null);

    // Form inputs
    const [dateChecked, setDateChecked] = useState<string>(
        new Date().toISOString().split('T')[0] ?? ''
    );
    const [systolic, setSystolic] = useState<string>('');
    const [diastolic, setDiastolic] = useState<string>('');
    const [heartRate, setHeartRate] = useState<string>('');
    const [respiratoryRate, setRespiratoryRate] = useState<string>('');
    const [temperature, setTemperature] = useState<string>('');
    const [weightKg, setWeightKg] = useState<string>('');
    const [heightCm, setHeightCm] = useState<string>('');
    const [remarks, setRemarks] = useState<string>('');

    // Load student and vital signs data
    useEffect(() => {
        let isMounted = true;
        if (!id) return;

        Promise.all([
            getStudent(id),
            getVitalSignsByStudent(id).catch((err: unknown) => {
                if (axios.isAxiosError(err) && err.response?.status === 404) {
                    return { data: { vital_signs: null, records: [] } };
                }
                throw err;
            }),
        ])
            .then(([studentRes, vitalSignsRes]) => {
                if (!isMounted) return;
                setStudent(studentRes.data);

                const currentRecord = vitalSignsRes.data.vital_signs;
                if (currentRecord) {
                    setExistingRecord(currentRecord);
                    setDateChecked(currentRecord.date_checked || '');
                    setSystolic(
                        currentRecord.blood_pressure_systolic !== undefined &&
                        currentRecord.blood_pressure_systolic !== null
                            ? String(currentRecord.blood_pressure_systolic)
                            : ''
                    );
                    setDiastolic(
                        currentRecord.blood_pressure_diastolic !== undefined &&
                        currentRecord.blood_pressure_diastolic !== null
                            ? String(currentRecord.blood_pressure_diastolic)
                            : ''
                    );
                    setHeartRate(
                        currentRecord.heart_rate !== undefined && currentRecord.heart_rate !== null
                            ? String(currentRecord.heart_rate)
                            : ''
                    );
                    setRespiratoryRate(
                        currentRecord.respiratory_rate !== undefined &&
                        currentRecord.respiratory_rate !== null
                            ? String(currentRecord.respiratory_rate)
                            : ''
                    );
                    setTemperature(
                        currentRecord.temperature !== undefined && currentRecord.temperature !== null
                            ? String(currentRecord.temperature)
                            : ''
                    );
                    setWeightKg(
                        currentRecord.weight_kg !== undefined && currentRecord.weight_kg !== null
                            ? String(currentRecord.weight_kg)
                            : ''
                    );
                    setHeightCm(
                        currentRecord.height_cm !== undefined && currentRecord.height_cm !== null
                            ? String(currentRecord.height_cm)
                            : ''
                    );
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
                let message = 'Failed to load vital signs record. Please try again.';

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

    // Live computed BMI and category
    const liveBmi = computeBmiValue(weightKg, heightCm);
    const liveCategory = getBmiCategory(liveBmi);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!student || !id) return;

        // Date of birth vs check date validation
        if (student.date_of_birth && dateChecked) {
            const birth = new Date(student.date_of_birth);
            const check = new Date(dateChecked);
            if (check < birth) {
                toast.error('Date checked cannot be earlier than student date of birth');
                return;
            }
        }

        // Systolic vs Diastolic validation
        const sysVal = systolic.trim() ? Number(systolic) : null;
        const diaVal = diastolic.trim() ? Number(diastolic) : null;
        if (sysVal !== null && diaVal !== null && sysVal <= diaVal) {
            toast.error('Systolic blood pressure must be higher than diastolic blood pressure');
            return;
        }

        setIsSaving(true);
        try {
            const payload: CreateVitalSignsPayload = {
                student_id: Number(id),
                date_checked: dateChecked,
                blood_pressure_systolic: sysVal,
                blood_pressure_diastolic: diaVal,
                heart_rate: heartRate.trim() ? Number(heartRate) : null,
                respiratory_rate: respiratoryRate.trim() ? Number(respiratoryRate) : null,
                temperature: temperature.trim() ? Number(temperature) : null,
                weight_kg: weightKg.trim() ? Number(weightKg) : null,
                height_cm: heightCm.trim() ? Number(heightCm) : null,
                bmi: liveBmi,
                remarks: remarks.trim() || null,
            };

            if (existingRecord?.id) {
                await updateVitalSigns(existingRecord.id, payload);
                toast.success('Vital Signs record updated successfully');
            } else {
                await createVitalSigns(payload);
                toast.success('Vital Signs record saved successfully');
            }

            navigate(`${basePath}/students/${id}`);
        } catch (err: unknown) {
            let message = 'Failed to save vital signs record';
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
                <p className="text-sm font-medium text-slate-500">Loading vital signs record...</p>
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
    const inputClasses =
        'w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:bg-white focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-all outline-hidden';
    const labelClasses = 'block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5';
    const sectionClasses = 'pt-6 border-t border-slate-100';
    const sectionTitleClasses = 'text-base font-bold text-slate-900 mb-4 flex items-center';

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
                            <span>Pending Health Check</span>
                        </span>
                    )}
                </div>
            </div>

            {/* Title Card */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start space-x-4">
                    <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-600 shrink-0">
                        <Heart className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">Vital Signs & Anthropometrics</h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Standard physical examination and nutritional baseline monitoring
                        </p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-600">
                            <span className="flex items-center font-medium">
                                <User className="w-3.5 h-3.5 mr-1 text-slate-400" />
                                {student.first_name} {student.last_name}
                            </span>
                            <span>•</span>
                            <span>LRN: <strong className="text-slate-700">{student.student_lrn}</strong></span>
                            <span>•</span>
                            <span>Grade {student.grade_level} {student.section ? `— ${student.section}` : ''}</span>
                        </div>
                    </div>
                </div>

                {existingRecord && (
                    <div className="text-left md:text-right text-xs text-slate-500 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                        <div>Last record ID: #{existingRecord.id}</div>
                        <div>Date checked: {existingRecord.date_checked}</div>
                    </div>
                )}
            </div>

            {/* Form */}
            <form onSubmit={handleSave} className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-xs space-y-8">
                {/* SECTION 1: EXAMINATION DATE */}
                <div>
                    <h2 className={sectionTitleClasses}>
                        <Calendar className="w-4 h-4 mr-2 text-teal-600" />
                        Examination Date
                    </h2>
                    <div className="max-w-xs">
                        <label className={labelClasses}>
                            Date Checked <span className="text-rose-500">*</span>
                        </label>
                        <input
                            type="date"
                            value={dateChecked}
                            onChange={(e) => setDateChecked(e.target.value)}
                            required
                            className={inputClasses}
                        />
                    </div>
                </div>

                {/* SECTION 2: CARDIOVASCULAR & RESPIRATORY VITALS */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>
                        <Activity className="w-4 h-4 mr-2 text-indigo-600" />
                        Cardiovascular & Respiratory Vital Signs
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        <div>
                            <label className={labelClasses}>
                                Systolic BP (mmHg)
                            </label>
                            <input
                                type="number"
                                min={70}
                                max={250}
                                placeholder="e.g. 110"
                                value={systolic}
                                onChange={(e) => setSystolic(e.target.value)}
                                className={inputClasses}
                            />
                            <p className="text-[11px] text-slate-400 mt-1">Normal: 90 - 120 mmHg</p>
                        </div>

                        <div>
                            <label className={labelClasses}>
                                Diastolic BP (mmHg)
                            </label>
                            <input
                                type="number"
                                min={40}
                                max={150}
                                placeholder="e.g. 70"
                                value={diastolic}
                                onChange={(e) => setDiastolic(e.target.value)}
                                className={inputClasses}
                            />
                            <p className="text-[11px] text-slate-400 mt-1">Normal: 60 - 80 mmHg</p>
                        </div>

                        <div>
                            <label className={labelClasses}>
                                Heart Rate (bpm)
                            </label>
                            <input
                                type="number"
                                min={30}
                                max={250}
                                placeholder="e.g. 78"
                                value={heartRate}
                                onChange={(e) => setHeartRate(e.target.value)}
                                className={inputClasses}
                            />
                            <p className="text-[11px] text-slate-400 mt-1">Pulse in beats per minute</p>
                        </div>

                        <div>
                            <label className={labelClasses}>
                                Respiratory Rate (cpm)
                            </label>
                            <input
                                type="number"
                                min={8}
                                max={80}
                                placeholder="e.g. 18"
                                value={respiratoryRate}
                                onChange={(e) => setRespiratoryRate(e.target.value)}
                                className={inputClasses}
                            />
                            <p className="text-[11px] text-slate-400 mt-1">Breaths per minute</p>
                        </div>
                    </div>
                </div>

                {/* SECTION 3: TEMPERATURE */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>
                        <Thermometer className="w-4 h-4 mr-2 text-rose-600" />
                        Body Temperature
                    </h2>
                    <div className="max-w-xs">
                        <label className={labelClasses}>
                            Temperature (°C)
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                step="0.1"
                                min={30.0}
                                max={45.0}
                                placeholder="e.g. 36.6"
                                value={temperature}
                                onChange={(e) => setTemperature(e.target.value)}
                                className={inputClasses}
                            />
                            <span className="absolute right-3.5 top-2.5 text-xs text-slate-400">°C</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">Normal baseline: 36.5°C - 37.5°C</p>
                    </div>
                </div>

                {/* SECTION 4: ANTHROPOMETRICS & BMI CALCULATOR */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>
                        <Scale className="w-4 h-4 mr-2 text-teal-600" />
                        Anthropometric Measurements & BMI
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        <div>
                            <label className={labelClasses}>
                                Weight (kg)
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    min={2.0}
                                    max={300.0}
                                    placeholder="e.g. 42.5"
                                    value={weightKg}
                                    onChange={(e) => setWeightKg(e.target.value)}
                                    className={inputClasses}
                                />
                                <span className="absolute right-3.5 top-2.5 text-xs text-slate-400">kg</span>
                            </div>
                        </div>

                        <div>
                            <label className={labelClasses}>
                                Height (cm)
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.1"
                                    min={40.0}
                                    max={250.0}
                                    placeholder="e.g. 148.0"
                                    value={heightCm}
                                    onChange={(e) => setHeightCm(e.target.value)}
                                    className={inputClasses}
                                />
                                <span className="absolute right-3.5 top-2.5 text-xs text-slate-400">cm</span>
                            </div>
                        </div>

                        {/* Live Computed BMI Box */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                Body Mass Index (BMI)
                            </span>
                            <div className="flex items-center justify-between mt-2">
                                <div className="text-2xl font-bold text-slate-800">
                                    {liveBmi !== null ? liveBmi.toFixed(2) : '—'}
                                </div>
                                {liveCategory && (
                                    <span
                                        className={cn(
                                            'text-xs font-semibold px-2.5 py-1 rounded-full border',
                                            liveCategory.badgeClass
                                        )}
                                    >
                                        {liveCategory.label}
                                    </span>
                                )}
                            </div>
                            <span className="text-[11px] text-slate-400 mt-1">
                                {liveBmi !== null
                                    ? 'Auto-calculated: kg / (m²)'
                                    : 'Enter weight & height to calculate'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* SECTION 5: CLINICAL REMARKS */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>
                        <FileText className="w-4 h-4 mr-2 text-slate-600" />
                        Clinical Observations & Remarks
                    </h2>
                    <div>
                        <label className={labelClasses}>Remarks / Follow-up Notes</label>
                        <textarea
                            rows={3}
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder="Enter any complaints, follow-up recommendations, or clinical observations..."
                            className={inputClasses}
                        />
                    </div>
                </div>

                {/* ACTION BUTTONS */}
                <div className="pt-6 border-t border-slate-100 flex items-center justify-end space-x-3">
                    <Link
                        to={`${basePath}/students/${id}`}
                        className="px-5 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-sm transition-colors"
                    >
                        Cancel
                    </Link>

                    <button
                        type="submit"
                        disabled={isSaving}
                        className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center shadow-xs disabled:opacity-60 cursor-pointer"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Saving Record...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                {existingRecord ? 'Update Vital Signs Record' : 'Save Vital Signs Record'}
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default VitalSignsForm;
