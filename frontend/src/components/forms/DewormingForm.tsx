import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMockData } from '../../context/MockDataContext';
import { ArrowLeft, Save, CheckCircle2 } from 'lucide-react';

const DewormingForm: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { students, moduleStatuses, updateModuleStatus } = useMockData();
    const [isSaving, setIsSaving] = useState(false);
    
    const student = students.find(s => s.id === Number(id));
    const status = moduleStatuses[Number(id)]?.deworming;

    if (!student) return <div>Student not found</div>;

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setTimeout(() => {
            updateModuleStatus(Number(id), 'deworming', 'Completed');
            setIsSaving(false);
            navigate(`/teacher/students/${id}`);
        }, 800);
    };

    const inputClasses = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 transition-all";
    const labelClasses = "block text-sm font-medium text-slate-700 mb-1";
    const sectionClasses = "space-y-6 pt-6 mt-6 border-t border-slate-100";
    const sectionTitleClasses = "text-lg font-semibold text-slate-800 mb-4";

    return (
        <div className="space-y-6 pb-12">
            <Link to={`/teacher/students/${id}`} className="text-sm text-slate-500 hover:text-purple-600 flex items-center transition-colors w-fit">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Student Profile
            </Link>

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Deworming</h1>
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
                
                {/* Administration Info */}
                <div>
                    <h2 className={sectionTitleClasses}>Administration Details</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className={labelClasses}>Date Dewormed</label>
                            <input type="date" className={inputClasses} required />
                        </div>
                        <div>
                            <label className={labelClasses}>Age Group</label>
                            <select className={inputClasses}>
                                <option value="">Select Age Group...</option>
                                <option value="1-4">1-4 years old</option>
                                <option value="5-9">5-9 years old</option>
                                <option value="10-14">10-14 years old</option>
                                <option value="15-19">15-19 years old</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelClasses}>Medication Given</label>
                            <input type="text" className={inputClasses} placeholder="e.g. Albendazole 400mg" />
                        </div>
                        <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg bg-slate-50 md:mt-6">
                            <input type="checkbox" id="is_dewormed" className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                            <label htmlFor="is_dewormed" className="text-sm font-medium text-slate-700">Successfully Dewormed</label>
                        </div>
                    </div>
                </div>

                {/* School Context */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>School Context</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className={labelClasses}>School Type</label>
                            <select className={inputClasses}>
                                <option value="public">Public</option>
                                <option value="private">Private</option>
                            </select>
                        </div>
                        <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg bg-slate-50 md:mt-6">
                            <input type="checkbox" id="in_school" defaultChecked className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500" />
                            <label htmlFor="in_school" className="text-sm font-medium text-slate-700">Currently in School</label>
                        </div>
                    </div>
                </div>

                {/* Remarks */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Additional Information</h2>
                    <div>
                        <label className={labelClasses}>Remarks</label>
                        <textarea rows={3} className={inputClasses} placeholder="Any adverse reactions, notes on refusal, or other observations..."></textarea>
                    </div>
                </div>

                <div className="pt-8 flex justify-end">
                    <button 
                        type="submit" 
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm rounded-xl shadow-sm transition-all flex items-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        <Save className="w-4 h-4" />
                        <span>{isSaving ? 'Saving...' : 'Save & Mark Complete'}</span>
                    </button>
                </div>
            </form>
        </div>
    );
};

export default DewormingForm;
