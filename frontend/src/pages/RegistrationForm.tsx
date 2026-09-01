import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
    User, MapPin, GraduationCap, ChevronRight, ChevronLeft,
    CheckCircle2, Loader2, Save, Building2, X, AlertCircle, Camera
} from 'lucide-react';
import { 
    PREFIX_OPTIONS, SUFFIX_OPTIONS, CIVIL_STATUS_OPTIONS,
    EDUCATIONAL_ATTAINMENT_OPTIONS, EMPLOYMENT_STATUS_OPTIONS,
    BLOOD_TYPE_OPTIONS, RELIGION_OPTIONS,
    INDIGENOUS_GROUP_OPTIONS, PWD_TYPE_OPTIONS,
    PHILHEALTH_STATUS_OPTIONS, PHILHEALTH_CATEGORY_OPTIONS
} from '../utils/constants';
import { getMunicipalities, getBarangays, getSchools } from '../services/api';
import { useMockData } from '../context/MockDataContext';
import type { Student, Municipality, Barangay, School } from '../types';
import { cn } from '../lib/utils';
import logo from '../assets/images/logo.jpg';

interface RegistrationFormProps {
    onClose?: () => void;
}

const INITIAL_STATE: Student = {
    photo_base64: '',
    prefix: '',
    student_lrn: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    suffix: '',
    date_of_birth: '',
    sex: 'Male',
    birth_place: '',
    mother_first_name: '',
    mother_last_name: '',
    mother_middle_name: '',
    mother_birth_date: '',
    address: '',
    barangay: '',
    municipality: '',
    province: 'Aklan',
    contact_no: '',
    parent_guardian_name: '',
    parent_guardian_contact: '',
    school_id: 0,
    grade_level: '',
    section: '',
    
    // Patient Info (Part II)
    civil_status: '',
    educational_attainment: '',
    employment_status: '',
    tin_no: '',
    religion: '',
    indigenous: undefined,
    indigenous_group: '',
    blood_type: '',

    // Address and Contact Info (Part III)
    country: 'Philippines',
    region: 'Region VI',
    zip_code: '',
    email: '',
    landline_no: '',
    psa_national_id: '',

    // Other Info (Part IV - 4Ps & PWD)
    dswd_4ps: undefined,
    dswd_4ps_no: '',
    is_pwd: undefined,
    pwd_type: '',
    pwd_id_no: '',

    // Philhealth Info (Part V)
    philhealth_member: undefined,
    philhealth_id: '',
    philhealth_status_type: '',
    philhealth_category: ''
};

