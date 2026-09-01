import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMockData } from '../../context/MockDataContext';
import { ArrowLeft, Save, CheckCircle2 } from 'lucide-react';

const VitalSignsForm: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { students, moduleStatuses, updateModuleStatus } = useMockData();
    const [isSaving, setIsSaving] = useState(false);
    
    const student = students.find(s => s.id === Number(id));
    const status = moduleStatuses[Number(id)]?.vitalSigns;

    if (!student) return <div>Student not found</div>;

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setTimeout(() => {
            updateModuleStatus(Number(id), 'vitalSigns', 'Completed');
            setIsSaving(false);
            navigate(`/teacher/students/${id}`);
        }, 800);
    };

    const inputClasses = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 transition-all";
    const labelClasses = "block text-sm font-medium text-slate-700 mb-1";
    const sectionClasses = "space-y-6 pt-6 mt-6 border-t border-slate-100";
    const sectionTitleClasses = "text-lg font-semibold text-slate-800 mb-4";

    return (
        <div className="space-y-6 pb-12">
            <Link to={`/teacher/students/${id}`} className="text-sm text-slate-500 hover:text-indigo-600 flex items-center transition-colors w-fit">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Student Profile
            </Link>

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Vital Signs Record</h1>
                    <p className="text-sm text-slate-500">For {student.first_name} {student.last_name}</p>
                </div>
                {status === 'Completed' && (
                    <span className="flex items-center space-x-1 text-sm font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Completed</span>
                    </span>
                )}
            </div>

            <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                
                {/* VITAL SIGNS */}
                <div>
                    <h2 className={sectionTitleClasses}>Vital Signs</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div>
                            <label className={labelClasses}>
                                BP Systolic <span className="text-red-500">*</span>
                            </label>
                            <input type="number" className={inputClasses} placeholder="mmHg" required />
                        </div>
                        <div>
                            <label className={labelClasses}>
                                BP Diastolic <span className="text-red-500">*</span>
                            </label>
                            <input type="number" className={inputClasses} placeholder="mmHg" required />
                        </div>
                        <div>
                            <label className={labelClasses}>
                                Respiratory Rate <span className="text-red-500">*</span>
                            </label>
                            <input type="text" className={inputClasses} placeholder="cpm" required />
                        </div>
                        <div>
                            <label className={labelClasses}>
                                Body Temp <span className="text-red-500">*</span>
                            </label>
                            <input type="number" step="0.1" className={inputClasses} placeholder="°C" required />
                        </div>
                        <div>
                            <label className={labelClasses}>
                                Heart Rate <span className="text-red-500">*</span>
                            </label>
                            <input type="number" className={inputClasses} placeholder="bpm" required />
                        </div>
                        <div>
                            <label className={labelClasses}>Pulse Rate</label>
                            <input type="number" className={inputClasses} placeholder="bpm" />
                        </div>
                        <div>
                            <label className={labelClasses}>Oxygen Saturation</label>
                            <input type="number" step="0.1" className={inputClasses} placeholder="%" />
                        </div>
                    </div>
                </div>

                {/* ASSESSMENT */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Assessment</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className={labelClasses}>BP Measurement Assessment</label>
                            <select className={inputClasses}>
                                <option value="">Select...</option>
                                <option value="NORMAL">Normal</option>
                                <option value="ELEVATED">Elevated</option>
                                <option value="STAGE_1">High Blood Pressure Stage 1</option>
                                <option value="STAGE_2">High Blood Pressure Stage 2</option>
                                <option value="CRISIS">Hypertensive Crisis</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClasses}>Normal Rate</label>
                            <select className={inputClasses}>
                                <option value="">Select...</option>
                                <option value="YES">Yes</option>
                                <option value="NO">No</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClasses}>Regular Rhythm</label>
                            <select className={inputClasses}>
                                <option value="">Select...</option>
                                <option value="YES">Yes</option>
                                <option value="NO">No</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* ADMINISTRATION */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Administration</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className={labelClasses}>
                                Administered By <span className="text-red-500">*</span>
                            </label>
                            <select className={inputClasses} required>
                                <option value="">Select personnel...</option>
                                <option value="NURSE_1">Maria Santos (School Nurse)</option>
                                <option value="DOCTOR_1">Dr. Juan Dela Cruz</option>
                                <option value="CLINIC_TEACHER">Ana Reyes (Clinic Teacher)</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClasses}>Time</label>
                            <input type="time" className={inputClasses} />
                        </div>
                    </div>
                </div>

                {/* OTHER */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Other</h2>
                    <div>
                        <label className={labelClasses}>Remarks</label>
                        <textarea 
                            className={inputClasses} 
                            rows={3} 
                            placeholder="Any additional observations or notes..."
                        ></textarea>
                    </div>
                </div>

                {/* Submit Button */}
                <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium shadow-sm shadow-indigo-200 transition-all flex items-center disabled:opacity-70"
                    >
                        {isSaving ? (
                            <>
                                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                Save Record
                            </>
                        )}
                    </button>
                </div>

            </form>
        </div>
    );
};

export default VitalSignsForm;
