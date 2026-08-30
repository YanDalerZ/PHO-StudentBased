import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
    User, MapPin, GraduationCap, ChevronRight, ChevronLeft,
    CheckCircle2, Loader2, Save, Building2, X
} from 'lucide-react';
import { getMunicipalities, getBarangays, getSchools } from '../services/api';
import { useMockData } from '../context/MockDataContext';
import type { Student, Municipality, Barangay, School } from '../types';
import { cn } from '../lib/utils';
import logo from '../assets/images/logo.jpg';

interface RegistrationFormProps {
    onClose?: () => void;
}

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

const RegistrationForm: React.FC<RegistrationFormProps> = ({ onClose }) => {
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

    // UI Helpers
    const StepIndicator = () => (
        <div className="flex items-center justify-between mb-10 relative px-4 sm:px-8">
            <div className="absolute top-1/2 left-8 right-8 h-0.5 bg-emerald-100 -z-0 transform -translate-y-1/2"></div>
            <div
                className="absolute top-1/2 left-8 h-0.5 bg-emerald-600 -z-0 transform -translate-y-1/2 transition-all duration-500"
                style={{ width: `calc(${((step - 1) / 2) * 100}% - 1rem)` }}
            ></div>

            {[
                { num: 1, icon: User, label: "Personal" },
                { num: 2, icon: MapPin, label: "Contact" },
                { num: 3, icon: GraduationCap, label: "Academic" }
            ].map((s) => (
                <div key={s.num} className="flex flex-col items-center relative z-10">
                    <div className={cn(
                        "w-11 h-11 rounded-full flex items-center justify-center border-2 transition-all duration-300 font-semibold",
                        step > s.num
                            ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                            : step === s.num
                                ? "bg-white border-emerald-600 text-emerald-600 ring-4 ring-emerald-50 shadow-sm"
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

    // Light Theme Specific Classes
    const inputClasses = "w-full px-3.5 py-2.5 rounded-lg bg-white border border-slate-300 text-black placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-sm shadow-sm";
    const selectClasses = cn(inputClasses, "appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23131313%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:9px_9px] bg-[right_14px_center] bg-no-repeat pr-10");
    const labelClasses = "block text-xs font-semibold text-black uppercase tracking-wider mb-1.5";

    return (
        <div className="min-h-screen bg-emerald-50/40 text-black font-sans py-10 px-4 sm:px-6 lg:px-8 relative">
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
                <div className="text-center mb-8 relative">
                    {onClose && (
                        <button
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

                {/* Main Form Card */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-10 shadow-sm">
                    <StepIndicator />

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* STEP 1: Personal Information */}
                        {step === 1 && (
                            <div className="space-y-5">
                                <div className="border-b border-slate-100 pb-3 mb-5">
                                    <h2 className="text-lg font-bold text-black">Personal Details</h2>
                                    <p className="text-xs text-slate-500">Provide the basic identifying information of the student.</p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <div className="sm:col-span-2">
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
                                    <div>
                                        <label className={labelClasses}>First Name *</label>
                                        <input
                                            required
                                            name="first_name"
                                            value={formData.first_name}
                                            onChange={handleChange}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Middle Name</label>
                                        <input
                                            name="middle_name"
                                            value={formData.middle_name}
                                            onChange={handleChange}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Last Name *</label>
                                        <input
                                            required
                                            name="last_name"
                                            value={formData.last_name}
                                            onChange={handleChange}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Suffix (e.g., Jr., III)</label>
                                        <input
                                            name="suffix"
                                            value={formData.suffix}
                                            onChange={handleChange}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Date of Birth *</label>
                                        <input
                                            required
                                            type="date"
                                            name="date_of_birth"
                                            value={formData.date_of_birth}
                                            onChange={handleChange}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div>
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
                            <div className="space-y-5">
                                <div className="border-b border-slate-100 pb-3 mb-5">
                                    <h2 className="text-lg font-bold text-black">Contact &amp; Location</h2>
                                    <p className="text-xs text-slate-500">Specify the address and primary guardian information.</p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    <div>
                                        <label className={labelClasses}>Province *</label>
                                        <input
                                            readOnly
                                            value="Aklan"
                                            className="w-full px-3.5 py-2.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-600 font-medium cursor-not-allowed text-sm"
                                        />
                                    </div>
                                    <div>
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
                                    <div>
                                        <label className={labelClasses}>Barangay *</label>
                                        <select
                                            required
                                            name="barangay"
                                            value={formData.barangay}
                                            onChange={handleChange}
                                            disabled={!formData.municipality}
                                            className={cn(selectClasses, "disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed")}
                                        >
                                            <option value="">Select Barangay</option>
                                            {barangays.map(b => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Street Address</label>
                                        <input
                                            name="address"
                                            value={formData.address}
                                            onChange={handleChange}
                                            className={inputClasses}
                                            placeholder="House No., Street Name"
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
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div>
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
                            <div className="space-y-5">
                                <div className="border-b border-slate-100 pb-3 mb-5">
                                    <h2 className="text-lg font-bold text-black">Academic Details</h2>
                                    <p className="text-xs text-slate-500">Select the target school, grade level, and section assignment.</p>
                                </div>

                                <div className="grid grid-cols-1 gap-5">
                                    <div>
                                        <label className={labelClasses}>School *</label>
                                        <select
                                            required
                                            name="school_id"
                                            value={formData.school_id}
                                            onChange={handleChange}
                                            disabled={!formData.barangay}
                                            className={cn(selectClasses, "disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed")}
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
                                        <div>
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
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4 mr-2" /> Complete Registration
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