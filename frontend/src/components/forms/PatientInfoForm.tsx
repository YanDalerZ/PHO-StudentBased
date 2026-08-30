import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMockData } from '../../context/MockDataContext';
import { ArrowLeft, Save, CheckCircle2, User, Stethoscope, Brain, PawPrint } from 'lucide-react';
import { cn } from '../../lib/utils';

const PatientInfoForm: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { students, moduleStatuses, updateModuleStatus } = useMockData();
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'basic' | 'consultation' | 'mental' | 'animal'>('basic');
    
    const student = students.find(s => s.id === Number(id));
    const status = moduleStatuses[Number(id)]?.patientInfo;

    if (!student) return <div>Student not found</div>;

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setTimeout(() => {
            updateModuleStatus(Number(id), 'patientInfo', 'Completed');
            setIsSaving(false);
            navigate(`/teacher/students/${id}`);
        }, 800);
    };

    const inputClasses = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 transition-all";
    const labelClasses = "block text-sm font-medium text-slate-700 mb-1";
    const sectionClasses = "space-y-6 pt-6 mt-6 border-t border-slate-100";
    const sectionTitleClasses = "text-lg font-semibold text-slate-800 mb-4";

    const tabs = [
        { id: 'basic', label: 'Basic Info', icon: User },
        { id: 'consultation', label: 'Consultation', icon: Stethoscope },
        { id: 'mental', label: 'Mental Health', icon: Brain },
        { id: 'animal', label: 'Animal Bite', icon: PawPrint },
    ] as const;

    return (
        <div className="space-y-6 pb-12">
            <Link to={`/teacher/students/${id}`} className="text-sm text-slate-500 hover:text-teal-600 flex items-center transition-colors w-fit">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Student Profile
            </Link>

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Patient Information</h1>
                    <p className="text-sm text-slate-500">For {student.first_name} {student.last_name}</p>
                </div>
                {status === 'Completed' && (
                    <span className="flex items-center space-x-1 text-sm font-medium text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Completed</span>
                    </span>
                )}
            </div>

            {/* Tabs Navigation */}
            <div className="flex space-x-1 bg-white p-1 rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as typeof activeTab)}
                        className={cn(
                            "flex items-center px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap",
                            activeTab === tab.id 
                                ? "bg-teal-50 text-teal-700 shadow-sm" 
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        )}
                    >
                        <tab.icon className={cn(
                            "w-4 h-4 mr-2",
                            activeTab === tab.id ? "text-teal-600" : "text-slate-400"
                        )} />
                        {tab.label}
                    </button>
                ))}
            </div>

            <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                
                {/* TAB 1: BASIC INFO */}
                {activeTab === 'basic' && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        <h2 className={sectionTitleClasses}>Socio-Demographic Profile</h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className={labelClasses}>Civil Status</label>
                                <select className={inputClasses}>
                                    <option value="SINGLE">Single</option>
                                    <option value="MARRIED">Married</option>
                                    <option value="WIDOWED">Widowed</option>
                                    <option value="SEPARATED">Separated</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClasses}>Blood Type</label>
                                <select className={inputClasses}>
                                    <option value="">Select...</option>
                                    {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={labelClasses}>Educational Attainment</label>
                                <input type="text" className={inputClasses} placeholder="Current grade level..." />
                            </div>
                            <div>
                                <label className={labelClasses}>Employment Status</label>
                                <input type="text" className={inputClasses} placeholder="e.g. Student" defaultValue="Student" />
                            </div>
                            <div>
                                <label className={labelClasses}>Religion</label>
                                <input type="text" className={inputClasses} />
                            </div>
                            <div className="flex flex-col space-y-2 p-3 border border-slate-200 rounded-lg bg-slate-50">
                                <div className="flex items-center space-x-3">
                                    <input type="checkbox" id="is_indigenous" className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500" />
                                    <label htmlFor="is_indigenous" className="text-sm font-medium text-slate-700">Indigenous Person</label>
                                </div>
                                <input type="text" placeholder="Specify Indigenous Group..." className={inputClasses} />
                            </div>
                        </div>

                        <div className={sectionClasses}>
                            <h2 className={sectionTitleClasses}>Parent/Guardian (Mother's Info)</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className={labelClasses}>First Name</label>
                                    <input type="text" className={inputClasses} />
                                </div>
                                <div>
                                    <label className={labelClasses}>Last Name</label>
                                    <input type="text" className={inputClasses} />
                                </div>
                                <div>
                                    <label className={labelClasses}>Middle Name</label>
                                    <input type="text" className={inputClasses} />
                                </div>
                                <div>
                                    <label className={labelClasses}>Date of Birth</label>
                                    <input type="date" className={inputClasses} />
                                </div>
                            </div>
                        </div>

                        <div className={sectionClasses}>
                            <h2 className={sectionTitleClasses}>Other Information</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="flex flex-col space-y-2 p-3 border border-slate-200 rounded-lg bg-slate-50">
                                    <div className="flex items-center space-x-3">
                                        <input type="checkbox" id="is_4ps" className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500" />
                                        <label htmlFor="is_4ps" className="text-sm font-medium text-slate-700">4Ps Member</label>
                                    </div>
                                    <input type="text" placeholder="Household Number..." className={inputClasses} />
                                </div>
                                <div className="flex flex-col space-y-2 p-3 border border-slate-200 rounded-lg bg-slate-50">
                                    <div className="flex items-center space-x-3">
                                        <input type="checkbox" id="is_pwd" className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500" />
                                        <label htmlFor="is_pwd" className="text-sm font-medium text-slate-700">Person with Disability (PWD)</label>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <input type="text" placeholder="PWD Type..." className={inputClasses} />
                                        <input type="text" placeholder="PWD ID..." className={inputClasses} />
                                    </div>
                                </div>
                                <div>
                                    <label className={labelClasses}>PSA National ID</label>
                                    <input type="text" className={inputClasses} />
                                </div>
                                <div>
                                    <label className={labelClasses}>Tax Identification No. (TIN)</label>
                                    <input type="text" className={inputClasses} />
                                </div>
                            </div>
                        </div>

                        <div className={sectionClasses}>
                            <h2 className={sectionTitleClasses}>PhilHealth Information</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg bg-slate-50 md:col-span-2">
                                    <input type="checkbox" id="is_philhealth" className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500" />
                                    <label htmlFor="is_philhealth" className="text-sm font-medium text-slate-700">PhilHealth Member / Dependent</label>
                                </div>
                                <div>
                                    <label className={labelClasses}>PhilHealth No.</label>
                                    <input type="text" className={inputClasses} />
                                </div>
                                <div>
                                    <label className={labelClasses}>Status Type</label>
                                    <select className={inputClasses}>
                                        <option value="">Select...</option>
                                        <option value="MEMBER">Member</option>
                                        <option value="DEPENDENT">Dependent</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClasses}>Category</label>
                                    <select className={inputClasses}>
                                        <option value="">Select Category...</option>
                                        <option value="Informal Economy">Informal Economy</option>
                                        <option value="Formal Economy">Formal Economy</option>
                                        <option value="Indigent">Indigent</option>
                                        <option value="Sponsored">Sponsored</option>
                                        <option value="Lifetime">Lifetime</option>
                                        <option value="Senior Citizen">Senior Citizen</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 2: CONSULTATION */}
                {activeTab === 'consultation' && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        <h2 className={sectionTitleClasses}>Vital Signs & Consultation</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            <div>
                                <label className={labelClasses}>BP Systolic</label>
                                <input type="number" className={inputClasses} placeholder="mmHg" />
                            </div>
                            <div>
                                <label className={labelClasses}>BP Diastolic</label>
                                <input type="number" className={inputClasses} placeholder="mmHg" />
                            </div>
                            <div>
                                <label className={labelClasses}>Heart Rate</label>
                                <input type="number" className={inputClasses} placeholder="bpm" />
                            </div>
                            <div>
                                <label className={labelClasses}>Pulse Rate</label>
                                <input type="number" className={inputClasses} placeholder="bpm" />
                            </div>
                            <div>
                                <label className={labelClasses}>Respiratory Rate</label>
                                <input type="text" className={inputClasses} placeholder="cpm" />
                            </div>
                            <div>
                                <label className={labelClasses}>Body Temp</label>
                                <input type="number" step="0.1" className={inputClasses} placeholder="°C" />
                            </div>
                            <div>
                                <label className={labelClasses}>Oxygen Sat</label>
                                <input type="number" step="0.1" className={inputClasses} placeholder="%" />
                            </div>
                        </div>

                        <div className={sectionClasses}>
                            <h2 className={sectionTitleClasses}>Doctor's Order (Laboratory & Imaging)</h2>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {['Blood Chemistry', 'CBC', 'Fecalysis', 'Hematology', 'Immunology', 'Serology', 'Urinalysis', 'X-Ray', 'ECG', 'Ultrasound'].map(lab => (
                                    <label key={lab} className="flex items-center space-x-2">
                                        <input type="checkbox" className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500" />
                                        <span className="text-sm text-slate-600">{lab}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className={sectionClasses}>
                            <h2 className={sectionTitleClasses}>Diagnosis & Prescription</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className={labelClasses}>Diagnosis Type</label>
                                    <select className={inputClasses}>
                                        <option value="WORKING DIAGNOSIS">Working Diagnosis</option>
                                        <option value="FINAL DIAGNOSIS">Final Diagnosis</option>
                                        <option value="ADMITTING DIAGNOSIS">Admitting Diagnosis</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClasses}>Diagnosis Specify</label>
                                    <input type="text" className={inputClasses} placeholder="Specific diagnosis..." />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClasses}>Treatment Plan</label>
                                    <textarea rows={2} className={inputClasses}></textarea>
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClasses}>Prescription</label>
                                    <textarea rows={2} className={inputClasses}></textarea>
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClasses}>Remarks</label>
                                    <textarea rows={2} className={inputClasses}></textarea>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 3: MENTAL HEALTH */}
                {activeTab === 'mental' && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        <h2 className={sectionTitleClasses}>Mental Health (mhGAP)</h2>
                        <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg bg-slate-50 mb-6">
                            <input type="checkbox" id="mhgap_screened" className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500" />
                            <label htmlFor="mhgap_screened" className="text-sm font-medium text-slate-700">Patient has been mhGAP screened</label>
                        </div>

                        <div className="space-y-4">
                            <label className={labelClasses}>Identified Conditions</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {[
                                    'Depression', 'Psychosis', 'Epilepsy/Seizures', 
                                    'Developmental Disorders', 'Behavioral Disorder', 
                                    'Dementia', 'Alcohol Use Disorder', 'Drug Use Disorder', 
                                    'Self-Harm / Suicide'
                                ].map(condition => (
                                    <label key={condition} className="flex items-center space-x-2 p-3 border border-slate-100 rounded-lg bg-white shadow-sm hover:border-teal-200 transition-colors cursor-pointer">
                                        <input type="checkbox" className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500" />
                                        <span className="text-sm text-slate-600">{condition}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className={sectionClasses}>
                            <h2 className={sectionTitleClasses}>Follow-up & Notes</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className={labelClasses}>Follow-up Date</label>
                                    <input type="date" className={inputClasses} />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClasses}>Prescription</label>
                                    <textarea rows={2} className={inputClasses}></textarea>
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClasses}>Remarks</label>
                                    <textarea rows={2} className={inputClasses}></textarea>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 4: ANIMAL BITE */}
                {activeTab === 'animal' && (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        <h2 className={sectionTitleClasses}>Animal Bite / Rabies Exposure</h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className={labelClasses}>Date of Exposure</label>
                                <input type="date" className={inputClasses} />
                            </div>
                            <div>
                                <label className={labelClasses}>Animal Type</label>
                                <select className={inputClasses}>
                                    <option value="">Select Animal...</option>
                                    <option value="DOG">Dog</option>
                                    <option value="CAT">Cat</option>
                                    <option value="BAT">Bat</option>
                                    <option value="MONKEY">Monkey</option>
                                    <option value="OTHERS">Others</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClasses}>Rabies Exposure Category</label>
                                <select className={inputClasses}>
                                    <option value="">Select Category...</option>
                                    <option value="CATEGORY I">Category I</option>
                                    <option value="CATEGORY II">Category II</option>
                                    <option value="CATEGORY III">Category III</option>
                                </select>
                            </div>
                            <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg bg-slate-50 mt-1 md:mt-6">
                                <input type="checkbox" id="wash_bite" className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500" />
                                <label htmlFor="wash_bite" className="text-sm font-medium text-slate-700">Bite washed with soap and water</label>
                            </div>
                            <div className="md:col-span-2">
                                <label className={labelClasses}>Type of Exposure</label>
                                <input type="text" className={inputClasses} placeholder="e.g. Bite, Scratch, Lick on broken skin..." />
                            </div>
                        </div>

                        <div className={sectionClasses}>
                            <h2 className={sectionTitleClasses}>Anatomical Locations</h2>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                {['Abdomen', 'Foot', 'Forearm/Arm', 'Hand', 'Head', 'Knee', 'Legs', 'Neck'].map(loc => (
                                    <label key={loc} className="flex items-center space-x-2">
                                        <input type="checkbox" className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500" />
                                        <span className="text-sm text-slate-600">{loc}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className={sectionClasses}>
                            <h2 className={sectionTitleClasses}>Vaccine Schedule</h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div>
                                    <label className={labelClasses}>ARV Day 0</label>
                                    <input type="date" className={inputClasses} />
                                </div>
                                <div>
                                    <label className={labelClasses}>ARV Day 3</label>
                                    <input type="date" className={inputClasses} />
                                </div>
                                <div>
                                    <label className={labelClasses}>ARV Day 7</label>
                                    <input type="date" className={inputClasses} />
                                </div>
                                <div>
                                    <label className={labelClasses}>ARV Day 14</label>
                                    <input type="date" className={inputClasses} />
                                </div>
                                <div>
                                    <label className={labelClasses}>ARV Day 28</label>
                                    <input type="date" className={inputClasses} />
                                </div>
                                <div>
                                    <label className={labelClasses}>RIG Date</label>
                                    <input type="date" className={inputClasses} />
                                </div>
                            </div>
                            <div className="mt-4 flex items-center space-x-3 p-3 border border-slate-200 rounded-lg bg-amber-50">
                                <input type="checkbox" id="active_case" className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500" />
                                <label htmlFor="active_case" className="text-sm font-medium text-amber-800">Active Animal Bite Case</label>
                            </div>
                        </div>
                    </div>
                )}

                <div className="pt-8 flex justify-between items-center border-t border-slate-100 mt-8">
                    <p className="text-xs text-slate-400 max-w-sm">Saving will mark the entire Patient Info module as Completed for this student.</p>
                    <button 
                        type="submit" 
                        disabled={isSaving}
                        className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm rounded-xl shadow-sm transition-all flex items-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        <Save className="w-4 h-4" />
                        <span>{isSaving ? 'Saving...' : 'Save & Mark Complete'}</span>
                    </button>
                </div>
            </form>
        </div>
    );
};

export default PatientInfoForm;