const RegistrationForm: React.FC<RegistrationFormProps> = ({ onClose }) => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState<Student>(INITIAL_STATE);
    const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(false);
    const { registerStudent } = useMockData();

    // Cascading Dropdown States
    const [municipalities, setMunicipalities] = useState<Municipality[]>([]);
    const [barangays, setBarangays] = useState<Barangay[]>([]);
    const [schools, setSchools] = useState<School[]>([]);

    useEffect(() => {
        getMunicipalities().then(setMunicipalities);
    }, []);

    useEffect(() => {
        if (formData.municipality) {
            getBarangays(formData.municipality).then(setBarangays);
            setFormData(prev => ({ ...prev, barangay: '', school_id: 0 }));
            setSchools([]);
        }
    }, [formData.municipality]);

    useEffect(() => {
        if (formData.barangay) {
            getSchools(formData.barangay).then(setSchools);
            setFormData(prev => ({ ...prev, school_id: 0 }));
        }
    }, [formData.barangay]);

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, photo_base64: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'school_id' ? parseInt(value) || 0 : value
        }));
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name } = e.target;
        setTouchedFields(prev => ({ ...prev, [name]: true }));
    };

    const isFieldInvalid = (name: keyof Student, isRequired = true): boolean => {
        if (!isRequired) return false;
        if (!touchedFields[name]) return false;

        const value = formData[name];
        if (typeof value === 'number') return value === 0;
        return !value || String(value).trim() === '';
    };

    const markStepFieldsTouched = (currentStep: number) => {
        const fieldsToTouch: Record<string, boolean> = {};
        if (currentStep === 1) {
            fieldsToTouch.student_lrn = true;
            fieldsToTouch.prefix = true;
            fieldsToTouch.first_name = true;
            fieldsToTouch.middle_name = true;
            fieldsToTouch.last_name = true;
            fieldsToTouch.date_of_birth = true;
        } else if (currentStep === 2) {
            fieldsToTouch.municipality = true;
            fieldsToTouch.barangay = true;
        } else if (currentStep === 3) {
            fieldsToTouch.school_id = true;
            fieldsToTouch.grade_level = true;
        }
        setTouchedFields(prev => ({ ...prev, ...fieldsToTouch }));
    };

    const validateStep = (currentStep: number): boolean => {
        markStepFieldsTouched(currentStep);

        if (currentStep === 1) {
            if (!formData.student_lrn.trim()) {
                toast.error('Please enter the Learner Reference Number (LRN).');
                return false;
            }
            if (!formData.prefix) {
                toast.error('Please select a Prefix.');
                return false;
            }
            if (!formData.first_name.trim() || !formData.last_name.trim() || !formData.middle_name.trim()) {
                toast.error('First Name, Middle Name, and Last Name are required.');
                return false;
            }
            if (!formData.date_of_birth) {
                toast.error('Please enter the Date of Birth.');
                return false;
            }
        } else if (currentStep === 2) {
            if (!formData.municipality) {
                toast.error('Please select a Municipality.');
                return false;
            }
            if (!formData.barangay) {
                toast.error('Please select a Barangay.');
                return false;
            }
            if (!formData.dswd_4ps) {
                toast.error('Please specify if the student is a DSWD 4Ps member.');
                return false;
            }
            if (!formData.is_pwd) {
                toast.error('Please specify if the student is a Person With Disability.');
                return false;
            }
            if (formData.is_pwd === 'Yes' && !formData.pwd_type) {
                toast.error('Please select a PWD Type.');
                return false;
            }
            if (!formData.philhealth_member) {
                toast.error('Please specify Philhealth membership.');
                return false;
            }
            if (formData.philhealth_member === 'Yes') {
                if (!formData.philhealth_id || !formData.philhealth_status_type || !formData.philhealth_category) {
                    toast.error('Please complete all Philhealth details.');
                    return false;
                }
            }
        } else if (currentStep === 3) {
            if (!formData.school_id) {
                toast.error('Please select a School.');
                return false;
            }
            if (!formData.grade_level) {
                toast.error('Please select a Grade Level.');
                return false;
            }
        }
        return true;
    };

    const handleNext = (e: React.MouseEvent) => {
        e.preventDefault();
        if (validateStep(step)) {
            setStep(prev => Math.min(prev + 1, 3));
        }
    };

    const handlePrev = (e: React.MouseEvent) => {
        e.preventDefault();
        if (step === 1) {
            if (onClose) {
                onClose();
            } else {
                navigate('/teacher/students');
            }
        } else {
            setStep(prev => Math.max(prev - 1, 1));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateStep(3)) return;

        setLoading(true);
        try {
            registerStudent(formData);
            toast.success('Registration successful! Redirecting...', {
                style: {
                    background: '#f0fdf4',
                    color: '#14532d',
                    border: '1px solid #bbf7d0'
                },
                iconTheme: { primary: '#16a34a', secondary: '#fff' }
            });
            setTimeout(() => {
                if (onClose) {
                    onClose();
                } else {
                    navigate('/teacher/students');
                }
            }, 2000);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to register student';
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const StepIndicator = () => (
        <div className="flex items-center justify-between mb-8 relative px-2 sm:px-6">
            <div className="absolute top-1/2 left-6 right-6 h-0.5 bg-emerald-100 -z-0 transform -translate-y-1/2"></div>
            <div
                className="absolute top-1/2 left-6 h-0.5 bg-emerald-600 -z-0 transform -translate-y-1/2 transition-all duration-300"
                style={{ width: `calc(${((step - 1) / 2) * 100}% - 1rem)` }}
            ></div>

            {[
                { num: 1, icon: User, label: "Personal" },
                { num: 2, icon: MapPin, label: "Contact" },
                { num: 3, icon: GraduationCap, label: "Academic" }
            ].map((s) => (
                <div key={s.num} className="flex flex-col items-center relative z-10">
                    <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-200 font-semibold",
                        step > s.num
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : step === s.num
                                ? "bg-white border-emerald-600 text-emerald-600 ring-4 ring-emerald-50"
                                : "bg-white border-slate-200 text-slate-400"
                    )}>
                        {step > s.num ? <CheckCircle2 className="w-5 h-5" /> : <s.icon className="w-5 h-5" />}
                    </div>
                    <span className={cn(
                        "mt-2 text-xs font-semibold tracking-wide uppercase",
                        step >= s.num ? "text-emerald-900" : "text-slate-400"
                    )}>
                        {s.label}
                    </span>
                </div>
            ))}
        </div>
    );

    const getInputClasses = (fieldName: keyof Student, isRequired = true) => cn(
        "w-full px-3.5 py-2.5 rounded-lg bg-white border text-black placeholder-slate-400 focus:outline-none focus:ring-2 transition-colors text-sm",
        isFieldInvalid(fieldName, isRequired)
            ? "border-red-500 bg-red-50/20 text-red-900 focus:ring-red-500 focus:border-red-500"
            : "border-slate-300 focus:ring-emerald-500 focus:border-emerald-500"
    );

    const getSelectClasses = (fieldName: keyof Student, isRequired = true) => cn(
        getInputClasses(fieldName, isRequired),
        "appearance-none bg-no-repeat pr-10"
    );

    const labelClasses = "block text-xs font-semibold text-black uppercase tracking-wider mb-1.5 flex items-center justify-between";

    return (
        <div className="min-h-screen bg-white text-black font-sans py-6 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
            {/* Background Watermark */}
            <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center overflow-hidden opacity-[0.03]">
                <img
                    src={logo}
                    alt="PHO Watermark"
                    className="w-[80vw] max-w-[700px] object-contain grayscale"
                />
            </div>

            <div className="max-w-3xl mx-auto relative z-10">
                {/* Header */}
                <div className="text-center mb-6 relative">
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="absolute right-0 top-0 p-2 text-slate-400 hover:text-black hover:bg-slate-100 rounded-lg transition-colors"
                            aria-label="Close modal"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                    <div className="inline-flex items-center justify-center p-3 bg-white border border-emerald-100 rounded-xl shadow-sm mb-3">
                        <Building2 className="w-7 h-7 text-emerald-600" />
                    </div>
                    <h1 className="text-3xl font-extrabold text-black tracking-tight mb-2">Student Registration</h1>
                    <p className="text-sm font-medium text-slate-600">Please complete the required details below to register a student profile.</p>
                </div>

                {/* Main Form Container optimized for smooth modal rendering */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm max-h-[85vh] overflow-y-auto transform-gpu">
                    <StepIndicator />

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* STEP 1: Personal Information */}
                        {step === 1 && (
                            <div className="space-y-5">
                                <div className="border-b border-slate-100 pb-3 mb-5">
                                    <h2 className="text-lg font-bold text-black">Personal Details</h2>
                                    <p className="text-xs text-slate-500">Provide the basic identifying information of the student.</p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                                    <div className="sm:col-span-2 space-y-5">
                                        <div>
                                            <label className={labelClasses}>
                                                <span>Learner Reference Number (LRN) *</span>
                                                {isFieldInvalid('student_lrn') && (
                                                    <span className="text-red-600 text-xs flex items-center font-normal lowercase">
                                                        <AlertCircle className="w-3 h-3 mr-1" /> required
                                                    </span>
                                                )}
                                            </label>
                                            <input
                                                required
                                                name="student_lrn"
                                                value={formData.student_lrn}
                                                onChange={handleChange}
                                                onBlur={handleBlur}
                                                className={getInputClasses('student_lrn')}
                                                placeholder="12-digit LRN"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-5">
                                            <div>
                                                <label className={labelClasses}>
                                                    <span>Prefix *</span>
                                                    {isFieldInvalid('prefix') && (
                                                        <span className="text-red-600 text-xs flex items-center font-normal lowercase">
                                                            <AlertCircle className="w-3 h-3 mr-1" /> required
                                                        </span>
                                                    )}
                                                </label>
                                                <select
                                                    required
                                                    name="prefix"
                                                    value={formData.prefix}
                                                    onChange={handleChange}
                                                    onBlur={handleBlur}
                                                    className={getSelectClasses('prefix')}
                                                >
                                                    <option value="">Select Prefix</option>
                                                    {PREFIX_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className={labelClasses}>
                                                    <span>First Name *</span>
                                                    {isFieldInvalid('first_name') && (
                                                        <span className="text-red-600 text-xs flex items-center font-normal lowercase">
                                                            <AlertCircle className="w-3 h-3 mr-1" /> required
                                                        </span>
                                                    )}
                                                </label>
                                                <input
                                                    required
                                                    name="first_name"
                                                    value={formData.first_name}
                                                    onChange={handleChange}
                                                    onBlur={handleBlur}
                                                    className={getInputClasses('first_name')}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="sm:col-span-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50 relative overflow-hidden group">
                                        {formData.photo_base64 ? (
                                            <img src={formData.photo_base64} alt="Student" className="absolute inset-0 w-full h-full object-cover" />
                                        ) : (
                                            <div className="text-center">
                                                <Camera className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                                                <p className="text-xs font-semibold text-slate-500">Upload Photo</p>
                                            </div>
                                        )}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handlePhotoUpload}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        />
                                    </div>
                                    <div className="sm:col-span-1">
                                        <label className={labelClasses}>
                                            <span>Middle Name *</span>
                                            {isFieldInvalid('middle_name') && (
                                                <span className="text-red-600 text-xs flex items-center font-normal lowercase">
                                                    <AlertCircle className="w-3 h-3 mr-1" /> required
                                                </span>
                                            )}
                                        </label>
                                        <input
                                            required
                                            name="middle_name"
                                            value={formData.middle_name}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('middle_name')}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>
                                            <span>Last Name *</span>
                                            {isFieldInvalid('last_name') && (
                                                <span className="text-red-600 text-xs flex items-center font-normal lowercase">
                                                    <AlertCircle className="w-3 h-3 mr-1" /> required
                                                </span>
                                            )}
                                        </label>
                                        <input
                                            required
                                            name="last_name"
                                            value={formData.last_name}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('last_name')}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Suffix (e.g., Jr., III)</label>
                                        <select
                                            name="suffix"
                                            value={formData.suffix}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getSelectClasses('suffix', false)}
                                        >
                                            <option value="">Select Suffix</option>
                                            {SUFFIX_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClasses}>
                                            <span>Date of Birth *</span>
                                            {isFieldInvalid('date_of_birth') && (
                                                <span className="text-red-600 text-xs flex items-center font-normal lowercase">
                                                    <AlertCircle className="w-3 h-3 mr-1" /> required
                                                </span>
                                            )}
                                        </label>
                                        <input
                                            required
                                            type="date"
                                            name="date_of_birth"
                                            value={formData.date_of_birth}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('date_of_birth')}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Sex *</label>
                                        <select
                                            required
                                            name="sex"
                                            value={formData.sex}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getSelectClasses('sex')}
                                        >
                                            <option value="Male">Male</option>
                                            <option value="Female">Female</option>
                                        </select>
                                    </div>
                                    <div className="sm:col-span-2 pt-3">
                                        <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider border-b border-emerald-100 pb-1 mb-4">Other Personal Information</h3>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className={labelClasses}>Birth Place</label>
                                        <input
                                            name="birth_place"
                                            value={formData.birth_place}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('birth_place', false)}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Civil Status</label>
                                        <select
                                            name="civil_status"
                                            value={formData.civil_status}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getSelectClasses('civil_status', false)}
                                        >
                                            <option value="">Select Civil Status</option>
                                            {CIVIL_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Educational Attainment</label>
                                        <select
                                            name="educational_attainment"
                                            value={formData.educational_attainment}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getSelectClasses('educational_attainment', false)}
                                        >
                                            <option value="">Select Attainment</option>
                                            {EDUCATIONAL_ATTAINMENT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Employment Status</label>
                                        <select
                                            name="employment_status"
                                            value={formData.employment_status}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getSelectClasses('employment_status', false)}
                                        >
                                            <option value="">Select Employment</option>
                                            {EMPLOYMENT_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClasses}>TIN No.</label>
                                        <input
                                            name="tin_no"
                                            value={formData.tin_no}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('tin_no', false)}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Religion</label>
                                        <select
                                            name="religion"
                                            value={formData.religion}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getSelectClasses('religion', false)}
                                        >
                                            <option value="">Select Religion</option>
                                            {RELIGION_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Indigenous People?</label>
                                        <select
                                            name="indigenous"
                                            value={formData.indigenous || ''}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getSelectClasses('indigenous', false)}
                                        >
                                            <option value="">Select Yes/No</option>
                                            <option value="Yes">Yes</option>
                                            <option value="No">No</option>
                                        </select>
                                    </div>
                                    {formData.indigenous === 'Yes' && (
                                        <div className="col-span-1 sm:col-span-2">
                                            <label className={labelClasses}>Indigenous (Ethnic Group)</label>
                                            <select
                                                name="indigenous_group"
                                                value={formData.indigenous_group || ''}
                                                onChange={handleChange}
                                                onBlur={handleBlur}
                                                className={getSelectClasses('indigenous_group', false)}
                                            >
                                                <option value="">Select Ethnic Group</option>
                                                {INDIGENOUS_GROUP_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                            </select>
                                        </div>
                                    )}
                                    <div>
                                        <label className={labelClasses}>Blood Type</label>
                                        <select
                                            name="blood_type"
                                            value={formData.blood_type}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getSelectClasses('blood_type', false)}
                                        >
                                            <option value="">Select Blood Type</option>
                                            {BLOOD_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </div>
                                    <div className="sm:col-span-2 pt-3">
                                        <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider border-b border-emerald-100 pb-1 mb-4">Mother's Maiden Name</h3>
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Mother's First Name</label>
                                        <input
                                            name="mother_first_name"
                                            value={formData.mother_first_name}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('mother_first_name', false)}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Mother's Middle Name</label>
                                        <input
                                            name="mother_middle_name"
                                            value={formData.mother_middle_name}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('mother_middle_name', false)}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Mother's Last Name</label>
                                        <input
                                            name="mother_last_name"
                                            value={formData.mother_last_name}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('mother_last_name', false)}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Mother's Date of Birth</label>
                                        <input
                                            type="date"
                                            name="mother_birth_date"
                                            value={formData.mother_birth_date}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('mother_birth_date', false)}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 2: Contact & Address */}
                        {step === 2 && (
                            <div className="space-y-5">
                                <div className="border-b border-slate-100 pb-3 mb-5">
                                    <h2 className="text-lg font-bold text-black">Contact &amp; Location</h2>
                                    <p className="text-xs text-slate-500">Specify the address and primary guardian information.</p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <div className="sm:col-span-2">
                                        <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider border-b border-emerald-100 pb-1 mb-4">Address and Contact Info</h3>
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Country</label>
                                        <input
                                            readOnly
                                            value={formData.country}
                                            className="w-full px-3.5 py-2.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 font-medium cursor-not-allowed text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Region</label>
                                        <input
                                            readOnly
                                            value={formData.region}
                                            className="w-full px-3.5 py-2.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 font-medium cursor-not-allowed text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Province</label>
                                        <input
                                            readOnly
                                            value={formData.province}
                                            className="w-full px-3.5 py-2.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 font-medium cursor-not-allowed text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>
                                            <span>City/Municipality *</span>
                                            {isFieldInvalid('municipality') && (
                                                <span className="text-red-600 text-xs flex items-center font-normal lowercase">
                                                    <AlertCircle className="w-3 h-3 mr-1" /> required
                                                </span>
                                            )}
                                        </label>
                                        <select
                                            required
                                            name="municipality"
                                            value={formData.municipality}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getSelectClasses('municipality')}
                                        >
                                            <option value="">Select Municipality</option>
                                            {municipalities.map(m => (
                                                <option key={m.id} value={m.id}>{m.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClasses}>
                                            <span>Barangay *</span>
                                            {isFieldInvalid('barangay') && (
                                                <span className="text-red-600 text-xs flex items-center font-normal lowercase">
                                                    <AlertCircle className="w-3 h-3 mr-1" /> required
                                                </span>
                                            )}
                                        </label>
                                        <select
                                            required
                                            name="barangay"
                                            value={formData.barangay}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            disabled={!formData.municipality}
                                            className={cn(
                                                getSelectClasses('barangay'),
                                                "disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed"
                                            )}
                                        >
                                            <option value="">Select Barangay</option>
                                            {barangays.map(b => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Number/Street Name/Purok</label>
                                        <input
                                            name="address"
                                            value={formData.address}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('address', false)}
                                            placeholder="House No., Street Name"
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Zip Code</label>
                                        <input
                                            name="zip_code"
                                            value={formData.zip_code}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('zip_code', false)}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Email</label>
                                        <input
                                            type="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('email', false)}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Mobile</label>
                                        <input
                                            name="contact_no"
                                            value={formData.contact_no}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('contact_no', false)}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Landline</label>
                                        <input
                                            name="landline_no"
                                            value={formData.landline_no}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('landline_no', false)}
                                        />
                                    </div>

                                    <div className="sm:col-span-2 pt-3">
                                        <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider border-b border-emerald-100 pb-1 mb-4">Guardian Details</h3>
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Parent / Guardian Name</label>
                                        <input
                                            name="parent_guardian_name"
                                            value={formData.parent_guardian_name}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('parent_guardian_name', false)}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Guardian Contact No.</label>
                                        <input
                                            name="parent_guardian_contact"
                                            value={formData.parent_guardian_contact}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('parent_guardian_contact', false)}
                                            placeholder="09..."
                                        />
                                    </div>

                                    <div className="sm:col-span-2 pt-3">
                                        <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider border-b border-emerald-100 pb-1 mb-4">Other Info</h3>
                                    </div>
                                    <div>
                                        <label className={labelClasses}>
                                            <span>DSWD 4Ps member *</span>
                                            {isFieldInvalid('dswd_4ps') && (
                                                <span className="text-red-600 text-xs flex items-center font-normal lowercase">
                                                    <AlertCircle className="w-3 h-3 mr-1" /> required
                                                </span>
                                            )}
                                        </label>
                                        <select
                                            required
                                            name="dswd_4ps"
                                            value={formData.dswd_4ps || ''}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getSelectClasses('dswd_4ps')}
                                        >
                                            <option value="">Select Yes/No</option>
                                            <option value="Yes">Yes</option>
                                            <option value="No">No</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClasses}>4Ps Household Number</label>
                                        <input
                                            name="dswd_4ps_no"
                                            value={formData.dswd_4ps_no}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('dswd_4ps_no', false)}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>
                                            <span>Person With Disability? *</span>
                                            {isFieldInvalid('is_pwd') && (
                                                <span className="text-red-600 text-xs flex items-center font-normal lowercase">
                                                    <AlertCircle className="w-3 h-3 mr-1" /> required
                                                </span>
                                            )}
                                        </label>
                                        <select
                                            required
                                            name="is_pwd"
                                            value={formData.is_pwd || ''}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getSelectClasses('is_pwd')}
                                        >
                                            <option value="">Select Yes/No</option>
                                            <option value="Yes">Yes</option>
                                            <option value="No">No</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClasses}>PWD TYPE {formData.is_pwd === 'Yes' && '*'}</label>
                                        <select
                                            name="pwd_type"
                                            value={formData.pwd_type}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getSelectClasses('pwd_type', formData.is_pwd === 'Yes' && !formData.pwd_type)}
                                        >
                                            <option value="">Select PWD Type</option>
                                            {PWD_TYPE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClasses}>PWD ID</label>
                                        <input
                                            name="pwd_id_no"
                                            value={formData.pwd_id_no}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('pwd_id_no', false)}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>PSA NATIONAL ID #</label>
                                        <input
                                            name="psa_national_id"
                                            value={formData.psa_national_id}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('psa_national_id', false)}
                                        />
                                    </div>

                                    <div className="sm:col-span-2 pt-3">
                                        <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-wider border-b border-emerald-100 pb-1 mb-4">Philhealth Info</h3>
                                    </div>
                                    <div className="sm:col-span-2 sm:w-1/2 pr-0 sm:pr-2.5">
                                        <label className={labelClasses}>
                                            <span>Philhealth Member? *</span>
                                            {isFieldInvalid('philhealth_member') && (
                                                <span className="text-red-600 text-xs flex items-center font-normal lowercase">
                                                    <AlertCircle className="w-3 h-3 mr-1" /> required
                                                </span>
                                            )}
                                        </label>
                                        <select
                                            required
                                            name="philhealth_member"
                                            value={formData.philhealth_member || ''}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getSelectClasses('philhealth_member')}
                                        >
                                            <option value="">Select Yes/No</option>
                                            <option value="Yes">Yes</option>
                                            <option value="No">No</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Philhealth Number {formData.philhealth_member === 'Yes' && '*'}</label>
                                        <input
                                            name="philhealth_id"
                                            value={formData.philhealth_id}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getInputClasses('philhealth_id', formData.philhealth_member === 'Yes' && !formData.philhealth_id)}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Philhealth Status Type {formData.philhealth_member === 'Yes' && '*'}</label>
                                        <select
                                            name="philhealth_status_type"
                                            value={formData.philhealth_status_type}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getSelectClasses('philhealth_status_type', formData.philhealth_member === 'Yes' && !formData.philhealth_status_type)}
                                        >
                                            <option value="">Select Status</option>
                                            {PHILHEALTH_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <label className={labelClasses}>Philhealth Category {formData.philhealth_member === 'Yes' && '*'}</label>
                                        <select
                                            name="philhealth_category"
                                            value={formData.philhealth_category}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            className={getSelectClasses('philhealth_category', formData.philhealth_member === 'Yes' && !formData.philhealth_category)}
                                        >
                                            <option value="">Select Category</option>
                                            {PHILHEALTH_CATEGORY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 3: Academic Info */}
                        {step === 3 && (
                            <div className="space-y-5">
                                <div className="border-b border-slate-100 pb-3 mb-5">
                                    <h2 className="text-lg font-bold text-black">Academic Details</h2>
                                    <p className="text-xs text-slate-500">Select the target school, grade level, and section assignment.</p>
                                </div>

                                <div className="grid grid-cols-1 gap-5">
                                    <div>
                                        <label className={labelClasses}>
                                            <span>School *</span>
                                            {isFieldInvalid('school_id') && (
                                                <span className="text-red-600 text-xs flex items-center font-normal lowercase">
                                                    <AlertCircle className="w-3 h-3 mr-1" /> required
                                                </span>
                                            )}
                                        </label>
                                        <select
                                            required
                                            name="school_id"
                                            value={formData.school_id}
                                            onChange={handleChange}
                                            onBlur={handleBlur}
                                            disabled={!formData.barangay}
                                            className={cn(
                                                getSelectClasses('school_id'),
                                                "disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed"
                                            )}
                                        >
                                            <option value={0}>Select School</option>
                                            {schools.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                        {!formData.barangay && (
                                            <p className="text-xs text-emerald-800 font-medium mt-1.5">Note: Select a Municipality and Barangay first to populate local schools.</p>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                        <div>
                                            <label className={labelClasses}>
                                                <span>Grade Level *</span>
                                                {isFieldInvalid('grade_level') && (
                                                    <span className="text-red-600 text-xs flex items-center font-normal lowercase">
                                                        <AlertCircle className="w-3 h-3 mr-1" /> required
                                                    </span>
                                                )}
                                            </label>
                                            <select
                                                required
                                                name="grade_level"
                                                value={formData.grade_level}
                                                onChange={handleChange}
                                                onBlur={handleBlur}
                                                className={getSelectClasses('grade_level')}
                                            >
                                                <option value="">Select Grade</option>
                                                <option value="Kindergarten">Kindergarten</option>
                                                <option value="Grade 1">Grade 1</option>
                                                <option value="Grade 2">Grade 2</option>
                                                <option value="Grade 3">Grade 3</option>
                                                <option value="Grade 4">Grade 4</option>
                                                <option value="Grade 5">Grade 5</option>
                                                <option value="Grade 6">Grade 6</option>
                                                <option value="Grade 7">Grade 7</option>
                                                <option value="Grade 8">Grade 8</option>
                                                <option value="Grade 9">Grade 9</option>
                                                <option value="Grade 10">Grade 10</option>
                                                <option value="Grade 11">Grade 11</option>
                                                <option value="Grade 12">Grade 12</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelClasses}>Section</label>
                                            <input
                                                name="section"
                                                value={formData.section}
                                                onChange={handleChange}
                                                onBlur={handleBlur}
                                                className={getInputClasses('section', false)}
                                                placeholder="e.g., Section A"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center justify-between pt-6 border-t border-slate-100 mt-8">
                            <button
                                type="button"
                                onClick={handlePrev}
                                disabled={loading}
                                className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-semibold text-black bg-white border border-slate-300 hover:bg-slate-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="w-4 h-4 mr-1 text-black" /> {step === 1 ? 'Cancel' : 'Back'}
                            </button>

                            {step < 3 ? (
                                <button
                                    type="button"
                                    onClick={handleNext}
                                    className="inline-flex items-center px-6 py-2.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all"
                                >
                                    Next <ChevronRight className="w-4 h-4 ml-1" />
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="inline-flex items-center px-6 py-2.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4 mr-2" /> Save Registration
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default RegistrationForm;