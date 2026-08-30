import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMockData } from '../../context/MockDataContext';
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
    BrainCircuit,
    Syringe,
    ArrowLeft
} from 'lucide-react';

const StudentProfile: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { students, moduleStatuses } = useMockData();
    
    const student = students.find(s => s.id === Number(id));
    const statuses = moduleStatuses[Number(id)];

    if (!student || !statuses) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <h2 className="text-xl font-bold text-slate-800">Student not found</h2>
                <Link to="/teacher/students" className="mt-4 text-teal-600 hover:underline flex items-center">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Registry
                </Link>
            </div>
        );
    }

    const modules = [
        {
            id: 'patient-info',
            name: 'Patient Information',
            description: 'Basic health history and consultation details',
            status: statuses.patientInfo,
            icon: FileText,
            color: 'teal'
        },
        {
            id: 'oral-health',
            name: 'Oral Health',
            description: 'Dental screening and services',
            status: statuses.oralHealth,
            icon: Activity,
            color: 'blue'
        },
        {
            id: 'deworming',
            name: 'Deworming',
            description: 'Deworming administration records',
            status: statuses.deworming,
            icon: Baby,
            color: 'emerald'
        },
        {
            id: 'headss',
            name: 'HEADSS Profiling',
            description: 'Adolescent health screening',
            status: statuses.headss,
            icon: BrainCircuit,
            color: 'indigo'
        },
        {
            id: 'immunization',
            name: 'Immunization',
            description: 'Vaccination records and status',
            status: statuses.immunization,
            icon: Syringe,
            color: 'rose'
        }
    ];

    return (
        <div className="space-y-6">
            <Link to="/teacher/students" className="text-sm text-slate-500 hover:text-slate-800 flex items-center transition-colors w-fit">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Student Registry
            </Link>

            {/* Student Info Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div className="flex items-start space-x-5">
                        <div className="h-20 w-20 rounded-2xl bg-teal-100 text-teal-700 font-bold flex items-center justify-center text-3xl shrink-0">
                            {student.first_name[0]}{student.last_name[0]}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                                {student.first_name} {student.middle_name ? `${student.middle_name[0]}. ` : ''}{student.last_name} {student.suffix || ''}
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
                                    <span>{student.grade_level} - {student.section}</span>
                                </div>
                                <div className="flex items-center text-slate-600">
                                    <MapPin className="w-4 h-4 mr-2 text-slate-400 shrink-0" />
                                    <span>{student.barangay || 'No address'}, {student.municipality || ''}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <button className="px-4 py-2 bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-sm font-medium transition-all w-full md:w-auto">
                        Edit Profile
                    </button>
                </div>
            </div>

            {/* Modules Section */}
            <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-4">Health Modules</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {modules.map((mod) => {
                        const Icon = mod.icon;
                        const isCompleted = mod.status === 'Completed';
                        
                        return (
                            <Link 
                                key={mod.id}
                                to={`/teacher/students/${student.id}/${mod.id}`}
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
                                    
                                    {isCompleted ? (
                                        <span className="flex items-center space-x-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            <span>Completed</span>
                                        </span>
                                    ) : (
                                        <span className="flex items-center space-x-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full border border-amber-100">
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
        </div>
    );
};

export default StudentProfile;
