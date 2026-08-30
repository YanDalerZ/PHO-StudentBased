import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMockData } from '../../context/MockDataContext';
import { ArrowLeft, Save, CheckCircle2 } from 'lucide-react';

const HeadssForm: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { students, moduleStatuses, updateModuleStatus } = useMockData();
    const [isSaving, setIsSaving] = useState(false);
    
    const student = students.find(s => s.id === Number(id));
    const status = moduleStatuses[Number(id)]?.headss;

    if (!student) return <div>Student not found</div>;

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setTimeout(() => {
            updateModuleStatus(Number(id), 'headss', 'Completed');
            setIsSaving(false);
            navigate(`/teacher/students/${id}`);
        }, 800);
    };

    const inputClasses = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 transition-all";
    const labelClasses = "block text-sm font-medium text-slate-700 mb-1";
    const sectionClasses = "space-y-6 pt-6 mt-6 border-t border-slate-100";
    const sectionTitleClasses = "text-lg font-semibold text-slate-800 mb-4";

    const ScoreSelect = () => (
        <select className={inputClasses}>
            <option value="">Score (0-2)</option>
            <option value="0">0 - No Risk</option>
            <option value="1">1 - Mild Risk</option>
            <option value="2">2 - High Risk</option>
        </select>
    );

    return (
        <div className="space-y-6 pb-12">
            <Link to={`/teacher/students/${id}`} className="text-sm text-slate-500 hover:text-rose-600 flex items-center transition-colors w-fit">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Student Profile
            </Link>

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">HEADSS Assessment</h1>
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
                
                {/* Meta */}
                <div className="mb-6">
                    <label className={labelClasses}>Assessment Date</label>
                    <input type="date" className="w-full sm:w-1/3 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 transition-all" required />
                </div>

                {/* H - Home */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>H - Home</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-3">
                            <textarea rows={2} className={inputClasses} placeholder="Family dynamics, living arrangements..."></textarea>
                        </div>
                        <div className="md:col-span-1">
                            <ScoreSelect />
                        </div>
                    </div>
                </div>

                {/* E - Education & Employment */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>E - Education & Employment</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-3">
                            <textarea rows={2} className={inputClasses} placeholder="School performance, relationships with teachers/peers, part-time work..."></textarea>
                        </div>
                        <div className="md:col-span-1">
                            <ScoreSelect />
                        </div>
                    </div>
                </div>

                {/* A - Activities */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>A - Activities & Peers</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-3">
                            <textarea rows={2} className={inputClasses} placeholder="Hobbies, peer group, screen time..."></textarea>
                        </div>
                        <div className="md:col-span-1">
                            <ScoreSelect />
                        </div>
                    </div>
                </div>

                {/* D - Drugs */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>D - Drugs & Substance Use</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-3">
                            <textarea rows={2} className={inputClasses} placeholder="Tobacco, alcohol, illicit drugs (self or peers)..."></textarea>
                        </div>
                        <div className="md:col-span-1">
                            <ScoreSelect />
                        </div>
                    </div>
                </div>

                {/* S - Sexuality */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>S - Sexuality</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-3">
                            <textarea rows={2} className={inputClasses} placeholder="Sexual activity, orientation, contraception, abuse history..."></textarea>
                        </div>
                        <div className="md:col-span-1">
                            <ScoreSelect />
                        </div>
                    </div>
                </div>

                {/* S - Suicide/Safety */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>S - Suicide & Safety</h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-3">
                            <textarea rows={2} className={inputClasses} placeholder="Mental health, bullying, self-harm, seatbelts, violence..."></textarea>
                        </div>
                        <div className="md:col-span-1">
                            <ScoreSelect />
                        </div>
                    </div>
                </div>

                {/* Conclusion */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Assessment Conclusion</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className={labelClasses}>Overall Risk Level</label>
                            <select className={inputClasses} required>
                                <option value="">Select Risk Level...</option>
                                <option value="low">Low Risk</option>
                                <option value="moderate">Moderate Risk</option>
                                <option value="high">High Risk</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className={labelClasses}>Recommendations / Interventions</label>
                            <textarea rows={3} className={inputClasses} placeholder="Referrals made, counseling provided..."></textarea>
                        </div>
                        <div className="md:col-span-2">
                            <label className={labelClasses}>Additional Notes</label>
                            <textarea rows={2} className={inputClasses} placeholder="Any other observations..."></textarea>
                        </div>
                    </div>
                </div>

                <div className="pt-8 flex justify-end">
                    <button 
                        type="submit" 
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-medium text-sm rounded-xl shadow-sm transition-all flex items-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        <Save className="w-4 h-4" />
                        <span>{isSaving ? 'Saving...' : 'Save & Mark Complete'}</span>
                    </button>
                </div>
            </form>
        </div>
    );
};

export default HeadssForm;
