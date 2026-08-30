import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMockData } from '../../context/MockDataContext';
import { ArrowLeft, Save, CheckCircle2 } from 'lucide-react';

const OralHealthForm: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { students, moduleStatuses, updateModuleStatus } = useMockData();
    const [isSaving, setIsSaving] = useState(false);
    
    const student = students.find(s => s.id === Number(id));
    const status = moduleStatuses[Number(id)]?.oralHealth;

    if (!student) return <div>Student not found</div>;

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setTimeout(() => {
            updateModuleStatus(Number(id), 'oralHealth', 'Completed');
            setIsSaving(false);
            navigate(`/teacher/students/${id}`);
        }, 800);
    };

    const inputClasses = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all";
    const labelClasses = "block text-sm font-medium text-slate-700 mb-1";
    const sectionClasses = "space-y-6 pt-6 mt-6 border-t border-slate-100";
    const sectionTitleClasses = "text-lg font-semibold text-slate-800 mb-4";

    return (
        <div className="space-y-6 pb-12">
            <Link to={`/teacher/students/${id}`} className="text-sm text-slate-500 hover:text-blue-600 flex items-center transition-colors w-fit">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Student Profile
            </Link>

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Oral Health</h1>
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
                
                {/* Examination Info */}
                <div>
                    <h2 className={sectionTitleClasses}>Examination Details</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className={labelClasses}>Date Examined</label>
                            <input type="date" className={inputClasses} />
                        </div>
                        <div>
                            <label className={labelClasses}>Oral Health Condition</label>
                            <input type="text" className={inputClasses} placeholder="General condition..." />
                        </div>
                    </div>
                </div>

                {/* Permanent Teeth */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Permanent Teeth Indices</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                        <div>
                            <label className={labelClasses}>Total</label>
                            <input type="number" min="0" className={inputClasses} placeholder="0" />
                        </div>
                        <div>
                            <label className={labelClasses}>Sound</label>
                            <input type="number" min="0" className={inputClasses} placeholder="0" />
                        </div>
                        <div>
                            <label className={labelClasses}>Decayed (D)</label>
                            <input type="number" min="0" className={inputClasses} placeholder="0" />
                        </div>
                        <div>
                            <label className={labelClasses}>Missing (M)</label>
                            <input type="number" min="0" className={inputClasses} placeholder="0" />
                        </div>
                        <div>
                            <label className={labelClasses}>Filled (F)</label>
                            <input type="number" min="0" className={inputClasses} placeholder="0" />
                        </div>
                        <div>
                            <label className={labelClasses}>Total DMFT</label>
                            <input type="number" min="0" className={inputClasses} placeholder="0" readOnly />
                        </div>
                    </div>
                </div>

                {/* Primary Teeth */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Primary Teeth Indices</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                        <div>
                            <label className={labelClasses}>Total</label>
                            <input type="number" min="0" className={inputClasses} placeholder="0" />
                        </div>
                        <div>
                            <label className={labelClasses}>Sound</label>
                            <input type="number" min="0" className={inputClasses} placeholder="0" />
                        </div>
                        <div>
                            <label className={labelClasses}>Decayed (d)</label>
                            <input type="number" min="0" className={inputClasses} placeholder="0" />
                        </div>
                        <div>
                            <label className={labelClasses}>Missing (m)</label>
                            <input type="number" min="0" className={inputClasses} placeholder="0" />
                        </div>
                        <div>
                            <label className={labelClasses}>Filled (f)</label>
                            <input type="number" min="0" className={inputClasses} placeholder="0" />
                        </div>
                        <div>
                            <label className={labelClasses}>Total dmft</label>
                            <input type="number" min="0" className={inputClasses} placeholder="0" readOnly />
                        </div>
                    </div>
                </div>

                {/* Diagnosis & Treatment */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Diagnosis & Treatment</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                            <label className={labelClasses}>Remarks / Diagnosis</label>
                            <textarea rows={2} className={inputClasses} placeholder="Clinical findings..."></textarea>
                        </div>
                        <div className="md:col-span-2">
                            <label className={labelClasses}>Recommended Treatment</label>
                            <textarea rows={2} className={inputClasses} placeholder="Treatment plan..."></textarea>
                        </div>
                        <div>
                            <label className={labelClasses}>Treatment Type Rendered</label>
                            <select className={inputClasses}>
                                <option value="">Select treatment...</option>
                                <option value="OP">Oral Prophylaxis (OP)</option>
                                <option value="TF">Topical Fluoride (TF)</option>
                                <option value="FL">Fluoride Varnish (FL)</option>
                                <option value="DS">Dental Sealant (DS)</option>
                                <option value="EXO">Extraction (EXO)</option>
                                <option value="Others">Others</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Consent */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Consent</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg bg-slate-50">
                            <input type="checkbox" id="consent_given" className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                            <label htmlFor="consent_given" className="text-sm font-medium text-slate-700">Consent Given by Parent/Guardian</label>
                        </div>
                        <div className="md:col-span-2">
                            <label className={labelClasses}>Consent Notes</label>
                            <textarea rows={2} className={inputClasses} placeholder="Additional notes regarding consent..."></textarea>
                        </div>
                    </div>
                </div>

                <div className="pt-8 flex justify-end">
                    <button 
                        type="submit" 
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-xl shadow-sm transition-all flex items-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        <Save className="w-4 h-4" />
                        <span>{isSaving ? 'Saving...' : 'Save & Mark Complete'}</span>
                    </button>
                </div>
            </form>
        </div>
    );
};

export default OralHealthForm;
