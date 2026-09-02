import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useMockData } from '../../context/MockDataContext';
import { ArrowLeft, Save, CheckCircle2 } from 'lucide-react';

type ConditionsState = Record<string, boolean[]>;

const initialConditions: ConditionsState = {
    c: [false, false, false, false, false], // Dental Caries
    g: [false, false, false, false, false], // Gingivitis
    d: [false, false, false, false, false], // Debris
    ca: [false, false, false, false, false], // Calculus
    a: [false, false, false, false, false], // Abnormal Growth
    cl: [false, false, false, false, false], // Cleft Lip/Palate
    o: [false, false, false, false, false], // Others
};

const conditionLabels: Record<string, string> = {
    c: 'Dental Caries',
    g: 'Gingivitis',
    d: 'Debris',
    ca: 'Calculus (Ill-Heavy; M-Moderate; L-Light)',
    a: 'Abnormal Growth',
    cl: 'Cleft Lip/Palate',
    o: 'Others(supernumerary/mesiodens, malocclusion etc)'
};

const OralHealthForm: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { students, moduleStatuses, updateModuleStatus } = useMockData();
    const [isSaving, setIsSaving] = useState(false);

    const student = students.find(s => s.id === Number(id));
    const status = moduleStatuses[Number(id)]?.oralHealth;

    const [conditions, setConditions] = useState<ConditionsState>(initialConditions);
    const [toothChartUpper, setToothChartUpper] = useState<Record<string, boolean>>({});
    const [toothChartLower, setToothChartLower] = useState<Record<string, boolean>>({});

    // Indices state
    const [permIndices, setPermIndices] = useState({ total: '', sound: '', decayed: '', missing: '', filled: '' });
    const [priIndices, setPriIndices] = useState({ total: '', sound: '', decayed: '', missing: '', filled: '' });

    if (!student) return <div>Student not found</div>;

    const calculateAge = (dob: string) => {
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    };

    const age = student.date_of_birth ? calculateAge(student.date_of_birth) : 0;
    const showPrimary = age <= 9;
    const showPermanent = age >= 5;

    const handleConditionChange = (key: string, index: number, checked: boolean) => {
        setConditions(prev => {
            const newArr = [...prev[key]];
            newArr[index] = checked;
            return { ...prev, [key]: newArr };
        });
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        // Serialize conditions to a compact string that fits in VARCHAR(100)
        // Format: {"c":"10000","g":"00000"...}
        const serializedConditions = Object.entries(conditions).reduce((acc, [k, v]) => {
            acc[k] = v.map(b => b ? '1' : '0').join('');
            return acc;
        }, {} as Record<string, string>);

        const finalConditionString = JSON.stringify(serializedConditions);
        // Ensure it doesn't exceed 100 chars (it should be around 85 chars)
        console.log('Serialized conditions string length:', finalConditionString.length);

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

    const renderToothRow = (label: string, teeth: string[], chartState: Record<string, boolean>, setChartState: React.Dispatch<React.SetStateAction<Record<string, boolean>>>) => (
        <div className="mb-6 overflow-x-auto">
            <h3 className="text-sm font-semibold text-slate-600 mb-2">{label}</h3>
            <div className="flex gap-1 min-w-max">
                {teeth.map(tooth => (
                    <div key={tooth} className="flex flex-col items-center">
                        <div className="w-10 h-8 flex items-center justify-center bg-slate-100 border border-slate-300 font-medium text-sm text-slate-700 rounded-t">
                            {tooth}
                        </div>
                        <div className="w-10 h-10 border-x border-b border-slate-300 flex items-center justify-center rounded-b bg-white">
                            <input
                                type="checkbox"
                                className="w-5 h-5 text-blue-600 rounded border-slate-300"
                                checked={!!chartState[tooth]}
                                onChange={(e) => setChartState(prev => ({ ...prev, [tooth]: e.target.checked }))}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const permTeethUpper = ['18', '17', '16', '15', '14', '13', '12', '11', '21', '22', '23', '24', '25', '26', '27', '28'];
    const permTeethLower = ['48', '47', '46', '45', '44', '43', '42', '41', '31', '32', '33', '34', '35', '36', '37', '38'];

    const priTeethUpper = ['55', '54', '53', '52', '51', '61', '62', '63', '64', '65'];
    const priTeethLower = ['85', '84', '83', '82', '81', '71', '72', '73', '74', '75'];

    return (
        <div className="space-y-6 pb-12">
            <Link to={`/teacher/students/${id}`} className="text-sm text-slate-500 hover:text-blue-600 flex items-center transition-colors w-fit">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Student Profile
            </Link>

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Oral Health</h1>
                    <p className="text-sm text-slate-500">For {student.first_name} {student.last_name} (Age: {age})</p>
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
                            <label className={labelClasses}>Date of Oral Examination</label>
                            <input type="date" className={inputClasses} required />
                        </div>
                    </div>
                </div>

                {/* Oral Health Condition Table */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Oral Health Condition</h2>
                    <p className="text-xs text-slate-500 mb-4">Check (✓) if present, Leave unchecked if absent.</p>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
                                <tr>
                                    <th className="px-4 py-3 font-semibold w-1/2">Condition</th>
                                    {[1, 2, 3, 4, 5].map(v => (
                                        <th key={v} className="px-2 py-3 font-semibold text-center border-l border-slate-200">Visit {v}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(conditions).map(([key, checks], idx) => (
                                    <tr key={key} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                        <td className="px-4 py-2 border-b border-slate-100 font-medium text-slate-700">{conditionLabels[key]}</td>
                                        {checks.map((isChecked, vIdx) => (
                                            <td key={vIdx} className="px-2 py-2 border-b border-l border-slate-100 text-center">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 text-blue-600 rounded border-slate-300"
                                                    checked={isChecked}
                                                    onChange={(e) => handleConditionChange(key, vIdx, e.target.checked)}
                                                />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Tooth Chart */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Tooth Chart</h2>

                    {showPermanent && (
                        <div className="mb-8">
                            <h3 className="text-md font-medium text-slate-800 mb-3 border-l-4 border-blue-500 pl-2">Permanent Teeth</h3>
                            {renderToothRow('Upper', permTeethUpper, toothChartUpper, setToothChartUpper)}
                            {renderToothRow('Lower', permTeethLower, toothChartLower, setToothChartLower)}
                        </div>
                    )}

                    {showPrimary && (
                        <div>
                            <h3 className="text-md font-medium text-slate-800 mb-3 border-l-4 border-teal-500 pl-2">Primary Teeth</h3>
                            {renderToothRow('Upper', priTeethUpper, toothChartUpper, setToothChartUpper)}
                            {renderToothRow('Lower', priTeethLower, toothChartLower, setToothChartLower)}
                        </div>
                    )}
                </div>

                {/* Indices layout adjusted to match paper form visually */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Indicators</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Permanent Indices */}
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 font-semibold text-slate-700 text-center">
                                Permanent Teeth
                            </div>
                            <div className="p-4 space-y-3 bg-white">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">No. of Perm. Teeth</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded" value={permIndices.total} onChange={e => setPermIndices({ ...permIndices, total: e.target.value })} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">No. of Perm. Sound Teeth</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded" value={permIndices.sound} onChange={e => setPermIndices({ ...permIndices, sound: e.target.value })} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">No. of Decayed Teeth (D)</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded" value={permIndices.decayed} onChange={e => setPermIndices({ ...permIndices, decayed: e.target.value })} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">No. of Missing Teeth (M)</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded" value={permIndices.missing} onChange={e => setPermIndices({ ...permIndices, missing: e.target.value })} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">No. of Filled Teeth (F)</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded" value={permIndices.filled} onChange={e => setPermIndices({ ...permIndices, filled: e.target.value })} />
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-slate-200 mt-2">
                                    <span className="text-sm font-bold text-slate-800">Total DMFT Teeth</span>
                                    <div className="w-20 text-center font-bold text-slate-800">
                                        {(Number(permIndices.decayed || 0) + Number(permIndices.missing || 0) + Number(permIndices.filled || 0)) || 0}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Primary Indices */}
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 font-semibold text-slate-700 text-center">
                                Primary / Temp. Teeth
                            </div>
                            <div className="p-4 space-y-3 bg-white">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">No. of Temp. Teeth</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded" value={priIndices.total} onChange={e => setPriIndices({ ...priIndices, total: e.target.value })} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">No. of Temp. Sound Teeth</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded" value={priIndices.sound} onChange={e => setPriIndices({ ...priIndices, sound: e.target.value })} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">No. of Decayed Teeth (d)</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded" value={priIndices.decayed} onChange={e => setPriIndices({ ...priIndices, decayed: e.target.value })} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">No. of Missing Teeth (m)</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded" value={priIndices.missing} onChange={e => setPriIndices({ ...priIndices, missing: e.target.value })} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium">No. of Filled Teeth (f)</span>
                                    <input type="number" min="0" className="w-20 px-2 py-1 text-center bg-slate-50 border border-slate-200 rounded" value={priIndices.filled} onChange={e => setPriIndices({ ...priIndices, filled: e.target.value })} />
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-slate-200 mt-2">
                                    <span className="text-sm font-bold text-slate-800">Total dfmt Teeth</span>
                                    <div className="w-20 text-center font-bold text-slate-800">
                                        {(Number(priIndices.decayed || 0) + Number(priIndices.missing || 0) + Number(priIndices.filled || 0)) || 0}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Procedure & Treatment */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Treatment & Diagnosis</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                            <label className={labelClasses}>Remarks / Notation</label>
                            <textarea rows={2} className={inputClasses} placeholder="Clinical findings..."></textarea>
                        </div>
                        <div>
                            <label className={labelClasses}>Primary Procedure/Treatment Rendered</label>
                            <select className={inputClasses}>
                                <option value="">Select treatment...</option>
                                <option value="OP">Oral Prophylaxis (OP)</option>
                                <option value="FF">Fissure Sealant (FF)</option>
                                <option value="TF">Topical Fluoride (TF)</option>
                                <option value="FL">Fluoride Varnish (FL)</option>
                                <option value="DS">Dental Sealant (DS)</option>
                                <option value="EXO">Extraction (EXO)</option>
                                <option value="Others">Other Treatment</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Consent */}
                <div className={sectionClasses}>
                    <h2 className={sectionTitleClasses}>Consent</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg bg-slate-50 h-[fit-content]">
                            <input type="checkbox" id="consent_given" className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                            <label htmlFor="consent_given" className="text-sm font-medium text-slate-700">Consent Given by Parent/Guardian</label>
                        </div>
                        <div>
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
