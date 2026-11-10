import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { getAdminModules, getAdminSchools } from '../../services/api';
import type { AdminModule, AdminModulePermissionReplacement, AdminSchool, CreatableAdminUserRole } from '../../types';

export interface InitialAccess {
  schools: AdminSchool[];
  permissions: AdminModulePermissionReplacement[];
  confirmed: boolean;
}
const actions = [
  ['can_view', 'View'], ['can_create', 'Create'], ['can_edit', 'Edit'],
  ['can_approve_registration', 'Review registration'], ['can_report', 'Report'],
  ['can_export', 'Export'], ['can_manage_targets', 'Manage targets'],
] as const;
const blank = { can_view: false, can_create: false, can_edit: false, can_approve_registration: false, can_report: false, can_export: false, can_manage_targets: false };
const box = 'space-y-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3';

export function InitialUserAccess({ role, access, setAccess }: {
  role: CreatableAdminUserRole;
  access: InitialAccess;
  setAccess: Dispatch<SetStateAction<InitialAccess>>;
}) {
  const [modules, setModules] = useState<AdminModule[]>();
  const [search, setSearch] = useState('');
  const [schools, setSchools] = useState<AdminSchool[]>([]);
  const [schoolError, setSchoolError] = useState(false);
  const [moduleError, setModuleError] = useState(false);
  const [moreSchools, setMoreSchools] = useState(false);
  const [schoolPage, setSchoolPage] = useState(1);
  useEffect(() => {
    let current = true;
    void getAdminModules().then(result => { if (current) setModules(result); })
      .catch(() => { if (current) setModuleError(true); });
    return () => { current = false; };
  }, []);
  useEffect(() => {
    if (role !== 'school_staff') return;
    let current = true;
    const timer = setTimeout(() => {
      void getAdminSchools({ search: search.trim() || undefined, page: schoolPage, limit: 20 }).then(result => {
        if (current) {
          setSchools(result.data);
          setMoreSchools(schoolPage * result.limit < result.total);
          setSchoolError(false);
        }
      }).catch(() => { if (current) setSchoolError(true); });
    }, 200);
    return () => { current = false; clearTimeout(timer); };
  }, [role, search, schoolPage]);
  function toggleSchool(school: AdminSchool) {
    setAccess(previous => ({
      ...previous, confirmed: false,
      schools: previous.schools.some(item => item.id === school.id)
        ? previous.schools.filter(item => item.id !== school.id) : [...previous.schools, school],
    }));
  }
  return <div className="space-y-4 text-sm">
    {role === 'school_staff' ? <fieldset className={box}>
      <legend className="font-semibold px-1">School assignments</legend>
      <label className="block">Find a school
        <input value={search} onChange={event => { setSearch(event.target.value); setSchoolPage(1); }}
          className="mt-1 block w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-surface-input p-2" />
      </label>
      {schoolError ? <p role="alert">Could not load schools.</p> :
        <div className="max-h-36 overflow-auto space-y-2">{schools.filter(school => school.is_active).map(school => (
          <label key={school.id} className="flex items-start gap-2"><input type="checkbox" checked={access.schools.some(item => item.id === school.id)}
            onChange={() => toggleSchool(school)} /> {school.name}{school.municipality_name ? ` · ${school.municipality_name}` : ''}</label>
        ))}</div>}
      <div className="flex gap-3 text-teal-700 dark:text-teal-300">
        <button type="button" disabled={schoolPage <= 1} className="disabled:opacity-40" onClick={() => setSchoolPage(schoolPage - 1)}>Previous schools</button>
        <button type="button" disabled={!moreSchools} className="disabled:opacity-40" onClick={() => setSchoolPage(schoolPage + 1)}>More schools</button>
      </div>
      <p className="font-medium">Selected schools: {access.schools.map(school => school.name).join(', ') || 'None'}</p>
    </fieldset> : <p>Superusers are not assigned individual schools. Confirm province-wide scope for the granted modules.</p>}
    <fieldset className={box}>
      <legend className="font-semibold px-1">Module permissions</legend>
      {moduleError ? <p role="alert">Could not load modules. Reopen the account form to try again.</p> :
        !modules ? <p role="status">Loading modules…</p> : modules.map(module => (
          <details key={module.id} className="space-y-2">
            <summary className="cursor-pointer font-medium">{module.name}{!module.is_active && ' (disabled)'} · {actions.filter(([key]) =>
              access.permissions.find(permission => permission.module_id === module.id)?.[key]).length} selected</summary>
            <div className="grid sm:grid-cols-2 gap-2">
              {actions.filter(([key]) => key !== 'can_approve_registration' || (role === 'school_staff' && module.slug === 'patient-info')).map(([key, label]) => (
                <label key={key} className="flex gap-2 items-center">
                  <input type="checkbox" checked={!!access.permissions.find(permission => permission.module_id === module.id)?.[key]}
                    onChange={event => {
                      const checked = event.target.checked;
                      setAccess(previous => {
                        const existing = previous.permissions.find(permission => permission.module_id === module.id);
                        const next = { ...blank, ...existing, module_id: module.id, [key]: checked };
                        const permissions = previous.permissions.filter(permission => permission.module_id !== module.id);
                        if (actions.some(([action]) => next[action])) permissions.push(next);
                        return { ...previous, permissions, confirmed: false };
                      });
                    }} /> {label}
                </label>
              ))}
            </div>
          </details>
        ))}
      <p>Create and Edit require View. Export requires View or Report. Manage targets requires Report. No selection grants no module access.</p>
    </fieldset>
    <label className="flex items-start gap-2 rounded-xl bg-teal-50 dark:bg-teal-950/50 p-3">
      <input type="checkbox" required disabled={!modules || (role === 'school_staff' && !access.schools.length)}
        checked={access.confirmed} onChange={event => setAccess({ ...access, confirmed: event.target.checked })} />
      <span>I verified the requester’s identity and confirm the role, job title, school scope, and permissions above.</span>
    </label>
  </div>;
}
