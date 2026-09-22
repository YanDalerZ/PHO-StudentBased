import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { cn } from '../../lib/utils';
import {
    User,
    Calendar,
    MapPin,
    GraduationCap,
    CheckCircle2,
    Clock,
    FileText,
    Activity,
    Baby,
    Syringe,
    HeartPulse,
    ArrowLeft,
    Loader2,
    Edit3,
    X,
    ShieldAlert,
    Building2,
    XCircle,
    Lock
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getStudent, getLookupModules } from '../../services/api';
import type { Student, AdminModule } from '../../types';
import RegistrationForm from '../RegistrationForm';

const StudentProfile: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [student, setStudent] = useState<Student | null>(null);
    const [moduleConfigs, setModuleConfigs] = useState<AdminModule[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [errorStatus, setErrorStatus] = useState<number | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);

    const loadStudentData = useCallback(async () => {
        if (!id) return;
        try {
            const res = await getStudent(id);
            setStudent(res.data);
            setErrorStatus(null);
            setErrorMessage(null);
        } catch (err: unknown) {
            console.error('Failed to load student:', err);
            let status = 500;
            if (axios.isAxiosError(err) && err.response?.status) {
                status = err.response.status;
            }
            setErrorStatus(status);
            if (status === 403) {
                setErrorMessage('You do not have permission to view or manage this student record.');
            } else if (status === 404) {
                setErrorMessage('Student record not found in the registry.');
            } else {
                setErrorMessage('Failed to load student details. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        let isMounted = true;
        if (id) {
            getStudent(id)
                .then((res) => {
                    if (isMounted) {
                        setStudent(res.data);
                        setErrorStatus(null);
                        setErrorMessage(null);
                        setLoading(false);
                    }
                })
                .catch((err: unknown) => {
                    if (isMounted) {
                        let status = 500;
                        if (axios.isAxiosError(err) && err.response?.status) {
                            status = err.response.status;
                        }
                        setErrorStatus(status);
                        if (status === 403) {
                            setErrorMessage('You do not have permission to view or manage this student record.');
                        } else if (status === 404) {
                            setErrorMessage('Student record not found in the registry.');
                        } else {
                            setErrorMessage('Failed to load student details. Please try again.');
                        }
                        setLoading(false);
                    }
                });

            getLookupModules()
                .then((mods) => {
                    if (isMounted) {
                        setModuleConfigs(mods);
                    }
                })
                .catch((err: unknown) => {
                    console.error('Failed to load module configuration:', err);
                });
        }
        return () => {
            isMounted = false;
        };
    }, [id]);


    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
                <p className="text-sm font-medium text-slate-500">Loading student profile...</p>
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
                    to={`${window.location.pathname.startsWith('/superuser') ? '/superuser' : '/staff'}/students`}
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
                    to={`${window.location.pathname.startsWith('/superuser') ? '/superuser' : '/staff'}/students`}
                    className="mt-6 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition-colors flex items-center"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Registry
                </Link>
            </div>
        );
    }

    const moduleFlags = student.modules || {};

    const modules = [
        {
            id: 'patient-info',
            name: 'Patient Information',
            description: 'Basic health history and consultation details',
            isCompleted: Boolean(moduleFlags.patient_info),
            icon: FileText,
            color: 'teal'
        },
        {
            id: 'oral-health',
            name: 'Oral Health',
            description: 'Dental screening and services',
            isCompleted: Boolean(moduleFlags.oral_health),
            icon: Activity,
            color: 'blue'
        },
        {
            id: 'deworming',
            name: 'Deworming',
            description: 'Deworming administration records',
            isCompleted: Boolean(moduleFlags.deworming),
            icon: Baby,
            color: 'emerald'
        },
        {
            id: 'immunization',
            name: 'Immunization',
            description: 'Vaccination records and status',
            isCompleted: Boolean(moduleFlags.immunization),
            icon: Syringe,
            color: 'rose'
        },
        {
            id: 'vital-signs',
            name: 'Vital Signs',
            description: 'Basic health screening and vital signs',
            isCompleted: Boolean(moduleFlags.vital_signs),
            icon: HeartPulse,
            color: 'indigo'
        }
    ];

    return (
        <div className="space-y-6">
            <Link to={`${window.location.pathname.startsWith('/superuser') ? '/superuser' : '/staff'}/students`} className="text-sm text-slate-500 hover:text-slate-800 flex items-center transition-colors w-fit">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Student Registry
            </Link>

            {/* Student Info Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div className="flex items-start space-x-5">
                        {student.photo_url ? (
                            <img
                                src={student.photo_url}
                                alt={`${student.first_name} ${student.last_name}`}
                                className="h-20 w-20 rounded-2xl object-cover border border-slate-200 shrink-0"
                            />
                        ) : (
                            <div className="h-20 w-20 rounded-2xl bg-teal-100 text-teal-700 font-bold flex items-center justify-center text-3xl shrink-0">
                                {student.first_name[0]}{student.last_name[0]}
                            </div>
                        )}
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                                {student.first_name} {student.middle_name ? `${student.middle_name[0]}. ` : ''}{student.last_name} {student.suffix && student.suffix !== 'NOT APPLICABLE' ? student.suffix : ''}
                            </h1>
                            <div className="mt-1 text-slate-500 flex items-center space-x-2 text-sm">
                                <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-slate-700">LRN: {student.student_lrn}</span>
                            </div>

                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-8 text-sm">
                                <div className="flex items-center text-slate-600">
                                    <User className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
                                    <span>{student.sex}</span>
                                </div>
                                <div className="flex items-center text-slate-600">
                                    <Calendar className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
                                    <span>{student.date_of_birth}</span>
                                </div>
                                <div className="flex items-center text-slate-600">
                                    <GraduationCap className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
                                    <span>{student.grade_level || 'Grade N/A'} {student.section ? `- ${student.section}` : ''}</span>
                                </div>
                                <div className="flex items-center text-slate-600">
                                    <Building2 className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
                                    <span>{student.school_name || `School #${student.school_id || 'N/A'}`}</span>
                                </div>
                                <div className="flex items-center text-slate-600 sm:col-span-2">
                                    <MapPin className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
                                    <span>{student.barangay_name || student.barangay || 'Brgy N/A'}, {student.municipality_name || student.municipality || 'Municipality N/A'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsEditModalOpen(true)}
                        className="px-4 py-2 bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-sm font-medium transition-all w-full md:w-auto flex items-center justify-center space-x-2 cursor-pointer shadow-xs"
                    >
                        <Edit3 className="w-4 h-4 text-slate-600" />
                        <span>Edit Profile</span>
                    </button>
                </div>
            </div>

            {/* Modules Section */}
            <div>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-slate-900">Health Modules</h2>
                    <span className="text-xs text-slate-500 font-medium">Click a module to enter or view records</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {modules.map((mod) => {
                        const Icon = mod.icon;
                        const config = moduleConfigs.find((c) => c.slug === mod.id);
                        const isActive = config ? config.is_active : true;

                        if (!isActive) {
                            return (
                                <div
                                    key={mod.id}
                                    onClick={() =>
                                        toast.error(
                                            `The ${mod.name} module is currently deactivated by the administrator.`
                                        )
                                    }
                                    className="group relative bg-slate-50/80 dark:bg-slate-900/40 border border-dashed border-slate-300 dark:border-slate-700/80 p-5 rounded-2xl shadow-xs opacity-65 flex flex-col justify-between h-40 overflow-hidden cursor-not-allowed select-none transition-all"
                                    title={`${mod.name} is currently deactivated by the administrator`}
                                >
                                    <div className="flex justify-between items-start z-10">
                                        <div className="p-2.5 rounded-xl border bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400">
                                            <Icon className="w-5 h-5" />
                                        </div>

                                        <span className="flex items-center space-x-1 text-xs font-medium text-slate-500 bg-slate-200/60 dark:bg-slate-800 px-2.5 py-1 rounded-full border border-slate-300/80 dark:border-slate-700">
                                            <XCircle className="w-3.5 h-3.5 text-slate-400" />
                                            <span>Deactivated</span>
                                        </span>
                                    </div>

                                    <div className="z-10 mt-auto">
                                        <div className="flex items-center space-x-1.5">
                                            <h3 className="font-bold text-slate-600 dark:text-slate-400">
                                                {mod.name}
                                            </h3>
                                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                                        </div>
                                        <p className="text-xs text-rose-500/90 dark:text-rose-400 mt-1 font-medium">
                                            Unavailable (Deactivated by PHO)
                                        </p>
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <Link
                                key={mod.id}
                                to={`${window.location.pathname.startsWith('/superuser') ? '/superuser' : '/staff'}/students/${student.id}/${mod.id}`}
                                className="group relative bg-white border border-slate-200 p-5 rounded-2xl shadow-sm hover:shadow-md hover:border-teal-200 transition-all flex flex-col justify-between h-40 overflow-hidden"
                            >
                                {/* Background accent */}
                                <div className={cn(
                                    "absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-10 group-hover:scale-150 transition-transform duration-500",
                                    `bg-${mod.color}-500`
                                )} />

                                <div className="flex justify-between items-start z-10">
                                    <div className={cn(
                                        "p-2.5 rounded-xl border flex items-center justify-center",
                                        `bg-${mod.color}-50 border-${mod.color}-100 text-${mod.color}-600`
                                    )}>
                                        <Icon className="w-5 h-5" />
                                    </div>

                                    {mod.isCompleted ? (
                                        <span className="flex items-center space-x-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            <span>Completed</span>
                                        </span>
                                    ) : (
                                        <span className="flex items-center space-x-1 text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100">
                                            <Clock className="w-3.5 h-3.5" />
                                            <span>Pending</span>
                                        </span>
                                    )}
                                </div>

                                <div className="z-10 mt-auto">
                                    <h3 className="font-bold text-slate-900 group-hover:text-teal-700 transition-colors">{mod.name}</h3>
                                    <p className="text-xs text-slate-500 mt-1">{mod.description}</p>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* Edit Student Modal */}
            {isEditModalOpen && student && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 md:p-6 overflow-y-auto"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col relative overflow-hidden">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sticky top-0 bg-white z-20 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="h-2 w-2 rounded-full bg-teal-600"></div>
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Edit Student Record</h2>
                                    <p className="text-xs text-slate-500 mt-0.5">Editing {student.first_name} {student.last_name}</p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setIsEditModalOpen(false)}
                                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-200"
                                aria-label="Close Modal"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Form Content */}
                        <div className="p-6 md:p-8 overflow-y-auto flex-1 text-slate-800">
                            <RegistrationForm
                                mode="edit"
                                studentId={student.id}
                                initialData={student}
                                onClose={() => setIsEditModalOpen(false)}
                                onSuccess={(updated) => {
                                    setIsEditModalOpen(false);
                                    if (updated) {
                                        setStudent(prev => ({ ...prev, ...updated }));
                                    } else {
                                        loadStudentData();
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudentProfile;

