import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { 
    User, MapPin, GraduationCap, ChevronRight, ChevronLeft, 
    CheckCircle2, Loader2, Save, Building2 
} from 'lucide-react';
import { getMunicipalities, getBarangays, getSchools } from '../services/api';
import { useMockData } from '../context/MockDataContext';
import type { Student, Municipality, Barangay, School } from '../types';
import { cn } from '../lib/utils';
import logo from '../assets/images/logo.jpg';

const INITIAL_STATE: Student = {
    student_lrn: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    suffix: '',
    date_of_birth: '',
    sex: 'Male',
    address: '',
    barangay: '',
    municipality: '',
    province: 'Aklan',
    contact_no: '',
    parent_guardian_name: '',
    parent_guardian_contact: '',
    school_id: 0,
    grade_level: '',
    section: ''
};

const RegistrationForm: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState<Student>(INITIAL_STATE);
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

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ 
            ...prev, 
            [name]: name === 'school_id' ? parseInt(value) || 0 : value 
        }));
    };

    const handleNext = (e: React.MouseEvent) => {
        e.preventDefault();
        setStep(prev => Math.min(prev + 1, 3));
    };

    const handlePrev = (e: React.MouseEvent) => {
        e.preventDefault();
        if (step === 1) {
            navigate('/teacher/students');
        } else {
            setStep(prev => Math.max(prev - 1, 1));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            registerStudent(formData);
            toast.success('Registration successful! Redirecting...', {
                style: {
                    background: '#e0f2f1',
                    color: '#004d40',
                    border: '1px solid #14b8a6'
                },
                iconTheme: { primary: '#14b8a6', secondary: '#fff' }
            });
            setTimeout(() => {
                navigate('/teacher/students');
            }, 2000);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to register student';
            toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    // UI Helpers
    const StepIndicator = () => (
        <div className="flex items-center justify-between mb-8 relative">
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-200 dark:bg-slate-700/50 -z-10 transform -translate-y-1/2"></div>
            <div 
                className="absolute top-1/2 left-0 h-0.5 bg-teal-500 -z-10 transform -translate-y-1/2 transition-all duration-500"
                style={{ width: `${((step - 1) / 2) * 100}%` }}
            ></div>
            
            {[
                { num: 1, icon: User, label: "Personal" },
                { num: 2, icon: MapPin, label: "Contact" },
                { num: 3, icon: GraduationCap, label: "Academic" }
            ].map((s) => (
                <div key={s.num} className="flex flex-col items-center">
                    <div className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                        step >= s.num 
                            ? "bg-teal-50 border-teal-500 text-teal-600 dark:bg-teal-900 dark:border-teal-500 dark:text-teal-300 shadow-[0_0_15px_rgba(20,184,166,0.2)]" 
                            : "bg-white border-slate-200 text-slate-400 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-500"
                    )}>
                        {step > s.num ? <CheckCircle2 className="w-6 h-6" /> : <s.icon className="w-5 h-5" />}
                    </div>
                    <span className={cn(
                        "mt-2 text-xs font-medium",
                        step >= s.num ? "text-teal-700 dark:text-teal-400" : "text-slate-500"
                    )}>
                        {s.label}
                    </span>
                </div>
            ))}
        </div>
    );

    // Shared input class string
    const inputClasses = "w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-surface-input border border-slate-200 dark:border-teal-500/30 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all";
    const selectClasses = cn(inputClasses, "appearance-none");
    const labelClasses = "block text-sm font-medium text-slate-700 dark:text-slate-300";

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-surface-dark text-slate-800 dark:text-slate-200 font-outfit py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden transition-colors duration-500">
            {/* Ambient Background Glows */}
            <div className="absolute top-[-10%] left-[-10%] w-2/5 h-2/5 bg-teal-100/50 dark:bg-teal-600/20 rounded-full blur-[120px] pointer-events-none"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-2/5 h-2/5 bg-blue-100/50 dark:bg-blue-600/20 rounded-full blur-[120px] pointer-events-none"></div>

            {/* Background Watermark */}
            <div className="absolute inset-0 pointer-events-none z-0 flex items-center justify-center overflow-hidden opacity-[0.03] dark:opacity-[0.05]">
                <img 
                    src={logo} 
                    alt="PHO Watermark" 
                    className="w-[80vw] max-w-[800px] object-contain grayscale mix-blend-multiply dark:mix-blend-screen"
                />
            </div>
            
            <div className="max-w-3xl mx-auto relative z-10">
                {/* Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center p-3 bg-teal-50 dark:bg-teal-500/10 border border-teal-100 dark:border-teal-500/20 rounded-2xl mb-4">
                        <Building2 className="w-8 h-8 text-teal-600 dark:text-teal-400" />
                    </div>
                    <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">Student Registration</h1>
                    <p className="text-slate-500 dark:text-slate-400">Please fill out the form carefully to register a new student profile.</p>
                </div>

                {/* Form Card */}
                <div className="bg-white dark:bg-surface-card backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-3xl p-6 sm:p-10 shadow-xl dark:shadow-2xl">
                    <StepIndicator />

                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* STEP 1: Personal Information */}
                        {step === 1 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-6">
                                <h2 className="text-xl font-bold text-slate-800 dark:text-white border-b border-slate-100 dark:border-white/10 pb-2 mb-6">Personal Details</h2>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="space-y-2 sm:col-span-2">
                                        <label className={labelClasses}>Learner Reference Number (LRN) *</label>
                                        <input
                                            required
                                            name="student_lrn"
                                            value={formData.student_lrn}
                                            onChange={handleChange}
                                            className={inputClasses}
                                            placeholder="12-digit LRN"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className={labelClasses}>First Name *</label>
                                        <input
                                            required
                                            name="first_name"
                                            value={formData.first_name}
                                            onChange={handleChange}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className={labelClasses}>Middle Name</label>
                                        <input
                                            name="middle_name"
                                            value={formData.middle_name}
                                            onChange={handleChange}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className={labelClasses}>Last Name *</label>
                                        <input
                                            required
                                            name="last_name"
                                            value={formData.last_name}
                                            onChange={handleChange}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className={labelClasses}>Suffix (e.g., Jr., III)</label>
                                        <input
                                            name="suffix"
                                            value={formData.suffix}
                                            onChange={handleChange}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className={labelClasses}>Date of Birth *</label>
                                        <input
                                            required
                                            type="date"
                                            name="date_of_birth"
                                            value={formData.date_of_birth}
                                            onChange={handleChange}
                                            className={cn(inputClasses, "dark:[color-scheme:dark]")}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className={labelClasses}>Sex *</label>
                                        <select
                                            required
                                            name="sex"
                                            value={formData.sex}
                                            onChange={handleChange}
                                            className={selectClasses}
                                        >
                                            <option value="Male">Male</option>
                                            <option value="Female">Female</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 2: Contact & Address */}
                        {step === 2 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-6">
                                <h2 className="text-xl font-bold text-slate-800 dark:text-white border-b border-slate-100 dark:border-white/10 pb-2 mb-6">Contact &amp; Address</h2>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className={labelClasses}>Province *</label>
                                        <input
                                            readOnly
                                            value="Aklan"
                                            className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-surface-input/50 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className={labelClasses}>Municipality *</label>
                                        <select
                                            required
                                            name="municipality"
                                            value={formData.municipality}
                                            onChange={handleChange}
                                            className={selectClasses}
                                        >
                                            <option value="">Select Municipality</option>
                                            {municipalities.map(m => (
                                                <option key={m.id} value={m.id}>{m.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className={labelClasses}>Barangay *</label>
                                        <select
                                            required
                                            name="barangay"
                                            value={formData.barangay}
                                            onChange={handleChange}
                                            disabled={!formData.municipality}
                                            className={cn(selectClasses, "disabled:opacity-50 disabled:bg-slate-100 disabled:cursor-not-allowed")}
                                        >
                                            <option value="">Select Barangay</option>
                                            {barangays.map(b => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className={labelClasses}>Street Address</label>
                                        <input
                                            name="address"
                                            value={formData.address}
                                            onChange={handleChange}
                                            className={inputClasses}
                                            placeholder="House No., Street Name"
                                        />
                                    </div>
                                    
                                    <div className="sm:col-span-2 mt-4">
                                        <h3 className="text-md font-semibold text-teal-600 dark:text-teal-400 mb-4">Guardian Information</h3>
                                    </div>

                                    <div className="space-y-2">
                                        <label className={labelClasses}>Parent/Guardian Name</label>
                                        <input
                                            name="parent_guardian_name"
                                            value={formData.parent_guardian_name}
                                            onChange={handleChange}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className={labelClasses}>Guardian Contact No.</label>
                                        <input
                                            name="parent_guardian_contact"
                                            value={formData.parent_guardian_contact}
                                            onChange={handleChange}
                                            className={inputClasses}
                                            placeholder="09..."
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* STEP 3: Academic Info */}
                        {step === 3 && (
                            <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-6">
                                <h2 className="text-xl font-bold text-slate-800 dark:text-white border-b border-slate-100 dark:border-white/10 pb-2 mb-6">Academic Information</h2>
                                
                                <div className="grid grid-cols-1 gap-6">
                                    <div className="space-y-2">
                                        <label className={labelClasses}>School *</label>
                                        <select
                                            required
                                            name="school_id"
                                            value={formData.school_id}
                                            onChange={handleChange}
                                            disabled={!formData.barangay}
                                            className={cn(selectClasses, "disabled:opacity-50 disabled:bg-slate-100 disabled:cursor-not-allowed")}
                                        >
                                            <option value={0}>Select School</option>
                                            {schools.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                        {!formData.barangay && (
                                            <p className="text-xs text-amber-600 dark:text-amber-500/80 mt-1">Please select a Municipality and Barangay first to load schools.</p>
                                        )}
                                    </div>
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className={labelClasses}>Grade Level *</label>
                                            <select
                                                required
                                                name="grade_level"
                                                value={formData.grade_level}
                                                onChange={handleChange}
                                                className={selectClasses}
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
                                        <div className="space-y-2">
                                            <label className={labelClasses}>Section</label>
                                            <input
                                                name="section"
                                                value={formData.section}
                                                onChange={handleChange}
                                                className={inputClasses}
                                                placeholder="e.g., Section A"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Navigation Buttons */}
                        <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-white/10">
                            <button
                                type="button"
                                onClick={handlePrev}
                                disabled={loading}
                                className="flex items-center px-6 py-3 rounded-xl font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <ChevronLeft className="w-5 h-5 mr-1" /> {step === 1 ? 'Cancel' : 'Back'}
                            </button>
                            
                            {step < 3 ? (
                                <button
                                    type="button"
                                    onClick={handleNext}
                                    className="flex items-center px-6 py-3 rounded-xl font-medium text-white bg-teal-600 hover:bg-teal-700 shadow-lg shadow-teal-600/20 transition-all"
                                >
                                    Next <ChevronRight className="w-5 h-5 ml-1" />
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={loading || formData.school_id === 0}
                                    className="flex items-center px-8 py-3 rounded-xl font-bold text-white bg-primary-action hover:bg-teal-500 dark:bg-gradient-to-r dark:from-teal-500 dark:to-blue-600 dark:hover:from-teal-400 dark:hover:to-blue-500 shadow-lg shadow-teal-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? (
                                        <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing</>
                                    ) : (
                                        <><Save className="w-5 h-5 mr-2" /> Complete Registration</>
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
