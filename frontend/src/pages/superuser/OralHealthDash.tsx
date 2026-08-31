import React, { useState } from 'react';
import { useMockData } from '../../context/MockDataContext';
import { FilterBar } from '../../components/common/FilterBar';
import {
    Users,
    CheckCircle2,
    Clock,
    AlertCircle,
    Search,
    FileEdit,
    Smile,
    X,
    Save,
    Eye
} from 'lucide-react';

const OralHealthDash: React.FC = () => {
    const { students, moduleStatuses, updateModuleStatus } = useMockData();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Completed' | 'Pending'>('All');

    // Modal state management
    const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
    const [modalMode, setModalMode] = useState<'view' | 'edit' | 'create' | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Form state for Modal
    const [formData, setFormData] = useState({
        examDate: new Date().toISOString().split('T')[0],
        condition: '',
        permSound: 0,
        permDecayed: 0,
        permMissing: 0,
        permFilled: 0,
        primSound: 0,
        primDecayed: 0,
        primMissing: 0,
        primFilled: 0,
        remarks: '',
        treatmentPlan: '',
        treatmentRendered: '',
        consentGiven: false,
        consentNotes: ''
    });

    // Aggregate key metrics
    const totalStudents = students.length;
    const completedCount = students.filter(
        s => s.id !== undefined && moduleStatuses[s.id]?.oralHealth === 'Completed'
    ).length;
    const pendingCount = totalStudents - completedCount;

    // Filter students
    const filteredStudents = students.filter(student => {
        const matchesSearch = `${student.first_name ?? ''} ${student.last_name ?? ''}`
            .toLowerCase()
            .includes(searchTerm.toLowerCase());

        const isCompleted = student.id !== undefined && moduleStatuses[student.id]?.oralHealth === 'Completed';

        if (statusFilter === 'Completed') return matchesSearch && isCompleted;
        if (statusFilter === 'Pending') return matchesSearch && !isCompleted;
        return matchesSearch;
    });

    const activeStudent = students.find(s => s.id === selectedStudentId);

    // Computed Indices
    const permDMFT = formData.permDecayed + formData.permMissing + formData.permFilled;
    const primDMFT = formData.primDecayed + formData.primMissing + formData.primFilled;

    // Handle Open Modal
    const handleOpenModal = (studentId: number, mode: 'view' | 'edit' | 'create') => {
        setSelectedStudentId(studentId);
        setModalMode(mode);

        // Reset or populate mock form data
        if (mode === 'view' || mode === 'edit') {
            setFormData({
                examDate: '2026-02-15',
                condition: 'Good overall hygiene with slight plaque buildup',
                permSound: 24,
                permDecayed: 1,
                permMissing: 0,
                permFilled: 2,
                primSound: 0,
                primDecayed: 0,
                primMissing: 0,
                primFilled: 0,
                remarks: 'Mild gingivitis around lower molars.',
                treatmentPlan: 'Recommended prophylaxis and fluoride treatment.',
                treatmentRendered: 'OP',
                consentGiven: true,
                consentNotes: 'Parent consent signed via digital form.'
            });
        } else {
            setFormData({
                examDate: new Date().toISOString().split('T')[0],
                condition: '',
                permSound: 0,
                permDecayed: 0,
                permMissing: 0,
                permFilled: 0,
                primSound: 0,
                primDecayed: 0,
                primMissing: 0,
                primFilled: 0,
                remarks: '',
                treatmentPlan: '',
                treatmentRendered: '',
                consentGiven: false,
                consentNotes: ''
            });
        }
    };

    const handleCloseModal = () => {
        setSelectedStudentId(null);
        setModalMode(null);
    };

    // Handle Save Exam
    const handleSaveExam = (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedStudentId === null) return;

        setIsSaving(true);
        setTimeout(() => {
            updateModuleStatus(selectedStudentId, 'oralHealth', 'Completed');
            setIsSaving(false);
            handleCloseModal();
        }, 600);
    };

    const inputClasses = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all outline-none disabled:bg-slate-100 disabled:text-slate-600";
    const labelClasses = "block text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wider";

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Oral Health Dashboard</h1>
                    <p className="text-sm text-slate-500">
                        Overview of dental screenings, DMFT/dmft indices, and student records.
                    </p>
                </div>
            </div>

            <FilterBar onFilterChange={() => { }} className="mb-6" />

            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">Total Enrolled</p>
                        <h3 className="text-2xl font-bold text-slate-900">{totalStudents}</h3>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                        <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">Screened / Completed</p>
                        <h3 className="text-2xl font-bold text-slate-900">{completedCount}</h3>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                    <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                        <Clock className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">Pending Examination</p>
                        <h3 className="text-2xl font-bold text-slate-900">{pendingCount}</h3>
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center space-x-4">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                        <Smile className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-slate-500">Completion Rate</p>
                        <h3 className="text-2xl font-bold text-slate-900">
                            {totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 0}%
                        </h3>
                    </div>
                </div>
            </div>

            {/* Directory Table */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search student name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                        />
                    </div>

                    <div className="flex items-center space-x-2">
                        <button
                            onClick={() => setStatusFilter('All')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${statusFilter === 'All'
                                    ? 'bg-slate-900 text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setStatusFilter('Completed')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${statusFilter === 'Completed'
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                        >
                            Completed
                        </button>
                        <button
                            onClick={() => setStatusFilter('Pending')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${statusFilter === 'Pending'
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                        >
                            Pending
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                <th className="px-6 py-3">Student Name</th>
                                <th className="px-6 py-3">Status</th>
                                <th className="px-6 py-3">Exam Date</th>
                                <th className="px-6 py-3 text-center">DMFT Index</th>
                                <th className="px-6 py-3 text-center">dmft Index</th>
                                <th className="px-6 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                            {filteredStudents.length > 0 ? (
                                filteredStudents.map((student) => {
                                    const studentId = student.id;
                                    const isCompleted = studentId !== undefined && moduleStatuses[studentId]?.oralHealth === 'Completed';

                                    return (
                                        <tr key={studentId ?? Math.random()} className="hover:bg-slate-50/80 transition-colors">
                                            <td className="px-6 py-4 font-medium text-slate-900">
                                                {student.first_name} {student.last_name}
                                            </td>
                                            <td className="px-6 py-4">
                                                {isCompleted ? (
                                                    <span className="inline-flex items-center space-x-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        <span>Completed</span>
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center space-x-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                                                        <AlertCircle className="w-3.5 h-3.5" />
                                                        <span>Pending</span>
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-slate-500">
                                                {isCompleted ? '2026-02-15' : '--'}
                                            </td>
                                            <td className="px-6 py-4 text-center font-mono text-xs">
                                                {isCompleted ? '3' : '--'}
                                            </td>
                                            <td className="px-6 py-4 text-center font-mono text-xs">
                                                {isCompleted ? '0' : '--'}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {studentId !== undefined && (
                                                    <div className="flex items-center justify-end space-x-2">
                                                        {isCompleted ? (
                                                            <>
                                                                <button
                                                                    onClick={() => handleOpenModal(studentId, 'view')}
                                                                    className="inline-flex items-center space-x-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition-colors"
                                                                >
                                                                    <Eye className="w-3.5 h-3.5" />
                                                                    <span>View</span>
                                                                </button>
                                                                <button
                                                                    onClick={() => handleOpenModal(studentId, 'edit')}
                                                                    className="inline-flex items-center space-x-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors"
                                                                >
                                                                    <FileEdit className="w-3.5 h-3.5" />
                                                                    <span>Edit</span>
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleOpenModal(studentId, 'create')}
                                                                className="inline-flex items-center space-x-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                                                            >
                                                                <FileEdit className="w-3.5 h-3.5" />
                                                                <span>Perform Exam</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                        No students found matching the criteria.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Overlay */}
            {modalMode && activeStudent && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">
                                    {modalMode === 'view' && 'Oral Health Record'}
                                    {modalMode === 'edit' && 'Edit Oral Health Record'}
                                    {modalMode === 'create' && 'New Oral Health Screening'}
                                </h3>
                                <p className="text-xs text-slate-500">
                                    Student: <span className="font-semibold text-slate-700">{activeStudent.first_name} {activeStudent.last_name}</span>
                                </p>
                            </div>
                            <button
                                onClick={handleCloseModal}
                                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSaveExam} className="p-6 overflow-y-auto space-y-6 flex-1 text-left">
                            {/* Examination Info */}
                            <div>
                                <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">
                                    Examination Details
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClasses}>Date Examined</label>
                                        <input
                                            type="date"
                                            disabled={modalMode === 'view'}
                                            value={formData.examDate}
                                            onChange={e => setFormData({ ...formData, examDate: e.target.value })}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Oral Health Condition</label>
                                        <input
                                            type="text"
                                            disabled={modalMode === 'view'}
                                            placeholder="General condition..."
                                            value={formData.condition}
                                            onChange={e => setFormData({ ...formData, condition: e.target.value })}
                                            className={inputClasses}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Permanent Teeth */}
                            <div>
                                <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">
                                    Permanent Teeth Indices
                                </h4>
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                    <div>
                                        <label className={labelClasses}>Sound</label>
                                        <input
                                            type="number"
                                            min="0"
                                            disabled={modalMode === 'view'}
                                            value={formData.permSound}
                                            onChange={e => setFormData({ ...formData, permSound: Number(e.target.value) })}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Decayed (D)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            disabled={modalMode === 'view'}
                                            value={formData.permDecayed}
                                            onChange={e => setFormData({ ...formData, permDecayed: Number(e.target.value) })}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Missing (M)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            disabled={modalMode === 'view'}
                                            value={formData.permMissing}
                                            onChange={e => setFormData({ ...formData, permMissing: Number(e.target.value) })}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Filled (F)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            disabled={modalMode === 'view'}
                                            value={formData.permFilled}
                                            onChange={e => setFormData({ ...formData, permFilled: Number(e.target.value) })}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Total DMFT</label>
                                        <input
                                            type="number"
                                            readOnly
                                            value={permDMFT}
                                            className="w-full px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm font-bold text-blue-700 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Primary Teeth */}
                            <div>
                                <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">
                                    Primary Teeth Indices
                                </h4>
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                    <div>
                                        <label className={labelClasses}>Sound</label>
                                        <input
                                            type="number"
                                            min="0"
                                            disabled={modalMode === 'view'}
                                            value={formData.primSound}
                                            onChange={e => setFormData({ ...formData, primSound: Number(e.target.value) })}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Decayed (d)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            disabled={modalMode === 'view'}
                                            value={formData.primDecayed}
                                            onChange={e => setFormData({ ...formData, primDecayed: Number(e.target.value) })}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Missing (m)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            disabled={modalMode === 'view'}
                                            value={formData.primMissing}
                                            onChange={e => setFormData({ ...formData, primMissing: Number(e.target.value) })}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Filled (f)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            disabled={modalMode === 'view'}
                                            value={formData.primFilled}
                                            onChange={e => setFormData({ ...formData, primFilled: Number(e.target.value) })}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Total dmft</label>
                                        <input
                                            type="number"
                                            readOnly
                                            value={primDMFT}
                                            className="w-full px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm font-bold text-blue-700 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Diagnosis & Treatment */}
                            <div>
                                <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">
                                    Diagnosis & Treatment
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className={labelClasses}>Remarks / Diagnosis</label>
                                        <textarea
                                            rows={2}
                                            disabled={modalMode === 'view'}
                                            placeholder="Clinical findings..."
                                            value={formData.remarks}
                                            onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className={labelClasses}>Recommended Treatment</label>
                                        <textarea
                                            rows={2}
                                            disabled={modalMode === 'view'}
                                            placeholder="Treatment plan..."
                                            value={formData.treatmentPlan}
                                            onChange={e => setFormData({ ...formData, treatmentPlan: e.target.value })}
                                            className={inputClasses}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Treatment Type Rendered</label>
                                        <select
                                            disabled={modalMode === 'view'}
                                            value={formData.treatmentRendered}
                                            onChange={e => setFormData({ ...formData, treatmentRendered: e.target.value })}
                                            className={inputClasses}
                                        >
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
                            <div>
                                <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">
                                    Consent
                                </h4>
                                <div className="space-y-4">
                                    <div className="flex items-center space-x-3 p-3 border border-slate-200 rounded-lg bg-slate-50">
                                        <input
                                            type="checkbox"
                                            id="modal_consent_given"
                                            disabled={modalMode === 'view'}
                                            checked={formData.consentGiven}
                                            onChange={e => setFormData({ ...formData, consentGiven: e.target.checked })}
                                            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                                        />
                                        <label htmlFor="modal_consent_given" className="text-sm font-medium text-slate-700">
                                            Consent Given by Parent/Guardian
                                        </label>
                                    </div>
                                    <div>
                                        <label className={labelClasses}>Consent Notes</label>
                                        <textarea
                                            rows={2}
                                            disabled={modalMode === 'view'}
                                            placeholder="Additional notes regarding consent..."
                                            value={formData.consentNotes}
                                            onChange={e => setFormData({ ...formData, consentNotes: e.target.value })}
                                            className={inputClasses}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer Controls */}
                            <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm rounded-xl transition-colors"
                                >
                                    {modalMode === 'view' ? 'Close' : 'Cancel'}
                                </button>
                                {modalMode !== 'view' && (
                                    <button
                                        type="submit"
                                        disabled={isSaving}
                                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-xl shadow-sm transition-colors flex items-center space-x-2 disabled:opacity-70"
                                    >
                                        <Save className="w-4 h-4" />
                                        <span>{isSaving ? 'Saving...' : 'Save Record'}</span>
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OralHealthDash;