import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMockData } from '../../context/MockDataContext';
import { ArrowLeft, Save, CheckCircle2 } from 'lucide-react';

const ImmunizationForm: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { students, moduleStatuses, updateModuleStatus } = useMockData();
    const [isSaving, setIsSaving] = useState(false);
    
    const student = students.find(s => s.id === Number(id));
    const status = moduleStatuses[Number(id)]?.immunization;

    if (!student) return <div>Student not found</div>;

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setTimeout(() => {
            updateModuleStatus(Number(id), 'immunization', 'Completed');
            setIsSaving(false);
            navigate(`/teacher/students/${id}`);
        }, 800);
    };

    const inputClasses = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 transition-all";
    const labelClasses = "block text-sm font-medium text-slate-700 mb-1";
    const sectionClasses = "space-y-6 pt-6 mt-6 border-t border-slate-100";
    const sectionTitleClasses = "text-lg font-semibold text-slate-800 mb-4";

    return (
        <div className="space-y-6 pb-12">
            <Link to={`/teacher/students/${id}`} className="text-sm text-slate-500 hover:text-amber-600 flex items-center transition-colors w-fit">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Student Profile
            </Link>

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Immunization Record</h1>
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
                
                {/* Vaccine Details */}
                <div>
                    <h2 className={sectionTitleClasses}>Vaccine Details</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className={labelClasses}>Vaccine Type</label>
                            <select className={inputClasses} required>
                                <option value="">Select Vaccine...</option>
                                <option value="MR">MR (Measles, Rubella)</option>
                                <option value="Td">Td (Tetanus, Diphtheria)</option>
                                <option value="HPV1">HPV Dose 1</option>
                                <option value="HPV2">HPV Dose 2</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClasses}>Date Given</label>
                            <input type="date" className={inputClasses} required />
                        </div>
                        <div>
                            <label className={labelClasses}>Lot / Batch Number</label>
                            <input type="text" className={inputClasses} placeholder="e.g. AB12345C" />
                        </div>
                        <div>
                            <label className={labelClasses}>Vaccinator Name</label>
                            <input type="text" className={inputClasses} placeholder="Name of Health Worker" />
                        </div>
                        <div>
                            <label className={labelClasses}>Supervisor Name</label>
                            <input type="text" className={inputClasses} placeholder="Name of Supervisor" />
                        </div>
                    </div>
                </div>

                {/* Pre-Screening & Consent */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Pre-Screening & Consent</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg bg-slate-50">
                            <input type="checkbox" id="consent_given" className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500" />
                            <label htmlFor="consent_given" className="text-sm font-medium text-slate-700">Consent Given by Parent/Guardian</label>
                        </div>
                        <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg bg-slate-50">
                            <input type="checkbox" id="is_sick_today" className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500" />
                            <label htmlFor="is_sick_today" className="text-sm font-medium text-slate-700">Student is currently sick</label>
                        </div>
                        <div className="md:col-span-2">
                            <label className={labelClasses}>History of Allergies</label>
                            <textarea rows={2} className={inputClasses} placeholder="Any known allergies to vaccines or food..."></textarea>
                        </div>
                    </div>
                </div>

                {/* Deferral & Refusal */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Deferral & Refusal</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg bg-slate-50">
                            <input type="checkbox" id="is_deferred" className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500" />
                            <label htmlFor="is_deferred" className="text-sm font-medium text-slate-700">Vaccination Deferred</label>
                        </div>
                        <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg bg-slate-50">
                            <input type="checkbox" id="is_refused" className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500" />
                            <label htmlFor="is_refused" className="text-sm font-medium text-slate-700">Vaccination Refused</label>
                        </div>
                        <div>
                            <label className={labelClasses}>Refusal Reason Code</label>
                            <select className={inputClasses}>
                                <option value="">Select Reason Code...</option>
                                <option value="1">1 - Fear of side effects</option>
                                <option value="2">2 - Religious beliefs</option>
                                <option value="3">3 - Medical reasons</option>
                                <option value="4">4 - Already vaccinated</option>
                                <option value="5">5 - Parent not present</option>
                                <option value="99">99 - Others</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className={labelClasses}>Refusal Reason Text / Remarks</label>
                            <textarea rows={2} className={inputClasses} placeholder="Detailed explanation for deferral or refusal..."></textarea>
                        </div>
                    </div>
                </div>

                <div className="pt-8 flex justify-end">
                    <button 
                        type="submit" 
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm rounded-xl shadow-sm transition-all flex items-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        <Save className="w-4 h-4" />
                        <span>{isSaving ? 'Saving...' : 'Save & Mark Complete'}</span>
                    </button>
                </div>
            </form>
        </div>
    );
};

export default ImmunizationForm;
