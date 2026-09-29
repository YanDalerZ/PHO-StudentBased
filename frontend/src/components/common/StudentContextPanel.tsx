import React from 'react';
import type { StudentModuleContext } from '../../types/moduleContext';

export default function StudentContextPanel({ student }: { student: StudentModuleContext }): React.JSX.Element {
    const name = [student.first_name, student.middle_name, student.last_name,
        student.suffix === 'NOT APPLICABLE' ? null : student.suffix].filter(Boolean).join(' ');
    const fields = [
        ['Student name', name], ['LRN', student.student_lrn],
        ['Date of birth', student.date_of_birth], ['Age (years)', String(student.age)],
        ['Sex', student.sex], ['School', student.school_name],
        ['Grade', student.grade_level], ['Section', student.section],
    ];
    return <section aria-label="Canonical student information" className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-surface-card">
        <h2 className="font-semibold text-slate-900 dark:text-white">Student information</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Shared from Patient Information. Corrections require Patient Information edit access.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {fields.map(([label, value]) => <label key={label} className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {label}<input readOnly value={value ?? 'Not provided'} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 dark:border-white/10 dark:bg-surface-input dark:text-slate-200" />
            </label>)}
        </div>
    </section>;
}
